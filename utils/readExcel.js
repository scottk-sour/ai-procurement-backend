// utils/readExcel.js
import fs from 'fs';
import ExcelJS from 'exceljs';

/**
 * Helper: convert an ExcelJS worksheet to an array of arrays (like xlsx sheet_to_json with header:1)
 */
function worksheetToArrays(worksheet, options = {}) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    // row.values is 1-indexed (index 0 is undefined), so slice from 1
    const values = row.values.slice(1).map(cell => {
      if (cell === undefined || cell === null) return options.defval !== undefined ? options.defval : null;
      // Handle ExcelJS rich text objects
      if (typeof cell === 'object' && cell.richText) {
        return cell.richText.map(r => r.text).join('');
      }
      // Handle ExcelJS cell error objects
      if (typeof cell === 'object' && cell.error) return null;
      // Handle formulas - return the result
      if (typeof cell === 'object' && cell.result !== undefined) return cell.result;
      return cell;
    });
    rows.push(values);
  });
  return rows;
}

/**
 * Helper: convert an ExcelJS worksheet to array of objects (like xlsx sheet_to_json without header:1)
 */
function worksheetToObjects(worksheet) {
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
      headers.forEach((h, i) => {
        if (h) obj[h] = values[i] !== undefined ? values[i] : null;
      });
      rows.push(obj);
    }
  });
  return rows;
}

/**
 * Helper: encode cell reference from row/col (0-indexed) e.g. {r:0, c:0} → "A1"
 */
function encodeCell(row, col) {
  let colStr = '';
  let c = col;
  do {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return colStr + (row + 1);
}

/**
 * Read and parse Excel file
 * @param {string} filePath - Path to the Excel file
 * @param {object} options - Excel reading options
 * @returns {Promise<Array>} Array of rows (first row is headers)
 */
export async function readExcelFile(filePath, options = {}) {
  try {
    console.log(`📊 Reading Excel file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const defaultOptions = {
      sheetName: null,
      ...options
    };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetName = defaultOptions.sheetName || workbook.worksheets[0]?.name;
    const worksheet = workbook.getWorksheet(sheetName);

    if (!worksheet) {
      const available = workbook.worksheets.map(ws => ws.name).join(', ');
      throw new Error(`Sheet '${sheetName}' not found. Available sheets: ${available}`);
    }

    const rows = worksheetToArrays(worksheet, { defval: null });

    // Filter out completely empty rows
    const filteredRows = rows.filter(row =>
      Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );

    console.log(`✅ Excel file parsed successfully: ${filteredRows.length} rows from sheet '${sheetName}'`);

    return filteredRows;

  } catch (error) {
    console.error('❌ Excel parsing error:', error);
    throw error;
  }
}

/**
 * Get information about Excel workbook
 * @param {string} filePath - Path to the Excel file
 * @returns {Promise<object>} Workbook information
 */
export async function getExcelInfo(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    const info = {
      sheetNames,
      sheetCount: sheetNames.length,
      sheets: {}
    };

    workbook.worksheets.forEach(worksheet => {
      const rowCount = worksheet.rowCount;
      const colCount = worksheet.columnCount;

      info.sheets[worksheet.name] = {
        range: rowCount > 0 ? `A1:${encodeCell(rowCount - 1, colCount - 1)}` : 'A1:A1',
        rowCount,
        columnCount: colCount,
        lastCell: encodeCell(Math.max(0, rowCount - 1), Math.max(0, colCount - 1))
      };
    });

    return info;

  } catch (error) {
    console.error('❌ Error getting Excel info:', error);
    throw error;
  }
}

/**
 * Read specific range from Excel
 * @param {string} filePath - Path to the Excel file
 * @param {string} range - Excel range (e.g., 'A1:D10') — note: currently reads full sheet
 * @param {string} sheetName - Sheet name (optional)
 * @returns {Promise<Array>} Array of rows in the specified range
 */
export async function readExcelRange(filePath, range, sheetName = null) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = sheetName || workbook.worksheets[0]?.name;
    const worksheet = workbook.getWorksheet(sheet);

    const rows = worksheetToArrays(worksheet, { defval: null });
    return rows;

  } catch (error) {
    console.error('❌ Error reading Excel range:', error);
    throw error;
  }
}

/**
 * Convert Excel to CSV format
 * @param {string} filePath - Path to the Excel file
 * @param {string} sheetName - Sheet name (optional)
 * @returns {Promise<string>} CSV formatted string
 */
export async function excelToCSV(filePath, sheetName = null) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = sheetName || workbook.worksheets[0]?.name;
    const worksheet = workbook.getWorksheet(sheet);

    const rows = worksheetToArrays(worksheet, { defval: '' });
    return rows.map(row =>
      row.map(cell => {
        const val = cell === null || cell === undefined ? '' : String(cell);
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ).join('\n');

  } catch (error) {
    console.error('❌ Error converting Excel to CSV:', error);
    throw error;
  }
}

/**
 * Validate Excel file structure
 * @param {string} filePath - Path to the Excel file
 * @param {Array} requiredHeaders - Required headers for validation
 * @param {object} options - Validation options
 * @returns {Promise<object>} Validation result
 */
export async function validateExcelFile(filePath, requiredHeaders = [], options = {}) {
  try {
    const defaultOptions = {
      sheetName: null,
      headerRow: 1,
      caseSensitive: false,
      ...options
    };

    const rows = await readExcelFile(filePath, defaultOptions);

    if (rows.length === 0) {
      return {
        isValid: false,
        message: 'Excel file is empty',
        headers: [],
        missing: requiredHeaders,
        extra: []
      };
    }

    const headers = rows[0] || [];
    const normalizedHeaders = defaultOptions.caseSensitive ?
      headers :
      headers.map(h => String(h || '').toLowerCase().trim());

    const normalizedRequired = defaultOptions.caseSensitive ?
      requiredHeaders :
      requiredHeaders.map(h => h.toLowerCase());

    const missing = normalizedRequired.filter(req =>
      !normalizedHeaders.includes(req)
    );

    const extra = normalizedHeaders.filter(header =>
      header !== '' && !normalizedRequired.includes(header)
    );

    return {
      isValid: missing.length === 0,
      message: missing.length === 0 ?
        'All required headers found' :
        `Missing headers: ${missing.join(', ')}`,
      headers: headers,
      missing,
      extra,
      rowCount: rows.length - 1
    };

  } catch (error) {
    return {
      isValid: false,
      message: `Excel validation error: ${error.message}`,
      headers: [],
      missing: requiredHeaders,
      extra: [],
      error: error.message
    };
  }
}

/**
 * Clean Excel data (remove empty rows, normalize values)
 * @param {Array} rows - Raw Excel rows
 * @returns {Array} Cleaned rows
 */
export function cleanExcelData(rows) {
  if (!rows || rows.length === 0) return [];

  return rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) return row;

    return row.map((cell, cellIndex) => {
      if (cell === null || cell === undefined) return null;

      if (cell instanceof Date) {
        return cell.toISOString().split('T')[0];
      }

      if (typeof cell === 'string') {
        const cleaned = cell.trim();

        if (cleaned === '' || cleaned.toLowerCase() === 'null') return null;
        if (cleaned.toLowerCase() === 'true') return true;
        if (cleaned.toLowerCase() === 'false') return false;

        if (/^\d+\.?\d*$/.test(cleaned)) {
          const num = parseFloat(cleaned);
          if (!isNaN(num)) return num;
        }

        return cleaned;
      }

      return cell;
    });
  }).filter(row =>
    Array.isArray(row) && row.some(cell =>
      cell !== null && cell !== undefined && cell !== ''
    )
  );
}

/**
 * Complete Excel processing pipeline
 * @param {string} filePath - Path to Excel file
 * @param {Array} requiredHeaders - Required headers for validation
 * @param {object} options - Processing options
 * @returns {Promise<object>} Processing result
 */
export async function processExcelFile(filePath, requiredHeaders = [], options = {}) {
  try {
    console.log(`📊 Processing Excel file: ${filePath}`);

    const info = await getExcelInfo(filePath);
    console.log(`📋 Found ${info.sheetCount} sheets: ${info.sheetNames.join(', ')}`);

    const rawRows = await readExcelFile(filePath, options);

    if (rawRows.length === 0) {
      throw new Error('Excel file contains no data');
    }

    const cleanedRows = cleanExcelData(rawRows);
    const headers = cleanedRows[0] || [];
    const dataRows = cleanedRows.slice(1);

    let validation = { isValid: true, missing: [], extra: [] };
    if (requiredHeaders.length > 0) {
      validation = await validateExcelFile(filePath, requiredHeaders, options);
    }

    const result = {
      success: validation.isValid,
      headers,
      data: dataRows,
      rowCount: dataRows.length,
      validation,
      info,
      message: validation.isValid ?
        `Successfully processed ${dataRows.length} rows from ${info.sheetNames[0]}` :
        validation.message
    };

    console.log(`✅ Excel processing complete:`, {
      rows: result.rowCount,
      headers: result.headers.length,
      valid: result.success,
      sheet: info.sheetNames[0]
    });

    return result;

  } catch (error) {
    console.error('❌ Excel processing failed:', error);
    return {
      success: false,
      headers: [],
      data: [],
      rowCount: 0,
      validation: { isValid: false, missing: [], extra: [] },
      message: error.message,
      error: error.message
    };
  }
}

export default {
  readExcelFile,
  getExcelInfo,
  readExcelRange,
  excelToCSV,
  validateExcelFile,
  cleanExcelData,
  processExcelFile
};
