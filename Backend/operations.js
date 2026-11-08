const express = require("express");
const router = express.Router();
const db = require("./database");
const { authenticate } = require("./middleware");

router.use(authenticate);

function tenant(req) {
    if (req.user.role !== "supermarket" || !req.user.supermarketId) {
        throw new Error("Supermarket access only");
    }
    return Number(req.user.supermarketId);
}

function notify(id, type, message) {
    db.prepare(`
        INSERT INTO inbox (supermarket_id,event_type,message)
        VALUES (?,?,?)
    `).run(id, type, message);
}

// Dashboard
router.get("/dashboard", (req,res) => {
    try {
        const id = tenant(req);
        const products = db.prepare(
            "SELECT COUNT(*) n FROM products WHERE supermarket_id=?"
        ).get(id).n;
        const stock = db.prepare(
            "SELECT COALESCE(SUM(current_stock),0) n FROM products WHERE supermarket_id=?"
        ).get(id).n;
        const low = db.prepare(`
            SELECT COUNT(*) n FROM products
            WHERE supermarket_id=? AND current_stock<=low_stock_threshold
        `).get(id).n;
        const sales = db.prepare(`
            SELECT COALESCE(SUM(total_amount),0) n FROM invoices
            WHERE supermarket_id=? AND date(created_at)=date('now','localtime')
        `).get(id).n;
        res.json({success:true,products,stock,lowStock:low,todaySales:sales});
    } catch(e) { res.status(403).json({success:false,message:e.message}); }
});

// Dealers
router.get("/dealers",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,dealers:db.prepare(
            "SELECT * FROM dealers WHERE supermarket_id=? ORDER BY name"
        ).all(id)});
    } catch(e){res.status(403).json({success:false,message:e.message});}
});

router.post("/dealers",(req,res)=>{
    try {
        const id=tenant(req);
        const {name,phone,email}=req.body;
        if(!name) return res.status(400).json({success:false,message:"Dealer name required"});
        const r=db.prepare(
            "INSERT INTO dealers(supermarket_id,name,phone,email) VALUES(?,?,?,?)"
        ).run(id,name.trim(),phone||"",email||"");
        res.status(201).json({success:true,id:Number(r.lastInsertRowid)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

// Products
router.get("/products",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,products:db.prepare(`
            SELECT p.*,d.name dealer_name
            FROM products p LEFT JOIN dealers d ON d.id=p.dealer_id
            WHERE p.supermarket_id=? ORDER BY p.name
        `).all(id)});
    }catch(e){res.status(403).json({success:false,message:e.message});}
});

router.post("/products",(req,res)=>{
    try {
        const id=tenant(req);
        const p=req.body;
        if(!p.name) return res.status(400).json({success:false,message:"Product name required"});
        if(p.dealer_id && !db.prepare(
            "SELECT id FROM dealers WHERE id=? AND supermarket_id=?"
        ).get(p.dealer_id,id)) return res.status(400).json({success:false,message:"Invalid dealer"});
        const r=db.prepare(`
            INSERT INTO products
            (supermarket_id,dealer_id,name,barcode,purchase_cost,mrp,
             selling_price,current_stock,low_stock_threshold,auto_order_quantity)
            VALUES(?,?,?,?,?,?,?,?,?,?)
        `).run(id,p.dealer_id||null,p.name,p.barcode||null,
            Number(p.purchase_cost)||0,Number(p.mrp)||0,
            Number(p.selling_price)||0,Number(p.quantity)||0,
            Number(p.low_stock_threshold)||0,Number(p.auto_order_quantity)||0);
        res.status(201).json({success:true,id:Number(r.lastInsertRowid)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/products/barcode/:barcode",(req,res)=>{
    try {
        const id=tenant(req);
        const product=db.prepare(
            "SELECT * FROM products WHERE supermarket_id=? AND barcode=?"
        ).get(id,req.params.barcode);
        if(!product) return res.status(404).json({success:false,message:"Barcode not found"});
        res.json({success:true,product});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

// Stock adjustment and automatic purchase order
router.post("/stock/adjust",(req,res)=>{
    try {
        const id=tenant(req);
        const {product_id,quantity,reason}=req.body;
        const change=Number(quantity);
        if(!Number.isFinite(change)||change===0)
            return res.status(400).json({success:false,message:"Invalid quantity"});
        const product=db.prepare(
            "SELECT * FROM products WHERE id=? AND supermarket_id=?"
        ).get(product_id,id);
        if(!product) return res.status(404).json({success:false,message:"Product not found"});
        if(product.current_stock+change<0)
            return res.status(400).json({success:false,message:"Insufficient stock"});
        db.prepare("UPDATE products SET current_stock=current_stock+? WHERE id=? AND supermarket_id=?")
          .run(change,product_id,id);
        notify(id,"stock",`${product.name}: stock adjusted by ${change}. ${reason||""}`);
        res.json({success:true,newStock:product.current_stock+change});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

function createOrder(id,p) {
    if(!p.dealer_id || !p.auto_order_quantity) return null;
    const existing=db.prepare(`
        SELECT id FROM purchase_orders
        WHERE supermarket_id=? AND product_id=? AND status IN ('created','sent','accepted','dispatched')
    `).get(id,p.id);
    if(existing) return null;
    const r=db.prepare(`
        INSERT INTO purchase_orders(supermarket_id,dealer_id,product_id,quantity,status)
        VALUES(?,?,?,?,'created')
    `).run(id,p.dealer_id,p.id,p.auto_order_quantity);
    notify(id,"purchase_order",`Automatic order created for ${p.name}: ${p.auto_order_quantity}`);
    return Number(r.lastInsertRowid);
}

router.post("/stock/check-low",(req,res)=>{
    try {
        const id=tenant(req);
        const products=db.prepare(`
            SELECT * FROM products WHERE supermarket_id=?
            AND current_stock<=low_stock_threshold AND low_stock_threshold>0
        `).all(id);
        const orders=[];
        for(const p of products){
            const orderId=createOrder(id,p);
            if(orderId) orders.push(orderId);
        }
        res.json({success:true,lowStockProducts:products.length,ordersCreated:orders});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

// Purchase orders
router.get("/orders",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,orders:db.prepare(`
            SELECT o.*,p.name product_name,d.name dealer_name,d.email dealer_email
            FROM purchase_orders o
            JOIN products p ON p.id=o.product_id
            JOIN dealers d ON d.id=o.dealer_id
            WHERE o.supermarket_id=? ORDER BY o.id DESC
        `).all(id)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.patch("/orders/:id/response",(req,res)=>{
    try {
        const id=tenant(req);
        const {status}=req.body;
        if(!["accepted","rejected"].includes(status))
            return res.status(400).json({success:false,message:"Use accepted or rejected"});
        const r=db.prepare(`
            UPDATE purchase_orders SET status=?,dealer_response_at=datetime('now')
            WHERE id=? AND supermarket_id=? AND status IN ('created','sent')
        `).run(status,req.params.id,id);
        if(!r.changes) return res.status(404).json({success:false,message:"Order not found or already processed"});
        notify(id,"dealer_response",`Purchase order ${req.params.id} was ${status}`);
        res.json({success:true});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.post("/orders/:id/received",(req,res)=>{
    try {
        const id=tenant(req);
        const order=db.prepare(`
            SELECT * FROM purchase_orders
            WHERE id=? AND supermarket_id=? AND status IN ('accepted','dispatched')
        `).get(req.params.id,id);
        if(!order) return res.status(404).json({success:false,message:"Accepted order not found"});
        const transaction=db.transaction(()=>{
            db.prepare("UPDATE products SET current_stock=current_stock+? WHERE id=? AND supermarket_id=?")
              .run(order.quantity,order.product_id,id);
            db.prepare("UPDATE purchase_orders SET status='received',received_at=datetime('now') WHERE id=?")
              .run(order.id);
            notify(id,"goods_received",`Goods received for purchase order ${order.id}`);
        });
        transaction();
        res.json({success:true,message:"Stock updated after receipt confirmation"});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

// Billing
router.post("/billing",(req,res)=>{
    try {
        const id=tenant(req);
        const {items,customer_email,payment_method}=req.body;
        if(!Array.isArray(items)||!items.length)
            return res.status(400).json({success:false,message:"Add bill items"});
        const invoiceNumber="SP-"+Date.now();
        const transaction=db.transaction(()=>{
            let total=0;
            const checked=[];
            for(const item of items){
                const p=db.prepare(
                    "SELECT * FROM products WHERE id=? AND supermarket_id=?"
                ).get(item.product_id,id);
                const qty=Number(item.quantity);
                if(!p||!Number.isFinite(qty)||qty<=0||p.current_stock<qty)
                    throw new Error("Invalid product or insufficient stock");
                const price=Number(p.selling_price);
                total+=price*qty;
                checked.push({p,qty,price});
            }
            const invoice=db.prepare(`
                INSERT INTO invoices(supermarket_id,invoice_number,customer_email,total_amount,payment_method)
                VALUES(?,?,?,?,?)
            `).run(id,invoiceNumber,customer_email||null,total,payment_method||"Cash");
            for(const x of checked){
                db.prepare(`
                    INSERT INTO invoice_items(invoice_id,product_id,product_name,quantity,unit_price)
                    VALUES(?,?,?,?,?)
                `).run(Number(invoice.lastInsertRowid),x.p.id,x.p.name,x.qty,x.price);
                db.prepare("UPDATE products SET current_stock=current_stock-? WHERE id=?")
                  .run(x.qty,x.p.id);
            }
            notify(id,"sale",`Invoice ${invoiceNumber} completed. Total ₹${total.toFixed(2)}`);
            return {invoiceId:Number(invoice.lastInsertRowid),invoiceNumber,total};
        });
        res.status(201).json({success:true,...transaction()});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/invoices",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,invoices:db.prepare(
            "SELECT * FROM invoices WHERE supermarket_id=? ORDER BY id DESC"
        ).all(id)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/invoices/:id",(req,res)=>{
    try {
        const id=tenant(req);
        const invoice=db.prepare(
            "SELECT * FROM invoices WHERE id=? AND supermarket_id=?"
        ).get(req.params.id,id);
        if(!invoice) return res.status(404).json({success:false,message:"Invoice not found"});
        invoice.items=db.prepare(
            "SELECT product_name,quantity,unit_price FROM invoice_items WHERE invoice_id=?"
        ).all(invoice.id);
        res.json({success:true,invoice});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

// Inbox and reports
router.get("/inbox",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,messages:db.prepare(
            "SELECT * FROM inbox WHERE supermarket_id=? ORDER BY id DESC"
        ).all(id)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/reports/sales",(req,res)=>{
    try {
        const id=tenant(req);
        const rows=db.prepare(`
            SELECT date(created_at) day,COUNT(*) invoices,
            SUM(total_amount) total
            FROM invoices WHERE supermarket_id=?
            GROUP BY date(created_at) ORDER BY day DESC LIMIT 90
        `).all(id);
        res.json({success:true,report:rows});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

router.get("/reports/stock",(req,res)=>{
    try {
        const id=tenant(req);
        res.json({success:true,products:db.prepare(`
            SELECT name,barcode,current_stock,low_stock_threshold,
            auto_order_quantity,mrp,selling_price
            FROM products WHERE supermarket_id=? ORDER BY name
        `).all(id)});
    }catch(e){res.status(400).json({success:false,message:e.message});}
});

module.exports=router;
