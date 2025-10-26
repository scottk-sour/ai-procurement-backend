import fs from 'fs';
import path from 'path';
import AppError from './AppError.js';
import logger from '../services/logger.js';

const FILE_SIGNATURES = {
  pdf: { signature: [0x25, 0x50, 0x44, 0x46], offset: 0, mimeTypes: ['application/pdf'] },
  csv: { signature: null, offset: 0, mimeTypes: ['text/csv', 'text/plain', 'application/csv'] },
  xlsx: { signature: [0x50, 0x4B, 0x03, 0x04], offset: 0, mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'] },
  xls: { signature: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], offset: 0, mimeTypes: ['application/vnd.ms-excel', 'application/msexcel'] },
  png: { signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0, mimeTypes: ['image/png'] },
  jpg: { signature: [0xFF, 0xD8, 0xFF], offset: 0, mimeTypes: ['image/jpeg', 'image/jpg'] },
  gif: { signature: [0x47, 0x49, 0x46, 0x38], offset: 0, mimeTypes: ['image/gif'] }
};

function readFileSignature(filePath, length = 8) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    fs.closeSync(fd);
    return Array.from(buffer);
  } catch (error) {
    logger.error('Error reading file signature', { filePath, error: error.message });
    throw new Error('Failed to read file signature');
  }
}

function matchesSignature(buffer, signature) {
  if (!signature) return true;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

export function validateFileType(filePath, expectedTypes = []) {
  try {
    const ext = path.extname(filePath).toLowerCase().slice(1);

    if (expectedTypes.length > 0 && !expectedTypes.includes(ext)) {
      throw new AppError(`Invalid file type. Expected: ${expectedTypes.join(', ')}`, 400);
    }

    const fileType = FILE_SIGNATURES[ext];
    if (!fileType) {
      throw new AppError('Unsupported file type', 400);
    }

    if (ext === 'csv') {
      validateCSVContent(filePath);
      return { valid: true, fileType: ext };
    }

    const signature = readFileSignature(filePath, 8);
    if (!matchesSignature(signature, fileType.signature)) {
      throw new AppError(`File signature does not match extension .${ext}`, 400);
    }

    return { valid: true, fileType: ext, mimeTypes: fileType.mimeTypes };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('File validation failed', 500);
  }
}

function validateCSVContent(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
    fs.closeSync(fd);

    const content = buffer.slice(0, bytesRead).toString('utf8');

    if (!content.includes(',') && !content.includes(';')) {
      throw new AppError('Invalid CSV file: No delimiters found', 400);
    }
    if (!content.includes('\n') && !content.includes('\r')) {
      throw new AppError('Invalid CSV file: No line breaks found', 400);
    }
    if (content.includes('\0')) {
      throw new AppError('Invalid CSV file: Contains binary data', 400);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('CSV validation failed', 500);
  }
}

export function validateFileSize(filePath, maxSize) {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;

    if (fileSizeInBytes > maxSize) {
      const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
      const maxSizeInMB = (maxSize / (1024 * 1024)).toFixed(2);
      throw new AppError(`File size (${fileSizeInMB}MB) exceeds maximum (${maxSizeInMB}MB)`, 400);
    }

    return { valid: true, size: fileSizeInBytes };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('File size validation failed', 500);
  }
}

export function sanitizeFilename(filename, maxLength = 100) {
  let sanitized = path.basename(filename);
  sanitized = sanitized.replace(/[^\w.-]/g, '_');
  const parts = sanitized.split('.');
  const ext = parts.pop();
  const name = parts.join('_');
  sanitized = `${name}.${ext}`;

  if (sanitized.length > maxLength) {
    const extLength = ext.length + 1;
    const nameLength = maxLength - extLength;
    sanitized = sanitized.substring(0, nameLength) + '.' + ext;
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}-${sanitized}`;
}

export function getFileSizeLimit(fileType) {
  const limits = {
    csv: 10 * 1024 * 1024, xlsx: 20 * 1024 * 1024, xls: 20 * 1024 * 1024,
    pdf: 10 * 1024 * 1024, png: 5 * 1024 * 1024, jpg: 5 * 1024 * 1024, gif: 2 * 1024 * 1024
  };
  return limits[fileType] || 5 * 1024 * 1024;
}

export async function validateUploadedFile(filePath, expectedTypes = [], customMaxSize = null) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }

    const typeValidation = validateFileType(filePath, expectedTypes);
    const maxSize = customMaxSize || getFileSizeLimit(typeValidation.fileType);
    const sizeValidation = validateFileSize(filePath, maxSize);

    return {
      valid: true,
      fileType: typeValidation.fileType,
      fileSize: sizeValidation.size,
      mimeTypes: typeValidation.mimeTypes
    };
  } catch (error) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Invalid file deleted', { filePath });
      }
    } catch (deleteError) {
      logger.error('Failed to delete invalid file', { filePath, error: deleteError.message });
    }
    throw error;
  }
}

export default { validateFileType, validateFileSize, sanitizeFilename, getFileSizeLimit, validateUploadedFile };
