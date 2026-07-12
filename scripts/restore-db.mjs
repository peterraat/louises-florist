/*
 * Database restore — writes the JSON snapshots in backups/<database>/ back into
 * MongoDB. Each document is upserted by its _id (existing docs are overwritten,
 * new ones inserted). It does NOT delete documents that only exist in the DB.
 *
 * This is deliberately guarded so it can't run by accident:
 *   MONGODB_URI="mongodb+srv://…" CONFIRM_RESTORE=yes node scripts/restore-db.mjs
 *
 * To restore an OLDER version, first `git checkout <commit> -- backups/` to bring
 * back that day's files, then run this.
 */
import { MongoClient } from "mongodb";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set."); process.exit(1); }
if (process.env.CONFIRM_RESTORE !== "yes") {
  console.error('Refusing to restore without confirmation. Re-run with CONFIRM_RESTORE=yes to proceed.');
  process.exit(1);
}

const OUT = "backups";

// find the single database folder under backups/
const entries = await readdir(OUT, { withFileTypes: true });
const dbDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
if (dbDirs.length !== 1) {
  console.error(`Expected exactly one database folder in ${OUT}/, found: ${dbDirs.join(", ") || "none"}`);
  process.exit(1);
}
const dbName = dbDirs[0];
const dir = path.join(OUT, dbName);

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const colName = f.replace(/\.json$/, "");
    const docs = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    if (!Array.isArray(docs) || !docs.length) { console.log(`  ${colName}: nothing to restore`); continue; }
    const col = db.collection(colName);
    const ops = docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } }));
    const res = await col.bulkWrite(ops, { ordered: false });
    console.log(`  ${colName}: restored ${docs.length} document(s) (upserted ${res.upsertedCount}, modified ${res.modifiedCount})`);
  }
  console.log(`Restore into "${dbName}" complete.`);
} finally {
  await client.close();
}
