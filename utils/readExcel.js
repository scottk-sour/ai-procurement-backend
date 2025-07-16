// utils/readExcel.js
import fs from 'fs';
import * as XLSX from 'xlsx';

/**
 * Read and parse Excel file
 * @param {string} filePath - Path to the Excel file
 * @param {object} options - Excel reading options
 * @returns {Array} Array of rows (first row is headers)
 */
export function readExcelFile(filePath, options = {}) {
  try {
    console.log(`📊 Reading Excel file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const defaultOptions = {
      sheetName: null, // null = first sheet
      headerRow: 1, // 1-indexed
      range: null, // null = entire sheet
      raw: false, // false = formatted values, true = raw values
      dateNF: 'yyyy-mm-dd', // Date format
      cellDates: true, // Parse dates
      cellFormulas: false, // Don't include formulas
      cellStyles: false, // Don't include styles
      ...options
    };

    // Read the workbook
    const workbook = XLSX.readFile(filePath, {
      cellDates: defaultOptions.cellDates,
      cellFormulas: defaultOptions.cellFormulas,
      cellStyles: defaultOptions.cellStyles,
      dateNF: defaultOptions.dateNF
    });

    // Get sheet name
    const sheetName = defaultOptions.sheetName || workbook.SheetNames[0];
    
    if (!workbook.Sheets[sheetName]) {
      throw new Error(`Sheet '${sheetName}' not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
    }

    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with options
    const jsonOptions = {
      header: 1, // Return array of arrays
      raw: defaultOptions.raw,
      range: defaultOptions.range,
      defval: null // Default value for empty cells
    };

    const rows = XLSX.utils.sheet_to_json(worksheet, jsonOptions);
    
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
 * @returns {object} Workbook information
 */
export function getExcelInfo(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { bookSheets: true });
    
    const info = {
      sheetNames: workbook.SheetNames,
      sheetCount: workbook.SheetNames.length,
      sheets: {}
    };

    // Get basic info for each sheet
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      
      info.sheets[sheetName] = {
        range: worksheet['!ref'],
        rowCount: range.e.r + 1,
        columnCount: range.e.c + 1,
        lastCell: XLSX.utils.encode_cell(range.e)
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
 * @param {string} range - Excel range (e.g., 'A1:D10')
 * @param {string} sheetName - Sheet name (optional)
 * @returns {Array} Array of rows in the specified range
 */
export function readExcelRange(filePath, range, sheetName = null) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheet];
    
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      range: range,
      defval: null
    });

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
 * @returns {string} CSV formatted string
 */
export function excelToCSV(filePath, sheetName = null) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheet];
    
    return XLSX.utils.sheet_to_csv(worksheet);

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
 * @returns {object} Validation result
 */
export function validateExcelFile(filePath, requiredHeaders = [], options = {}) {
  try {
    const defaultOptions = {
      sheetName: null,
      headerRow: 1,
      caseSensitive: false,
      ...options
    };

    const rows = readExcelFile(filePath, defaultOptions);
    
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
      rowCount: rows.length - 1 // Exclude header row
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
      // Handle different cell types
      if (cell === null || cell === undefined) return null;
      
      // Handle dates
      if (cell instanceof Date) {
        return cell.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      
      // Handle strings
      if (typeof cell === 'string') {
        const cleaned = cell.trim();
        
        // Convert common string representations
        if (cleaned === '' || cleaned.toLowerCase() === 'null') return null;
        if (cleaned.toLowerCase() === 'true') return true;
        if (cleaned.toLowerCase() === 'false') return false;
        
        // Try to convert to number if it looks like one
        if (/^\d+\.?\d*$/.test(cleaned)) {
          const num = parseFloat(cleaned);
          if (!isNaN(num)) return num;
        }
        
        return cleaned;
      }
      
      return cell;
    });
  }).filter(row => 
    // Remove completely empty rows
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
 * @returns {object} Processing result
 */
export async function processExcelFile(filePath, requiredHeaders = [], options = {}) {
  try {
    console.log(`📊 Processing Excel file: ${filePath}`);
    
    // Get file info first
    const info = getExcelInfo(filePath);
    console.log(`📋 Found ${info.sheetCount} sheets: ${info.sheetNames.join(', ')}`);
    
    // Read the data
    const rawRows = readExcelFile(filePath, options);
    
    if (rawRows.length === 0) {
      throw new Error('Excel file contains no data');
    }
    
    // Clean the data
    const cleanedRows = cleanExcelData(rawRows);
    const headers = cleanedRows[0] || [];
    const dataRows = cleanedRows.slice(1);
    
    // Validate headers if required
    let validation = { isValid: true, missing: [], extra: [] };
    if (requiredHeaders.length > 0) {
      validation = validateExcelFile(filePath, requiredHeaders, options);
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