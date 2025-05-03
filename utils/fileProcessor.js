import fs from 'fs';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import xlsx from 'xlsx';
import csv from 'csv-parser';

const pdfExtract = new PDFExtract();

/**
 * Parse a PDF file and extract its text
 */
export const extractFromPDF = async (filePath) => {
  const data = await pdfExtract.extract(filePath, {});
  return data.pages.map(p => p.content.map(i => i.str).join(' ')).join('\n');
};

/**
 * Parse a CSV file and extract rows
 */
export const extractFromCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', data => results.push(data))
      .on('end', () => resolve(results))
      .on('error', error => reject(error));
  });
};

/**
 * Parse an Excel file and extract rows
 */
export const extractFromExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
};

/**
 * Utility class for processing uploaded files (PDF, Excel, CSV)
 */
export class FileProcessor {
  static async parsePdf(filePath) {
    return extractFromPDF(filePath);
  }

  static parseExcel(filePath) {
    return extractFromExcel(filePath);
  }

  static parseCSV(filePath) {
    return extractFromCSV(filePath);
  }

  static extractContractInfo(content) {
    const contractInfo = {
      leaseCost: null,
      monoCPC: null,
      colourCPC: null,
      startDate: null,
      endDate: null,
      machineModel: null,
      leasingCompany: null
    };

    const leaseCostMatch = content.match(/(?:quarterly|monthly|annual)?\s*(?:lease|payment|cost)[\s:]*[\u00A3$\u20AC]?\s*([0-9,]+\.[0-9]{2})/i);
    if (leaseCostMatch) contractInfo.leaseCost = parseFloat(leaseCostMatch[1].replace(/,/g, ''));

    const monoCPCMatch = content.match(/(?:mono|black|b&w|b\/w)[\s\w]*(?:cost per copy|cpc|cost per page)[\s:]*[\u00A3$\u20AC]?\s*([0-9]+\.[0-9]{2,5})/i);
    if (monoCPCMatch) contractInfo.monoCPC = parseFloat(monoCPCMatch[1]);

    const colourCPCMatch = content.match(/(?:color|colour)[\s\w]*(?:cost per copy|cpc|cost per page)[\s:]*[\u00A3$\u20AC]?\s*([0-9]+\.[0-9]{2,5})/i);
    if (colourCPCMatch) contractInfo.colourCPC = parseFloat(colourCPCMatch[1]);

    const startDateMatch = content.match(/(?:contract|lease)[\s\w]*(?:start|begin|commence)[\s:]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i);
    if (startDateMatch) contractInfo.startDate = startDateMatch[1];

    const endDateMatch = content.match(/(?:contract|lease)[\s\w]*(?:end|expiry|terminate)[\s:]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i);
    if (endDateMatch) contractInfo.endDate = endDateMatch[1];

    const modelMatch = content.match(/(?:model|machine|device)[\s:]*([A-Za-z0-9\-]+\s[A-Za-z0-9\-]+)/i);
    if (modelMatch) contractInfo.machineModel = modelMatch[1].trim();

    const companyMatch = content.match(/(?:leasing company|financed by|provided by)[\s:]*([A-Za-z\s&]+)(?:Ltd\.?|Limited|Inc\.?|Corporation)?/i);
    if (companyMatch) contractInfo.leasingCompany = companyMatch[1].trim();

    return contractInfo;
  }

  static calculateSettlementCost(endDate, monthlyPayment) {
    if (!endDate || !monthlyPayment) return 'No lease data available';
    try {
      const leaseEnd = new Date(endDate);
      const today = new Date();
      const months = (leaseEnd.getFullYear() - today.getFullYear()) * 12 + (leaseEnd.getMonth() - today.getMonth());
      if (months <= 0) return 'Lease already ended';
      return `£${Math.round(months * monthlyPayment * 0.8)}`;
    } catch {
      return 'Error in calculation';
    }
  }

  static async processFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) throw new Error('File not found');
      const ext = path.extname(filePath).toLowerCase();
      let content = '';
      let contractInfo = {};

      if (ext === '.pdf') {
        content = await this.parsePdf(filePath);
      } else if (ext === '.xlsx' || ext === '.xls') {
        const data = this.parseExcel(filePath);
        content = JSON.stringify(data);
      } else if (ext === '.csv') {
        const data = await this.parseCSV(filePath);
        content = JSON.stringify(data);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      contractInfo = this.extractContractInfo(content);
      const settlementCost = this.calculateSettlementCost(contractInfo.endDate, contractInfo.leaseCost);

      return {
        filePath,
        fileType: ext.substring(1),
        rawContent: content,
        contractInfo,
        settlementCost
      };
    } catch (error) {
      return {
        filePath,
        fileType: path.extname(filePath).substring(1),
        error: error.message,
        contractInfo: {},
        settlementCost: 'Unavailable'
      };
    }
  }
}

export default FileProcessor;
