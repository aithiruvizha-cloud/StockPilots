const db = require("./database");
const { verifyPassword, createToken } = require("./auth");

async function supermarketLogin(email, password) {
    if (!email || !password) {
        throw new Error("Email and password are required.");
    }

    const supermarket = db.prepare(`
        SELECT id, name, email, password_hash, is_active
        FROM supermarkets
        WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (!supermarket) {
        throw new Error("Invalid email or password.");
    }

    if (supermarket.is_active !== 1) {
        throw new Error("This supermarket account is deactivated.");
    }

    const valid = await verifyPassword(
        password,
        supermarket.password_hash
    );

    if (!valid) {
        throw new Error("Invalid email or password.");
    }

    return createToken({
        id: supermarket.id,
        role: "supermarket",
        supermarketId: supermarket.id
    });
}

module.exports = { supermarketLogin };
