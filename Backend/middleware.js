const { verifyToken } = require("./auth");

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    try {
        const token = authHeader.split(" ")[1];
        req.user = verifyToken(token);
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
}

function requireDeveloper(req, res, next) {
    if (!req.user || req.user.role !== "developer") {
        return res.status(403).json({
            success: false,
            message: "Developer access only."
        });
    }

    next();
}

module.exports = {
    authenticate,
    requireDeveloper
};
