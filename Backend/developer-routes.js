const express = require("express");
const router = express.Router();
const db = require("./pg-database");
const { hashPassword, verifyPassword, createToken, verifyToken } = require("./auth");

async function developerOnly(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token) return res.status(401).json({success:false,message:"Login required"});
        const user = verifyToken(token);
        if (user.role !== "developer") return res.status(403).json({success:false,message:"Developer access required"});
        req.developer = user;
        next();
    } catch {
        res.status(401).json({success:false,message:"Invalid or expired login"});
    }
}

router.post("/login", async (req, res) => {
    try {
        const {email, password} = req.body;
        if (!email || !password) return res.status(400).json({success:false,message:"Enter email and password"});
        const result = await db.query(
            "SELECT id,email,password_hash FROM developer_accounts WHERE LOWER(email)=LOWER($1)",
            [email.trim()]
        );
        const developer = result.rows[0];
        if (!developer || !(await verifyPassword(password, developer.password_hash))) {
            return res.status(401).json({success:false,message:"Invalid developer credentials"});
        }
        const token = createToken({id:developer.id,role:"developer"});
        res.json({success:true,token,message:"Developer login successful"});
    } catch (e) {
        res.status(500).json({success:false,message:e.message});
    }
});

router.use(developerOnly);

router.get("/users", async (req,res) => {
    try {
        const result = await db.query(
            `SELECT id, name AS supermarket_name, owner_name, email, is_active, created_at
             FROM supermarkets ORDER BY id DESC`
        );
        res.json({success:true,users:result.rows});
    } catch(e) {
        res.status(500).json({success:false,message:e.message});
    }
});

router.post("/users", async (req,res) => {
    try {
        const {name, email, password, supermarketName} = req.body;
        if (!name || !email || !password || !supermarketName) {
            return res.status(400).json({success:false,message:"Enter user name, email, password and supermarket name"});
        }
        if (password.length < 8) {
            return res.status(400).json({success:false,message:"Password must contain at least 8 characters"});
        }
        const passwordHash = await hashPassword(password);
        const result = await db.query(
            `INSERT INTO supermarkets (name, owner_name, email, password_hash, is_active)
             VALUES ($1,$2,$3,$4,TRUE)
             RETURNING id,name,owner_name,email,is_active,created_at`,
            [supermarketName.trim(), name.trim(), email.trim().toLowerCase(), passwordHash]
        );
        res.status(201).json({success:true,user:result.rows[0],message:"User created successfully"});
    } catch(e) {
        const duplicate = e.code === "23505";
        res.status(duplicate ? 409 : 500).json({
            success:false,
            message:duplicate ? "This email is already registered" : e.message
        });
    }
});

router.patch("/users/:id/status", async (req,res) => {
    try {
        const {active} = req.body;
        if (typeof active !== "boolean") {
            return res.status(400).json({success:false,message:"active must be true or false"});
        }
        const result = await db.query(
            "UPDATE supermarkets SET is_active=$1 WHERE id=$2 RETURNING id,email,is_active",
            [active,req.params.id]
        );
        if (!result.rowCount) return res.status(404).json({success:false,message:"User not found"});
        res.json({success:true,user:result.rows[0],message:active ? "User activated" : "User deactivated"});
    } catch(e) {
        res.status(500).json({success:false,message:e.message});
    }
});

module.exports = router;
