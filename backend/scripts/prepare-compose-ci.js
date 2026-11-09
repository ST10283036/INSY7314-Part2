const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

// Only for an isolated Actions checkout; refuses to overwrite anyone's local configuration.
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("This helper is for GitHub Actions only.");
const destination = path.resolve(__dirname, "../.env");
fs.writeFileSync(destination, [
    `JWT_SECRET=${randomBytes(48).toString("hex")}`,
    "JWT_EXPIRES_IN=15m", "JWT_ISSUER=hustlehub-compose-ci", "JWT_AUDIENCE=hustlehub-compose-api",
    "",
].join("\n"), { flag: "wx", mode: 0o600 });
