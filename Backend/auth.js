const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
}

// Hash a password before saving it
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

// Verify a login password
async function verifyPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

// Create a login token
function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            supermarketId: user.supermarketId || null
        },
        JWT_SECRET,
        { expiresIn: "8h" }
    );
}

// Verify a login token
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = {
    hashPassword,
    verifyPassword,
    createToken,
    verifyToken
};
