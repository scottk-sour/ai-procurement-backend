// scripts/remove-vendor.js
// One-off GDPR / data-accuracy removal tool. Finds a vendor, then cascade-deletes
// it and every related record across all collections.
//
// Run on the Render shell (MONGODB_URI is set there) after `git pull`:
//   node scripts/remove-vendor.js find "Natural Accounts"
//   node scripts/remove-vendor.js purge <vendorId>
//
// `find` is read-only. Nothing is deleted until you run `purge` with a confirmed _id.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

// Collections that hold a reference to a vendor's _id, and the field they use.
const RELATED = [
  { coll: 'aeoreports', field: 'vendorId' },
  { coll: 'aimentionscans', field: 'vendorId' },
  { coll: 'agentruns', field: 'vendorId' },
];

// Candidate name fields across schema versions — search covers all of them.
const NAME_FIELDS = ['company', 'companyName', 'name', 'firmName', 'businessName', 'tradingName'];

function nameOf(v) {
  return v.company ?? v.companyName ?? v.name ?? v.firmName ?? v.businessName ?? v.tradingName ?? '(unknown)';
}
function emailOf(v) {
  return v.email ?? v.contactEmail ?? v.companyEmail ?? null;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  if (cmd === 'find') {
    const term = rest.join(' ').trim();
    if (!term) { console.error('Provide a search term, e.g. "Natural Accounts"'); process.exit(1); }
    const rx = new RegExp(term, 'i');
    const query = { $or: NAME_FIELDS.map(f => ({ [f]: rx })) };
    const matches = await db.collection('vendors').find(query).toArray();
    console.log(`\nFound ${matches.length} vendor record(s) matching /${term}/i:\n`);
    for (const v of matches) {
      console.log('────────────────────────────────────────');
      console.log('_id            :', v._id.toString());
      console.log('company        :', nameOf(v));
      console.log('email          :', emailOf(v) ?? '(none)');
      console.log('postcode       :', v.postcode ?? v.postCode ?? '(none)');
      console.log('town/city      :', v.town ?? v.city ?? '(none)');
      console.log('vendorType     :', v.vendorType ?? '(none)');
      console.log('icaewFirmNumber:', v.icaewFirmNumber ?? '(none)');
    }
    console.log('\nConfirm the right record, then:');
    console.log('  node scripts/remove-vendor.js purge <_id>\n');
    await mongoose.disconnect();
    return;
  }

  if (cmd === 'purge') {
    const id = rest[0];
    if (!id) { console.error('Provide the vendor _id from the find step'); process.exit(1); }
    let _id;
    try { _id = new mongoose.Types.ObjectId(id); }
    catch { console.error('Invalid ObjectId:', id); process.exit(1); }

    const vendor = await db.collection('vendors').findOne({ _id });
    if (!vendor) { console.error('No vendor found with _id', id); process.exit(1); }

    const name = nameOf(vendor);
    const email = emailOf(vendor);
    console.log(`\nPurging: ${name}  (_id ${id})\n`);

    // Cascade-delete related records. Match _id stored as ObjectId OR string.
    for (const { coll, field } of RELATED) {
      const r = await db.collection(coll).deleteMany({ $or: [{ [field]: _id }, { [field]: id }] });
      console.log(`  ${coll.padEnd(18)}: deleted ${r.deletedCount}`);
    }

    // Outreach log is keyed on email/firm, not vendorId.
    const logOr = [{ vendorId: _id }, { vendorId: id }];
    if (email) logOr.push({ email }, { to: email }, { recipient: email });
    const log = await db.collection('cold_outreach_log').deleteMany({ $or: logOr });
    console.log(`  cold_outreach_log : deleted ${log.deletedCount}`);

    // Finally the vendor record itself.
    const v = await db.collection('vendors').deleteOne({ _id });
    console.log(`  vendors           : deleted ${v.deletedCount}`);

    const remaining = await db.collection('vendors').countDocuments({ _id });
    console.log(`\n✅ Done. Vendor records remaining with that _id: ${remaining}\n`);
    await mongoose.disconnect();
    return;
  }

  console.error('Usage:\n  node scripts/remove-vendor.js find "Natural Accounts"\n  node scripts/remove-vendor.js purge <vendorId>');
  await mongoose.disconnect();
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
