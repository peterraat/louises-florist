/*
 * One-time migration: copy Louise's content document out of the shared
 * "dividend-sniper" database into its own "louisesflorist" database, so the site
 * can have a dedicated database. Additive and safe — it does NOT delete anything
 * from the source database.
 *
 * Uses the CURRENT connection (which still points at dividend-sniper); the same
 * credentials can read/write any database on the cluster.
 *
 *   MONGODB_URI="…" node scripts/migrate-content.mjs
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const FROM = process.env.FROM_DB || "dividend-sniper";
const TO   = process.env.TO_DB   || "louisesflorist";
if (!uri) { console.error("MONGODB_URI is not set."); process.exit(1); }

const client = new MongoClient(uri);
try {
  await client.connect();
  const src = client.db(FROM).collection("contents");
  const doc = await src.findOne({ _id: "singleton" });
  if (!doc) {
    console.log(`No 'contents' singleton found in "${FROM}" — nothing to migrate (the new database will start from defaults).`);
  } else {
    const res = await client.db(TO).collection("contents").replaceOne({ _id: "singleton" }, doc, { upsert: true });
    console.log(`Copied content "${FROM}" -> "${TO}" (upserted ${res.upsertedCount}, modified ${res.modifiedCount}).`);
    const check = await client.db(TO).collection("contents").findOne({ _id: "singleton" });
    const keys = Object.keys((check && check.data) || check || {});
    console.log(`Verified: "${TO}".contents singleton now present. Content sections: ${keys.join(", ")}`);
  }
} finally {
  await client.close();
}
