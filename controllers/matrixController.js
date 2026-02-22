import MachineMatrix from '../models/MachineMatrix.js';
import ExcelJS from 'exceljs';
import csv from 'csv-parser';
import fs from 'fs';

/**
 * Upload and parse the machine quote matrix file.
 * Supports both XLSX and CSV formats.
 * Expects that the vendor is authenticated and req.vendorId is attached.
 */
export const uploadMatrix = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const filePath = req.file.path;
    const fileExtension = filePath.split('.').pop().toLowerCase();
    let matrixEntries = [];

    if (fileExtension === 'xlsx') {
      // Process Excel File
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      const headers = [];
      const sheetData = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
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
          sheetData.push(obj);
        }
      });

      matrixEntries = sheetData.map(row => ({
        vendorId: req.vendorId, // Must be attached by your auth middleware
        manufacturer: row.Manufacturer,
        model: row.Model,
        speed: Number(row.Speed) || 0,
        type: row['Device type'] || 'A3 MFP',
        description: row.Description || '',
        cost: Number(row.Cost?.replace(/[£,]/g, '')) || 0,
        installation: Number(row.Installation) || 0,
        profitMargin: Number(row['Profit Margin']) || 0,
        minVolume: Number(row['Min Volume']) || 0,
        maxVolume: Number(row['Max Volume']) || 0,
        totalMachineCost: Number(row['Total Machine Cost']?.replace(/[£,]/g, '')) || 0,
        costPerCopy: {
          A4Mono: Number(row['A4 Mono']) || 0,
          A4Color: Number(row['A4 Colour']) || 0,
          A3Mono: Number(row['A3 Mono']) || 0,
          A3Color: Number(row['A3 Colour']) || 0,
          SRA3Mono: Number(row['SRA3 Mono']) || 0,
          SRA3Color: Number(row['SRA3 Colour']) || 0,
        },
        leaseRates: [
          { durationMonths: 24, profile: '1+7', ratePerThousand: Number(row['Lease Rates 24']) || 0 },
          { durationMonths: 36, profile: '2+11', ratePerThousand: Number(row['Lease Rates 36']) || 0 },
          { durationMonths: 48, profile: '1+15', ratePerThousand: Number(row['Lease Rates 48']) || 0 },
        ],
        auxiliaries: [
          { item: '500 sheet paper tray', price: 357.00 },
          { item: '2 x 500 sheet paper tray', price: 499.80 },
          { item: 'Large Capacity Tray', price: 693.00 },
          { item: 'Inner Staple Finisher', price: 485.52 },
          // Add additional auxiliaries here if your matrix includes them.
        ],
      }));

    } else if (fileExtension === 'csv') {
      // Process CSV File
      const csvData = [];
      const stream = fs.createReadStream(filePath).pipe(csv());
      stream.on('data', (row) => {
        csvData.push({
          vendorId: req.vendorId,
          manufacturer: row.provider || 'Unknown',
          model: row.model,
          type: row.type || 'A3 MFP',
          speed: Number(row.Speed) || 0,
          description: row.Description || '',
          cost: Number(row.lease_cost) || 0,
          installation: 0,
          profitMargin: 0,
          minVolume: 0,
          maxVolume: 0,
          totalMachineCost: 0,
          costPerCopy: {
            A4Mono: Number(row.mono_cpc) || 0,
            A4Color: Number(row.color_cpc) || 0,
            A3Mono: 0,
            A3Color: 0,
            SRA3Mono: 0,
            SRA3Color: 0,
          },
          leaseRates: [],
          auxiliaries: [],
        });
      });
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      matrixEntries = csvData;
    } else {
      return res.status(400).json({ message: 'Unsupported file format. Only XLSX and CSV allowed.' });
    }

    if (matrixEntries.length > 0) {
      await MachineMatrix.insertMany(matrixEntries);
      return res.status(201).json({ message: 'Matrix uploaded successfully', count: matrixEntries.length });
    } else {
      return res.status(400).json({ message: 'No valid data found in the file.' });
    }

  } catch (error) {
    console.error('Error uploading matrix:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

/**
 * Retrieve matrix entries for a specific vendor.
 */
export const getMatrix = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ message: 'Missing vendorId' });
    }
    const matrix = await MachineMatrix.find({ vendorId });
    return res.status(200).json(matrix);
  } catch (error) {
    console.error('Error fetching matrix:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};
