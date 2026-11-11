require("dotenv").config();

const db = require("./pg-database");
const { hashPassword } = require("./auth");

function hiddenInput(prompt) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new Error("Run this script directly in Termux."));
            return;
        }

        const stdin = process.stdin;
        let value = "";

        process.stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");

        function cleanup() {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
        }

        function onData(char) {
            if (char === "\u0003") {
                cleanup();
                process.stdout.write("\nCancelled.\n");
                reject(new Error("Cancelled"));
            } else if (char === "\r" || char === "\n") {
                cleanup();
                process.stdout.write("\n");
                resolve(value);
            } else if (char === "\u007f" || char === "\b") {
                value = value.slice(0, -1);
            } else if (char >= " " && char <= "~") {
                value += char;
            }
        }

        stdin.on("data", onData);
    });
}

async function main() {
    const name = "Unknown Stores";
    const email = "unknown@gmail.com";

    const existing = await db.query(
        "SELECT id FROM supermarkets WHERE LOWER(email)=LOWER($1)",
        [email]
    );

    if (existing.rows.length) {
        console.log("This email already exists. No account created.");
        return;
    }

    const password = await hiddenInput("Create owner password (hidden): ");

    if (password.length < 8) {
        throw new Error("Use at least 8 characters.");
    }

    const confirm = await hiddenInput("Confirm password (hidden): ");

    if (password !== confirm) {
        throw new Error("Passwords do not match.");
    }

    const passwordHash = await hashPassword(password);

    await db.query(
        `INSERT INTO supermarkets (name, email, password_hash, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [name, email, passwordHash]
    );

    console.log("Unknown Stores owner account created successfully.");
}

main()
    .catch(error => console.error("Setup failed:", error.message))
    .finally(() => db.end());
