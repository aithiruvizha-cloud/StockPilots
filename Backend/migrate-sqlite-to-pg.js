require("dotenv").config();

const { DatabaseSync } = require("node:sqlite");
const pool = require("./pg-database");

const sqlite = new DatabaseSync("stockpilot.db");

const tables = [
    "developer_accounts",
    "supermarkets",
    "dealers",
    "products",
    "purchase_orders",
    "invoices",
    "invoice_items",
    "inbox"
];

async function migrate() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        for (const table of tables) {
            const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();

            if (rows.length === 0) {
                console.log(`${table}: 0 records`);
                continue;
            }

            const columns = Object.keys(rows[0]);

            for (const row of rows) {
                const values = columns.map(column => {
                    if (table === "supermarkets" && column === "is_active") {
                        return Boolean(row[column]);
                    }
                    return row[column];
                });

                const placeholders = values.map(
                    (_, index) => `$${index + 1}`
                ).join(", ");

                const columnNames = columns.map(
                    column => `"${column}"`
                ).join(", ");

                await client.query(
                    `INSERT INTO "${table}" (${columnNames})
                     VALUES (${placeholders})`,
                    values
                );
            }

            console.log(`${table}: ${rows.length} records copied`);

            const sequence = await client.query(
                "SELECT pg_get_serial_sequence($1, 'id') AS seq",
                [table]
            );

            if (sequence.rows[0].seq && rows.length > 0) {
                await client.query(
                    `SELECT setval($1, (SELECT MAX(id) FROM "${table}"))`,
                    [sequence.rows[0].seq]
                );
            }
        }

        await client.query("COMMIT");
        console.log("Migration completed successfully!");

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", error.message);
    } finally {
        client.release();
        sqlite.close();
        await pool.end();
    }
}

migrate();
