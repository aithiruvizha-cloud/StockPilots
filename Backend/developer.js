const db = require("./database");
const { hashPassword } = require("./auth");

async function createDeveloper(email, password) {
    if (!email || !password || password.length < 12) {
        throw new Error("Provide an email and a password of at least 12 characters.");
    }

    const existing = db.prepare(
        "SELECT id FROM developer_accounts LIMIT 1"
    ).get();

    if (existing) {
        throw new Error("Developer account already exists.");
    }

    const passwordHash = await hashPassword(password);

    db.prepare(`
        INSERT INTO developer_accounts (email, password_hash)
        VALUES (?, ?)
    `).run(email.toLowerCase().trim(), passwordHash);

    console.log("Developer account created successfully!");
}

module.exports = { createDeveloper };
