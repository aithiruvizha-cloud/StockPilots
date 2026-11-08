require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json({limit:"1mb"}));

const db = require("./database");
require("./schema");

app.use("/api/developer",require("./developer-routes"));
app.use("/api/supermarket",require("./supermarket-routes"));
app.use("/api/operations",require("./operations"));

app.get("/",(req,res)=>res.json({
    success:true,
    message:"StockPilot API running",
    version:"1.0"
}));

const PORT=process.env.PORT||3002;
app.listen(PORT,"0.0.0.0",()=>{
    console.log(`StockPilot server running on port ${PORT}`);
});
