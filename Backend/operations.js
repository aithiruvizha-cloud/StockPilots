const express = require("express");
const router = express.Router();
const db = require("./pg-database");
const { authenticate } = require("./middleware");

router.use(authenticate);

function tenant(req) {
    if (req.user.role !== "supermarket" || !req.user.supermarketId) {
        throw new Error("Supermarket access only");
    }
    return req.user.supermarketId;
}

async function notify(client, id, type, message) {
    await client.query(
        `INSERT INTO inbox (supermarket_id,event_type,message)
         VALUES ($1,$2,$3)`,
        [id,type,message]
    );
}

async function transaction(work) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

// Dashboard
router.get("/dashboard", async (req,res) => {
    try {
        const id = tenant(req);
        const r = await db.query(`
            SELECT
              COUNT(*) AS products,
              COALESCE(SUM(current_stock),0) AS stock,
              COUNT(*) FILTER (
                WHERE current_stock <= low_stock_threshold
                  AND low_stock_threshold > 0
              ) AS "lowStock"
            FROM products WHERE supermarket_id=$1
        `,[id]);

        const sales = await db.query(`
            SELECT COALESCE(SUM(total_amount),0) AS sales
            FROM invoices
            WHERE supermarket_id=$1
              AND created_at::date=CURRENT_DATE
        `,[id]);

        res.json({
            success:true,
            products:Number(r.rows[0].products),
            stock:Number(r.rows[0].stock),
            lowStock:Number(r.rows[0].lowStock),
            todaySales:Number(sales.rows[0].sales)
        });
    } catch(e) {
        res.status(403).json({success:false,message:e.message});
    }
});

// Dealers
router.get("/dealers", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(
            "SELECT * FROM dealers WHERE supermarket_id=$1 ORDER BY name",[id]
        );
        res.json({success:true,dealers:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.post("/dealers", async (req,res) => {
    try {
        const id=tenant(req);
        const {name,phone,email}=req.body;
        if(!name) return res.status(400).json({success:false,message:"Dealer name required"});
        const r=await db.query(
            `INSERT INTO dealers(supermarket_id,name,phone,email)
             VALUES($1,$2,$3,$4) RETURNING id`,
            [id,name.trim(),phone||"",email||""]
        );
        res.status(201).json({success:true,id:r.rows[0].id});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Products
router.get("/products", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(`
            SELECT p.*,d.name AS dealer_name
            FROM products p LEFT JOIN dealers d ON d.id=p.dealer_id
            WHERE p.supermarket_id=$1 ORDER BY p.name
        `,[id]);
        res.json({success:true,products:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.post("/products", async (req,res) => {
    try {
        const id=tenant(req);
        const p=req.body;
        if(!p.name) return res.status(400).json({success:false,message:"Product name required"});

        if(p.dealer_id) {
            const d=await db.query(
                "SELECT id FROM dealers WHERE id=$1 AND supermarket_id=$2",
                [p.dealer_id,id]
            );
            if(!d.rowCount) return res.status(400).json({success:false,message:"Invalid dealer"});
        }

        const r=await db.query(`
            INSERT INTO products
            (supermarket_id,dealer_id,name,barcode,purchase_cost,mrp,
             selling_price,current_stock,low_stock_threshold,auto_order_quantity)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id
        `,[
            id,p.dealer_id||null,p.name.trim(),p.barcode||null,
            Number(p.purchase_cost)||0,Number(p.mrp)||0,
            Number(p.selling_price)||0,Number(p.quantity)||0,
            Number(p.low_stock_threshold)||0,Number(p.auto_order_quantity)||0
        ]);
        res.status(201).json({success:true,id:r.rows[0].id});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.get("/products/barcode/:barcode", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(
            "SELECT * FROM products WHERE supermarket_id=$1 AND barcode=$2",
            [id,req.params.barcode]
        );
        if(!r.rowCount) return res.status(404).json({success:false,message:"Barcode not found"});
        res.json({success:true,product:r.rows[0]});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Stock adjustment
router.post("/stock/adjust", async (req,res) => {
    try {
        const id=tenant(req);
        const {product_id,quantity,reason}=req.body;
        const change=Number(quantity);
        if(!Number.isFinite(change)||change===0)
            return res.status(400).json({success:false,message:"Invalid quantity"});

        const result=await transaction(async client=>{
            const r=await client.query(`
                UPDATE products
                SET current_stock=current_stock+$1
                WHERE id=$2 AND supermarket_id=$3
                  AND current_stock+$1>=0
                RETURNING name,current_stock
            `,[change,product_id,id]);

            if(!r.rowCount) throw new Error("Product not found or insufficient stock");

            await notify(client,id,"stock",
                `${r.rows[0].name}: stock adjusted by ${change}. ${reason||""}`);
            return Number(r.rows[0].current_stock);
        });

        res.json({success:true,newStock:result});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Low-stock purchase orders
router.post("/stock/check-low", async (req,res) => {
    try {
        const id=tenant(req);
        const result=await transaction(async client=>{
            const products=await client.query(`
                SELECT * FROM products
                WHERE supermarket_id=$1
                  AND current_stock<=low_stock_threshold
                  AND low_stock_threshold>0
                  AND dealer_id IS NOT NULL
                FOR UPDATE
            `,[id]);

            const orders=[];
            for(const p of products.rows) {
                if(Number(p.auto_order_quantity)<=0) continue;

                const existing=await client.query(`
                    SELECT id FROM purchase_orders
                    WHERE supermarket_id=$1 AND product_id=$2
                      AND status IN ('created','sent','accepted','dispatched')
                `,[id,p.id]);

                if(existing.rowCount) continue;

                const order=await client.query(`
                    INSERT INTO purchase_orders
                    (supermarket_id,dealer_id,product_id,quantity,status)
                    VALUES($1,$2,$3,$4,'created') RETURNING id
                `,[id,p.dealer_id,p.id,p.auto_order_quantity]);

                orders.push(order.rows[0].id);
                await notify(client,id,"purchase_order",
                    `Automatic order created for ${p.name}: ${p.auto_order_quantity}`);
            }
            return {count:products.rowCount,orders};
        });

        res.json({success:true,lowStockProducts:result.count,ordersCreated:result.orders});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Purchase orders
router.get("/orders", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(`
            SELECT o.*,p.name AS product_name,d.name AS dealer_name,
                   d.email AS dealer_email
            FROM purchase_orders o
            JOIN products p ON p.id=o.product_id
            JOIN dealers d ON d.id=o.dealer_id
            WHERE o.supermarket_id=$1 ORDER BY o.id DESC
        `,[id]);
        res.json({success:true,orders:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.patch("/orders/:id/response", async (req,res) => {
    try {
        const id=tenant(req);
        const {status}=req.body;
        if(!["accepted","rejected"].includes(status))
            return res.status(400).json({success:false,message:"Use accepted or rejected"});

        const result=await transaction(async client=>{
            const r=await client.query(`
                UPDATE purchase_orders
                SET status=$1,dealer_response_at=CURRENT_TIMESTAMP
                WHERE id=$2 AND supermarket_id=$3
                  AND status IN ('created','sent')
                RETURNING id
            `,[status,req.params.id,id]);

            if(!r.rowCount) return false;
            await notify(client,id,"dealer_response",
                `Purchase order ${req.params.id} was ${status}`);
            return true;
        });

        if(!result) return res.status(404).json({success:false,message:"Order not found or already processed"});
        res.json({success:true});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.post("/orders/:id/received", async (req,res) => {
    try {
        const id=tenant(req);
        await transaction(async client=>{
            const r=await client.query(`
                SELECT * FROM purchase_orders
                WHERE id=$1 AND supermarket_id=$2
                  AND status IN ('accepted','dispatched')
                FOR UPDATE
            `,[req.params.id,id]);

            if(!r.rowCount) throw new Error("Accepted order not found");
            const order=r.rows[0];

            await client.query(`
                UPDATE products SET current_stock=current_stock+$1
                WHERE id=$2 AND supermarket_id=$3
            `,[order.quantity,order.product_id,id]);

            await client.query(`
                UPDATE purchase_orders
                SET status='received',received_at=CURRENT_TIMESTAMP
                WHERE id=$1
            `,[order.id]);

            await notify(client,id,"goods_received",
                `Goods received for purchase order ${order.id}`);
        });

        res.json({success:true,message:"Stock updated after receipt confirmation"});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Billing
router.post("/billing", async (req,res) => {
    try {
        const id = tenant(req);
        const { items, customer_email, payment_method } = req.body;

        if (!Array.isArray(items) || !items.length)
            return res.status(400).json({success:false,message:"Add bill items"});

        const result = await transaction(async client => {
            const quantities = new Map();

            for (const item of items) {
                const productId = String(item.product_id || "");
                const qty = Number(item.quantity);

                if (!productId || !Number.isFinite(qty) || qty <= 0)
                    throw new Error("Invalid product or quantity");

                quantities.set(productId, (quantities.get(productId) || 0) + qty);
            }

            const checked = [];
            let total = 0;

            const productIds = [...quantities.keys()].sort((a,b) => Number(a)-Number(b));

            for (const productId of productIds) {
                const qty = quantities.get(productId);
                const r = await client.query(
                    "SELECT * FROM products WHERE id=$1 AND supermarket_id=$2 FOR UPDATE",
                    [productId, id]
                );

                if (!r.rowCount || Number(r.rows[0].current_stock) < qty)
                    throw new Error("Invalid product or insufficient stock: " + productId);

                const p = r.rows[0];
                const price = Number(p.selling_price);
                total += price * qty;
                checked.push({p, qty, price});
            }

            const invoiceNumber = "SP-" + Date.now();
            const invoice = await client.query(
                "INSERT INTO invoices (supermarket_id,invoice_number,customer_email,total_amount,payment_method) VALUES($1,$2,$3,$4,$5) RETURNING id",
                [id, invoiceNumber, customer_email || null, total, payment_method || "Cash"]
            );

            for (const x of checked) {
                await client.query(
                    "INSERT INTO invoice_items (invoice_id,product_id,product_name,quantity,unit_price) VALUES($1,$2,$3,$4,$5)",
                    [invoice.rows[0].id, x.p.id, x.p.name, x.qty, x.price]
                );

                const update = await client.query(
                    "UPDATE products SET current_stock=current_stock-$1 WHERE id=$2 AND supermarket_id=$3 AND current_stock >= $1",
                    [x.qty, x.p.id, id]
                );

                if (!update.rowCount)
                    throw new Error("Stock changed during billing. Please retry.");
            }

            await notify(client, id, "sale",
                "Invoice " + invoiceNumber + " completed. Total ₹" + total.toFixed(2));

            return {invoiceId:invoice.rows[0].id, invoiceNumber, total};
        });

        res.status(201).json({success:true,...result});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});
// Invoice history
router.get("/invoices", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(
            "SELECT * FROM invoices WHERE supermarket_id=$1 ORDER BY id DESC",[id]
        );
        res.json({success:true,invoices:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.get("/invoices/:id", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(
            "SELECT * FROM invoices WHERE id=$1 AND supermarket_id=$2",
            [req.params.id,id]
        );
        if(!r.rowCount) return res.status(404).json({success:false,message:"Invoice not found"});

        const items=await db.query(
            "SELECT product_name,quantity,unit_price FROM invoice_items WHERE invoice_id=$1",
            [r.rows[0].id]
        );
        res.json({success:true,invoice:{...r.rows[0],items:items.rows}});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Inbox
router.get("/inbox", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(
            "SELECT * FROM inbox WHERE supermarket_id=$1 ORDER BY id DESC",[id]
        );
        res.json({success:true,messages:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

// Reports
router.get("/reports/sales", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(`
            SELECT created_at::date AS day,COUNT(*) AS invoices,
                   SUM(total_amount) AS total
            FROM invoices WHERE supermarket_id=$1
            GROUP BY created_at::date ORDER BY day DESC LIMIT 90
        `,[id]);
        res.json({success:true,report:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

router.get("/reports/stock", async (req,res) => {
    try {
        const id=tenant(req);
        const r=await db.query(`
            SELECT name,barcode,current_stock,low_stock_threshold,
                   auto_order_quantity,mrp,selling_price
            FROM products WHERE supermarket_id=$1 ORDER BY name
        `,[id]);
        res.json({success:true,products:r.rows});
    } catch(e) {
        res.status(400).json({success:false,message:e.message});
    }
});

module.exports=router;
