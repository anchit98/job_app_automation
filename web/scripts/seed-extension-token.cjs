const Database = require("better-sqlite3");
const { createHash, randomBytes } = require("crypto");

const db = new Database("data/app.db");
const token = "jab_" + randomBytes(24).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const prefix = token.slice(0, 12);

db.prepare(
  `INSERT INTO extension_tokens (id, token_hash, token_prefix, created_at, revoked_at)
   VALUES (1, ?, ?, datetime('now'), NULL)
   ON CONFLICT(id) DO UPDATE SET
     token_hash = excluded.token_hash,
     token_prefix = excluded.token_prefix,
     created_at = datetime('now'),
     revoked_at = NULL`,
).run(hash, prefix);

console.log("TOKEN_FOR_EXTENSION=" + token);
console.log("prefix=" + prefix);
db.close();
