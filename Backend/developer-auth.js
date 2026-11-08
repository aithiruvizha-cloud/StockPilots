const db = require("./database");
const { verifyPassword, createToken } = require("./auth");

async function developerLogin(email, password) {
    const developer = db.prepare(
        "SELECT * FROM developer_accounts WHERE email = ?"
    ).get(email.toLowerCase().trim());

    if (!developer) {
        throw new Error("Invalid developer credentials.");
    }

    const valid = await verifyPassword(
        password,
        developer.password_hash
    );

    if (!valid) {
        throw new Error("Invalid developer credentials.");
    }

    return createToken({
        id: developer.id,
        role: "developer"
    });
}

module.exports = { developerLogin };
