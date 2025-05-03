import fs from 'fs';
import path from 'path';

/**
 * Placeholder utility for parsing files
 * Extend this to extract useful info (e.g., from PDFs or CSVs)
 */
const FileParser = {
  async parseFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const fileData = fs.readFileSync(fullPath, 'utf-8');
      console.log(`📄 Parsed file at: ${fullPath}`);
      return fileData; // You can later extract structured info here
    } catch (err) {
      console.error('❌ Failed to parse file:', err.message);
      return null;
    }
  },
};

export default FileParser;
