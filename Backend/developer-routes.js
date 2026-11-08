const express = require("express");
const router = express.Router();

const db = require("./database");
const { developerLogin } = require("./developer-auth");
const { hashPassword } = require("./auth");
const { authenticate, requireDeveloper } = require("./middleware");

// Developer login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const token = await developerLogin(email, password);

        res.json({
            success: true,
            message: "Developer login successful.",
            token
        });
    } catch {
        res.status(401).json({
            success: false,
            message: "Invalid developer credentials."
        });
    }
});

// Verify developer
router.get("/verify", authenticate, requireDeveloper, (req, res) => {
    res.json({
        success: true,
        message: "Developer authentication verified."
    });
});

// Create supermarket
router.post("/supermarkets", authenticate, requireDeveloper, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password || password.length < 12) {
            return res.status(400).json({
                success: false,
                message: "Provide name, email and password of at least 12 characters."
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const existing = db.prepare(
            "SELECT id FROM supermarkets WHERE email = ?"
        ).get(cleanEmail);

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered."
            });
        }

        const passwordHash = await hashPassword(password);

        const result = db.prepare(`
            INSERT INTO supermarkets (name, email, password_hash)
            VALUES (?, ?, ?)
        `).run(name.trim(), cleanEmail, passwordHash);

        res.status(201).json({
            success: true,
            message: "Supermarket account created successfully.",
            supermarket: {
                id: Number(result.lastInsertRowid),
                name: name.trim(),
                email: cleanEmail,
                is_active: true
            }
        });
    } catch (error) {
        console.error("Supermarket creation error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to create supermarket account."
        });
    }
});

// View all supermarkets
router.get("/supermarkets", authenticate, requireDeveloper, (req, res) => {
    const supermarkets = db.prepare(`
        SELECT id, name, email, is_active, created_at
        FROM supermarkets
        ORDER BY id DESC
    `).all();

    res.json({
        success: true,
        supermarkets
    });
});

// Activate or deactivate a supermarket
router.patch("/supermarkets/:id/status", authenticate, requireDeveloper, (req, res) => {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(id) || id < 1 ||
        typeof is_active !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "Provide a valid supermarket ID and true/false status."
        });
    }

    const result = db.prepare(`
        UPDATE supermarkets
        SET is_active = ?
        WHERE id = ?
    `).run(is_active ? 1 : 0, id);

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            message: "Supermarket account not found."
        });
    }

    res.json({
        success: true,
        message: is_active
            ? "Supermarket account activated."
            : "Supermarket account deactivated."
    });
});

module.exports = router;
