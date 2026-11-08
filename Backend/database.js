const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("stockpilot.db");

db.exec("PRAGMA foreign_keys = ON");

console.log("StockPilot database connected successfully!");

module.exports = db;
