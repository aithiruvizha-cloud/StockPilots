require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const developerRoutes = require("./developer-routes");
const supermarketRoutes = require("./supermarket-routes");

console.log("Developer routes:", developerRoutes.stack.map(r => r.route?.path));
console.log("Supermarket routes:", supermarketRoutes.stack.map(r => r.route?.path));

app.use("/api/developer", developerRoutes);
app.use("/api/supermarket", supermarketRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "StockPilot Backend is running!",
        status: "success"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`StockPilot server running on port ${PORT}`);
});
