/*
 * Database backup — dumps every collection in the app's MongoDB database to
 * backups/<database>/<collection>.json as pretty-printed JSON.
 *
 * Git versioning is the backup history: the daily workflow commits these files,
 * so every change to Louise's content becomes a restorable point in git.
 *
 * Run locally:  MONGODB_URI="mongodb+srv://…" node scripts/backup-db.mjs
 */
import { MongoClient } from "mongodb";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set — nothing to back up."); process.exit(1); }

const OUT = "backups";
const pretty = (v) => JSON.stringify(v, null, 2) + "\n";

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db();                 // database name comes from the URI
  const dbName = db.databaseName;
  const collections = await db.listCollections().toArray();
  const dir = path.join(OUT, dbName);
  await mkdir(dir, { recursive: true });

  let totalDocs = 0;
  const names = [];
  for (const c of collections) {
    // sort by _id so the file is stable (no spurious diffs when data is unchanged)
    const docs = await db.collection(c.name).find({}).sort({ _id: 1 }).toArray();
    await writeFile(path.join(dir, `${c.name}.json`), pretty(docs));
    console.log(`  ${c.name}: ${docs.length} document(s)`);
    totalDocs += docs.length;
    names.push(c.name);
  }

  // manifest (no timestamp on purpose — a volatile timestamp would create a
  // commit every day even when nothing changed)
  await writeFile(path.join(OUT, "manifest.json"), pretty({
    database: dbName,
    collections: names,
    documentCount: totalDocs,
    restoreWith: "scripts/restore-db.mjs"
  }));

  console.log(`Backed up ${collections.length} collection(s), ${totalDocs} document(s) from "${dbName}".`);
} finally {
  await client.close();
}
