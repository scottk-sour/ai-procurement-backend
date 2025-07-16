// utils/readCSV.js
import fs from 'fs';
import { parse } from 'csv-parse';

/**
 * Read and parse CSV file
 * @param {string} filePath - Path to the CSV file
 * @param {object} options - CSV parsing options
 * @returns {Promise<Array>} Array of rows (first row is headers)
 */
export async function readCSVFile(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    const defaultOptions = {
      columns: false, // Don't use first row as column names
      skip_empty_lines: true,
      trim: true,
      quote: '"',
      delimiter: ',',
      ...options
    };

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      reject(new Error(`CSV file not found: ${filePath}`));
      return;
    }

    const stream = fs.createReadStream(filePath)
      .pipe(parse(defaultOptions))
      .on('data', (row) => {
        results.push(row);
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        reject(error);
      })
      .on('end', () => {
        console.log(`✅ CSV file parsed successfully: ${results.length} rows`);
        resolve(results);
      });
  });
}

/**
 * Parse CSV from string content
 * @param {string} csvContent - CSV content as string
 * @param {object} options - CSV parsing options
 * @returns {Promise<Array>} Array of rows
 */
export async function parseCSVString(csvContent, options = {}) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    const defaultOptions = {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      quote: '"',
      delimiter: ',',
      ...options
    };

    parse(csvContent, defaultOptions, (error, records) => {
      if (error) {
        console.error('CSV string parsing error:', error);
        reject(error);
      } else {
        console.log(`✅ CSV string parsed successfully: ${records.length} rows`);
        resolve(records);
      }
    });
  });
}

/**
 * Validate CSV headers against expected schema
 * @param {Array} headers - Array of header strings
 * @param {Array} requiredHeaders - Array of required header strings
 * @returns {object} Validation result
 */
export function validateCSVHeaders(headers, requiredHeaders) {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  const normalizedRequired = requiredHeaders.map(h => h.toLowerCase());
  
  const missing = normalizedRequired.filter(req => 
    !normalizedHeaders.includes(req)
  );
  
  const extra = normalizedHeaders.filter(header => 
    !normalizedRequired.includes(header) && 
    header !== '' // Ignore empty headers
  );

  return {
    isValid: missing.length === 0,
    missing,
    extra,
    message: missing.length > 0 ? 
      `Missing required headers: ${missing.join(', ')}` : 
      'All required headers present'
  };
}

/**
 * Auto-detect CSV delimiter
 * @param {string} csvContent - First few lines of CSV
 * @returns {string} Detected delimiter
 */
export function detectCSVDelimiter(csvContent) {
  const sample = csvContent.split('\n').slice(0, 5).join('\n');
  const delimiters = [',', ';', '\t', '|'];
  
  let bestDelimiter = ',';
  let maxColumns = 0;
  
  delimiters.forEach(delimiter => {
    const lines = sample.split('\n');
    const columnCounts = lines.map(line => {
      // Simple split - not perfect but good for detection
      return line.split(delimiter).length;
    });
    
    // Check consistency and count
    const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
    const consistent = columnCounts.every(count => 
      Math.abs(count - avgColumns) <= 1
    );
    
    if (consistent && avgColumns > maxColumns) {
      maxColumns = avgColumns;
      bestDelimiter = delimiter;
    }
  });
  
  console.log(`🔍 Detected CSV delimiter: '${bestDelimiter}' (${maxColumns} columns)`);
  return bestDelimiter;
}

/**
 * Clean and normalize CSV data
 * @param {Array} rows - Raw CSV rows
 * @returns {Array} Cleaned rows
 */
export function cleanCSVData(rows) {
  if (!rows || rows.length === 0) return [];
  
  return rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) return row;
    
    return row.map((cell, cellIndex) => {
      if (typeof cell !== 'string') return cell;
      
      let cleaned = cell.trim();
      
      // Remove common CSV artifacts
      cleaned = cleaned.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
      cleaned = cleaned.replace(/\r/g, ''); // Remove carriage returns
      
      // Handle special cases
      if (cleaned === 'NULL' || cleaned === 'null' || cleaned === '') {
        return null;
      }
      
      // Try to convert numbers
      if (/^\d+\.?\d*$/.test(cleaned)) {
        const num = parseFloat(cleaned);
        if (!isNaN(num)) return num;
      }
      
      // Try to convert booleans
      if (cleaned.toLowerCase() === 'true') return true;
      if (cleaned.toLowerCase() === 'false') return false;
      
      return cleaned;
    });
  });
}

/**
 * Complete CSV processing pipeline
 * @param {string} filePath - Path to CSV file
 * @param {Array} requiredHeaders - Required headers for validation
 * @param {object} options - Processing options
 * @returns {Promise<object>} Processing result
 */
export async function processCSVFile(filePath, requiredHeaders = [], options = {}) {
  try {
    console.log(`📊 Processing CSV file: ${filePath}`);
    
    // Read raw content for delimiter detection if needed
    if (options.autoDetectDelimiter) {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const delimiter = detectCSVDelimiter(rawContent.substring(0, 1000));
      options.delimiter = delimiter;
    }
    
    // Parse CSV
    const rawRows = await readCSVFile(filePath, options);
    
    if (rawRows.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    // Clean data
    const cleanedRows = cleanCSVData(rawRows);
    const headers = cleanedRows[0];
    const dataRows = cleanedRows.slice(1);
    
    // Validate headers if required
    let headerValidation = { isValid: true, missing: [], extra: [] };
    if (requiredHeaders.length > 0) {
      headerValidation = validateCSVHeaders(headers, requiredHeaders);
    }
    
    const result = {
      success: headerValidation.isValid,
      headers,
      data: dataRows,
      rowCount: dataRows.length,
      validation: headerValidation,
      message: headerValidation.isValid ? 
        `Successfully processed ${dataRows.length} rows` : 
        headerValidation.message
    };
    
    console.log(`✅ CSV processing complete:`, {
      rows: result.rowCount,
      headers: result.headers.length,
      valid: result.success
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ CSV processing failed:', error);
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
  readCSVFile,
  parseCSVString,
  validateCSVHeaders,
  detectCSVDelimiter,
  cleanCSVData,
  processCSVFile
};