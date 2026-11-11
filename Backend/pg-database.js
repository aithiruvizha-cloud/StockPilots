require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from environment variables.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10000
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err.message);
});

module.exports = pool;
