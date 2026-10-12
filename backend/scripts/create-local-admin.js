const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

require("dotenv").config({
    path: path.join(__dirname, "../.env"),
    quiet: true,
});

const BCRYPT_SALT_ROUNDS = 12;

async function main() {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not set. Check backend/.env.");
    }

    const username = process.argv[2] || "demo_admin";
    const password = process.argv[3] || `${crypto.randomBytes(9).toString("base64url")}aA1!`;

    await mongoose.connect(process.env.MONGO_URI);
    const User = require("../models/User");

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const existing = await User.findOne({ username: username.toLowerCase() });

    if (existing) {
        existing.passwordHash = passwordHash;
        existing.role = "admin";
        existing.isActive = true;
        await existing.save();
        console.log(`Updated existing user "${username}" to an active admin account.`);
    } else {
        await User.create({ username, passwordHash, role: "admin" });
        console.log(`Created admin account "${username}".`);
    }

    console.log("");
    console.log("Login with:");
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log("");
    console.log("This account lives in your regular MONGO_URI database (same one your normal");
    console.log("dev server uses), so it works with a plain `node server.js` start - no need");
    console.log("to switch to the isolated start:local demo database.");
}

main()
    .catch((error) => {
        console.error("Could not create the local admin account:", error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
