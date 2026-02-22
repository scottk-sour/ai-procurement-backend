/**
 * Fix vendor services to match spreadsheet category mapping.
 * Usage: node scripts/fix-services.js [--dry-run]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

const CATEGORY_MAP = {
  'Copiers': ['Photocopiers'],
  'Telecoms': ['Telecoms'],
  'CCTV': ['CCTV'],
  'IT': ['IT'],
  'Both': ['Photocopiers', 'Telecoms'],
};

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (DRY_RUN) console.log('[DRY RUN]');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('TendorAI-All-Vendors-Clean (2).xlsx');
  const ws = wb.worksheets[0];
  const headers = [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values.slice(1).map(cell => {
      if (cell === undefined || cell === null) return null;
      if (typeof cell === 'object' && cell.richText) return cell.richText.map(r => r.text).join('');
      if (typeof cell === 'object' && cell.result !== undefined) return cell.result;
      return cell;
    });
    if (rowNumber === 1) {
      values.forEach(v => headers.push(v ? String(v).trim() : ''));
    } else {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = values[i] !== undefined ? values[i] : null; });
      rows.push(obj);
    }
  });

  let fixed = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of rows) {
    const company = row['__EMPTY'];
    const category = row['TendorAI Vendor Database — 1044 Vendors'];
    if (!company || !category) continue;

    const expectedServices = CATEGORY_MAP[category];
    if (!expectedServices) continue;

    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vendor = await mongoose.connection.db.collection('vendors').findOne(
      { company: { $regex: new RegExp('^' + escaped + '$', 'i') } },
      { projection: { company: 1, services: 1 } }
    );

    if (!vendor) { notFound++; continue; }

    const actual = (vendor.services || []).slice().sort();
    const expected = expectedServices.slice().sort();
    const match = actual.length === expected.length && actual.every((s, i) => s === expected[i]);

    if (match) {
      skipped++;
      continue;
    }

    console.log(`${company}: [${actual}] → [${expected}]`);

    if (!DRY_RUN) {
      await mongoose.connection.db.collection('vendors').updateOne(
        { _id: vendor._id },
        { $set: { services: expectedServices } }
      );
    }
    fixed++;
  }

  console.log();
  console.log('=== Summary ===');
  console.log('Fixed:', fixed);
  console.log('Already correct:', skipped);
  console.log('Not found:', notFound);
  if (DRY_RUN) console.log('\nDRY RUN — no changes made. Remove --dry-run to apply.');
  else console.log('\nAll changes applied.');

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
