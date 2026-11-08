require("dotenv").config();

const { createDeveloper } = require("./developer");

async function main() {
    const email = process.env.DEVELOPER_EMAIL;
    const password = process.env.DEVELOPER_PASSWORD;

    if (!email || !password) {
        throw new Error("Developer credentials are missing from .env");
    }

    await createDeveloper(email, password);
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
