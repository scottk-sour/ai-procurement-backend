import xlsx from 'xlsx';
import fs from 'fs';

export function readExcelFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    return data;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    return null;
  }
}
