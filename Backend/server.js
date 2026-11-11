require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./pg-database");
const { createPostgresSchema } = require("./pg-schema");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/developer", require("./developer-routes"));
app.use("/api/supermarket", require("./supermarket-routes"));
app.use("/api/operations", require("./operations"));

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "StockPilot API running",
        database: "PostgreSQL",
        version: "1.0"
    });
});

const PORT = process.env.PORT || 3002;

async function startServer() {
    try {
        await createPostgresSchema(db);

        await db.query(
            "ALTER TABLE supermarkets ADD COLUMN IF NOT EXISTS owner_name TEXT"
        );

        await db.query("SELECT 1");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`StockPilot PostgreSQL server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("StockPilot startup failed:", error.message);
        await db.end();
        process.exit(1);
    }
}

startServer();
