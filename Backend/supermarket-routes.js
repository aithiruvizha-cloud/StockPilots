const express = require("express");
const router = express.Router();

const { supermarketLogin } = require("./supermarket-auth");

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const token = await supermarketLogin(email, password);

        res.json({
            success: true,
            message: "Supermarket login successful.",
            token
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;

