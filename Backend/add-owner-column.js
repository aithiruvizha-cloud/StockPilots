require("dotenv").config();
const db = require("./pg-database");
(async()=>{
  try {
    await db.query("ALTER TABLE supermarkets ADD COLUMN IF NOT EXISTS owner_name TEXT");
    console.log("owner_name column ready");
  } catch(e) {
    console.error(e.message);
    process.exitCode=1;
  } finally {
    await db.end();
  }
})();
