import xlsx from "xlsx";
import fs from "fs";

export function readExcelFile(filePath) {
  try {
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    // Read the Excel file
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Get the first sheet
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    return data; // Returns an array of objects
  } catch (error) {
    console.error("Error reading Excel file:", error);
    return null;
  }
}
