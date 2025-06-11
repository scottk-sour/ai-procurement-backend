// /services/FileParserService.js

import FileProcessor from '../utils/fileProcessor.js';

const FileParserService = {
  async processFile(filePath) {
    return await FileProcessor.processFile(filePath);
  }
};

export default FileParserService;
