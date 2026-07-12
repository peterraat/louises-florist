/*
 * One-time cleanup: remove the leftover "contents" collection from the shared
 * "dividend-sniper" database (Louise's content lived there before it got its own
 * "louisesflorist" database). Heavily guarded so it can only remove the exact
 * leftover and nothing else.
 *
 *   MONGODB_URI="…" CONFIRM_CLEANUP=yes node scripts/cleanup-old-contents.mjs
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const OLD_DB = process.env.OLD_DB || "dividend-sniper";
const NEW_DB = process.env.NEW_DB || "louisesflorist";
if (!uri) { console.error("MONGODB_URI is not set."); process.exit(1); }
if (process.env.CONFIRM_CLEANUP !== "yes") {
  console.error("Refusing to run without CONFIRM_CLEANUP=yes.");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();

  // SAFETY 1: the new database must already hold Louise's content.
  const kept = await client.db(NEW_DB).collection("contents").findOne({ _id: "singleton" });
  if (!kept) {
    console.log(`::error::ABORT: "${NEW_DB}".contents has no singleton — refusing to delete the old copy.`);
    process.exit(1);
  }
  console.log(`OK: "${NEW_DB}".contents singleton is present (the copy we keep).`);

  // SAFETY 2: the old collection must contain ONLY the one leftover singleton.
  const oldCol = client.db(OLD_DB).collection("contents");
  const docs = await oldCol.find({}).toArray();
  const onlyLeftover = docs.length === 1 && docs[0] && docs[0]._id === "singleton";
  if (!onlyLeftover) {
    console.log(`::error::ABORT: "${OLD_DB}".contents has ${docs.length} doc(s) with ids [${docs.map((d) => JSON.stringify(d._id)).join(", ")}] — not the expected single leftover. Leaving it untouched.`);
    process.exit(1);
  }
  console.log(`OK: "${OLD_DB}".contents contains only the leftover singleton.`);

  // Remove the leftover collection.
  await oldCol.drop();
  console.log(`Dropped "${OLD_DB}".contents.`);

  // Verify.
  const gone = !(await client.db(OLD_DB).listCollections({ name: "contents" }).hasNext());
  const stillKept = await client.db(NEW_DB).collection("contents").findOne({ _id: "singleton" });
  console.log(`Verify: "${OLD_DB}".contents removed = ${gone}; "${NEW_DB}".contents intact = ${!!stillKept}`);
} finally {
  await client.close();
}
