import VendorProduct from '../models/VendorProduct.js';
import { readExcelFile } from '../utils/readExcel.js';
import { readCSVFile } from '../utils/readCSV.js';
import { parseLeaseTermsAndMargins, parseAuxiliaries, parseSemicolonList } from '../utils/vendorProductImportHelpers.js';

/**
 * Import vendor products from Excel or CSV
 * @param {string} filePath
 * @param {string} vendorId
 */
export async function importVendorProducts(filePath, vendorId) {
  let rows = [];
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    rows = readExcelFile(filePath);
  } else if (ext === 'csv') {
    rows = await readCSVFile(filePath);
  } else {
    throw new Error('Unsupported file format');
  }
  if (!rows || rows.length === 0) throw new Error('No data found in file');

  const docs = [];
  for (const row of rows) {
    // Map and parse each column
    const doc = {
      vendorId,
      manufacturer: row.manufacturer,
      model: row.model,
      description: row.description || "",
      speed: Number(row.speed),
      isA3: (row.isA3 === 'TRUE' || row.isA3 === true),
      features: parseSemicolonList(row.features),
      minVolume: Number(row.minVolume),
      maxVolume: Number(row.maxVolume),
      salePrice: Number(row.totalMachineCost || row.salePrice),
      leaseTermsAndMargins: parseLeaseTermsAndMargins(row.leaseTermsAndMargins),
      auxiliaries: parseAuxiliaries(row.auxiliaries),
      A4MonoCPC: Number(row.A4MonoCPC),
      A4ColourCPC: Number(row.A4ColourCPC),
      A3MonoCPC: Number(row.A3MonoCPC || 0),
      A3ColourCPC: Number(row.A3ColourCPC || 0),
      adminFee: Number(row.adminFee || 0),
      minMonthlyCPC: Number(row.minMonthlyCPC || 0),
      serviceLevel: row.serviceLevel,
      responseTime: Number(row.responseTime),
      support: row.support,
      stockStatus: row.stockStatus,
      modelYear: Number(row.modelYear || 0),
      complianceTags: parseSemicolonList(row.complianceTags),
      regionsCovered: parseSemicolonList(row.regionsCovered),
      industries: parseSemicolonList(row.industries),
    };
    docs.push(doc);
  }
  // Insert into MongoDB (can also use upsert/updateMany as desired)
  await VendorProduct.insertMany(docs);
  return { success: true, count: docs.length };
}
