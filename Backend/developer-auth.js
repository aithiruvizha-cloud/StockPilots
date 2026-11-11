const db = require("./pg-database");
const {verifyPassword,createToken} = require("./auth");

async function developerLogin(email,password) {
    if (!email || !password) throw new Error("Email and password are required");
    const result = await db.query(
        "SELECT id,email,password_hash FROM developer_accounts WHERE LOWER(email)=LOWER($1)",
        [email.trim()]
    );
    const developer = result.rows[0];
    if (!developer || !(await verifyPassword(password,developer.password_hash))) {
        throw new Error("Invalid developer credentials");
    }
    return createToken({id:developer.id,role:"developer"});
}
module.exports={developerLogin};
