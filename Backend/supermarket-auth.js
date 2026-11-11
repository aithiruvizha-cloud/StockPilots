const db = require("./pg-database");
const { verifyPassword, createToken } = require("./auth");

async function supermarketLogin(email, password) {
    if (!email || !password) {
        throw new Error("Email and password are required.");
    }

    const result = await db.query(
        `SELECT id, name, email, password_hash, is_active
         FROM supermarkets
         WHERE LOWER(email) = LOWER($1)`,
        [email.trim()]
    );

    const supermarket = result.rows[0];

    if (!supermarket) {
        throw new Error("Invalid email or password.");
    }

    if (!supermarket.is_active) {
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
