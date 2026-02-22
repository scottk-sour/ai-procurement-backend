/**
 * Check services mapping for all vendors against the spreadsheet.
 * Usage: node scripts/check-services.js
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

async function main() {
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

  let mismatches = 0;
  let correct = 0;
  let notFound = 0;

  for (const row of rows) {
    const company = row['__EMPTY'];
    const category = row['TendorAI Vendor Database — 1044 Vendors'];
    if (!company || !category) continue;

    const expectedServices = CATEGORY_MAP[category];
    if (!expectedServices) {
      console.log('Unknown category:', category, 'for', company);
      continue;
    }

    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vendor = await mongoose.connection.db.collection('vendors').findOne(
      { company: { $regex: new RegExp('^' + escaped + '$', 'i') } },
      { projection: { company: 1, services: 1 } }
    );

    if (!vendor) {
      notFound++;
      continue;
    }

    const actual = (vendor.services || []).slice().sort();
    const expected = expectedServices.slice().sort();
    const match = actual.length === expected.length && actual.every((s, i) => s === expected[i]);

    if (!match) {
      mismatches++;
      console.log(`MISMATCH: ${company} | Category: ${category} | Expected: [${expected}] | Got: [${actual}]`);
    } else {
      correct++;
    }
  }

  console.log();
  console.log('=== Summary ===');
  console.log('Correct:', correct);
  console.log('Mismatches:', mismatches);
  console.log('Not found:', notFound);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
