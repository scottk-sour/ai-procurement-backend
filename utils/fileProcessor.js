import fs from 'fs';
import path from 'path';
import { PDFExtract } from 'pdf.js-extract';
import ExcelJS from 'exceljs';
import csv from 'csv-parser';
import OpenAI from 'openai';  // Add this import for LLM extraction

const pdfExtract = new PDFExtract();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
export const extractFromExcel = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  const rows = [];
  const headers = [];
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
      rows.push(obj);
    }
  });
  return rows;
};

/**
 * Utility class for processing uploaded files (PDF, Excel, CSV)
 */
export class FileProcessor {
  static async parsePdf(filePath) {
    return extractFromPDF(filePath);
  }

  static async parseExcel(filePath) {
    return extractFromExcel(filePath);
  }

  static parseCSV(filePath) {
    return extractFromCSV(filePath);
  }

  // Original regex-based extraction (renamed for fallback)
  static regexExtractContractInfo(content) {
    const contractInfo = {
      leaseCost: null,
      monoCPC: null,
      colourCPC: null,
      startDate: null,
      endDate: null,
      machineModel: null,
      leasingCompany: null,
      frequency: 'monthly'  // Default
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

  static async extractContractInfo(content) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert at extracting contract details from invoices or leases. Output only JSON with keys: leaseCost (number), monoCPC (number), colourCPC (number), startDate (string YYYY-MM-DD), endDate (string YYYY-MM-DD), machineModel (string), leasingCompany (string), frequency (string: monthly/quarterly/annual). Use null if not found.' },
          { role: 'user', content: `Extract from: ${content.substring(0, 4000)}` }  // Truncate to avoid token limits
        ],
        response_format: { type: 'json_object' }
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('LLM extraction failed, falling back to regex:', error);
      return this.regexExtractContractInfo(content);
    }
  }

  static calculateSettlementCost(endDate, leaseCost, frequency = 'monthly') {
    if (!endDate || !leaseCost) return 'No lease data available';
    try {
      const leaseEnd = new Date(endDate);
      const today = new Date();
      let monthsLeft = (leaseEnd.getFullYear() - today.getFullYear()) * 12 + (leaseEnd.getMonth() - today.getMonth());
      if (monthsLeft <= 0) return 'Lease already ended';
      if (frequency === 'quarterly') monthsLeft /= 3;
      if (frequency === 'annual') monthsLeft /= 12;
      const settlement = monthsLeft * leaseCost * 0.8;  // 20% discount assumption
      return `£${Math.round(settlement)} (estimated for ${frequency} payments)`;
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
        const data = await this.parseExcel(filePath);
        content = JSON.stringify(data);
      } else if (ext === '.csv') {
        const data = await this.parseCSV(filePath);
        content = JSON.stringify(data);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }

      contractInfo = await this.extractContractInfo(content);
      const settlementCost = this.calculateSettlementCost(contractInfo.endDate, contractInfo.leaseCost, contractInfo.frequency);

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