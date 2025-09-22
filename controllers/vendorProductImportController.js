// controllers/vendorProductImportController.js - Complete version with FIXED schema mapping
import fs from 'fs';
import Papa from 'papaparse';
import VendorProduct from "../models/VendorProduct.js";
import { readExcelFile } from '../utils/readExcel.js';
import { processCSVFile } from '../utils/readCSV.js';

/**
 * Enhanced validation with header mapping - FIXED to match VendorProduct schema
 */
export class VendorUploadValidator {
  
  // Required headers that are truly essential
  static requiredHeaders = [
    'manufacturer',
    'model', 
    'category'
  ];

  // Optional headers with defaults
  static optionalHeaders = [
    'description',
    'speed',
    'paper_size_primary',
    'paper_sizes_supported',
    'volume_min_monthly',
    'volume_max_monthly',
    'machine_cost',
    'installation_cost',
    'profit_margin',
    'cpc_mono_pence',
    'cpc_colour_pence',
    'cpc_a3_mono_pence',
    'cpc_a3_colour_pence',
    'features',
    'lease_terms',
    'auxiliaries',
    'service_level',
    'response_time',
    'quarterly_service',
    'regions_covered',
    'industries'
  ];

  // Header mapping to handle variations
  static headerMappings = {
    'machinecost': 'machine_cost',
    'profitmargin': 'profit_margin',
    'cpca4mono': 'cpc_mono_pence',
    'cpca4colour': 'cpc_colour_pence',
    'cpca3mono': 'cpc_a3_mono_pence',
    'cpca3colour': 'cpc_a3_colour_pence',
    'papersizeprimary': 'paper_size_primary',
    'papersizessupported': 'paper_sizes_supported',
    'minvolume': 'volume_min_monthly',
    'maxvolume': 'volume_max_monthly',
    'servicelevel': 'service_level',
    'responsetime': 'response_time',
    'quarterlyservice': 'quarterly_service',
    'regionscovered': 'regions_covered',
    'installation': 'installation_cost'
  };

  // FIXED: Enum mappings that match your VendorProduct model exactly
  static PAPER_SIZE_ENUM = {
    'A4': 'A4',
    'A3': 'A3', 
    'A5': 'A5',
    'SRA3': 'SRA3',
    'A6': 'A6',
    'Letter': 'Letter',
    'Legal': 'Legal',
    'Tabloid': 'Tabloid',
    'a4': 'A4',
    'a3': 'A3',
    'sra3': 'SRA3'
  };

  static RESPONSE_TIME_ENUM = {
    '4hr': '4 hours',
    '8hr': '8 hours', 
    '24hr': '24 hours',
    '48hr': '48 hours',
    'Same day': 'Same day',
    'Next day': 'Next day',
    '4 hours': '4 hours',
    '8 hours': '8 hours',
    '24 hours': '24 hours',
    '48 hours': '48 hours'
  };

  static SERVICE_LEVEL_ENUM = {
    'Standard': 'Standard',
    'Premium': 'Premium', 
    'Enterprise': 'Enterprise',
    'Basic': 'Basic'
  };

  // Default values for missing fields
  static defaultValues = {
    'profit_margin': 250,
    'cpc_mono_pence': 0.35,
    'cpc_colour_pence': 3.5,
    'cpc_a3_mono_pence': 0.4,
    'cpc_a3_colour_pence': 3.8,
    'speed': 30,
    'machine_cost': 1000,
    'installation_cost': 250,
    'paper_size_primary': 'A4',
    'paper_sizes_supported': 'A4,A3',
    'volume_min_monthly': 1000,
    'volume_max_monthly': 15000,
    'features': 'Print,Copy,Scan',
    'lease_terms': '36:0.6,48:0.55,60:0.5',
    'service_level': 'Standard',
    'response_time': '24 hours',
    'quarterly_service': 150,
    'regions_covered': 'UK',
    'industries': 'General',
    'description': ''
  };

  // Normalize headers function
  static normalizeHeaders(headers) {
    return headers.map(header => {
      const cleaned = header.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return this.headerMappings[cleaned] || header.toLowerCase().trim();
    });
  }

  // Validate volume and speed alignment
  static validateVolumeSpeedAlignment(minVol, maxVol, speed) {
    const issues = [];
    
    if (minVol && maxVol) {
      const validRanges = [
        [1, 6000], [6001, 13000], [13001, 20000], 
        [20001, 30000], [30001, 40000], [40001, 50000], [50001, 999999]
      ];
      
      const rangeValid = validRanges.some(([min, max]) => 
        minVol >= min && maxVol <= max && maxVol > minVol
      );
      
      if (!rangeValid) {
        issues.push(`Volume range ${minVol}-${maxVol} doesn't align with standard ranges`);
      }
    }
    
    return issues;
  }

  // Validate CPC rates
  static validateCPCRates(monoCPC, colourCPC) {
    const issues = [];
    
    if (monoCPC && (monoCPC < 0.2 || monoCPC > 3)) {
      issues.push(`Mono CPC ${monoCPC}p seems unrealistic (typical range: 0.2p-3p)`);
    }
    
    if (colourCPC && colourCPC > 0 && (colourCPC < 2 || colourCPC > 15)) {
      issues.push(`Colour CPC ${colourCPC}p seems unrealistic (typical range: 2p-15p)`);
    }
    
    return issues;
  }

  // Helper to normalize enum values
  static normalizeEnum(value, enumMap, defaultValue = null) {
    if (!value) return defaultValue;
    const str = value.toString().trim();
    return enumMap[str] || enumMap[str.toLowerCase()] || enumMap[str.toUpperCase()] || defaultValue;
  }

  // Parse paper sizes array
  static parsePaperSizes(sizesString) {
    if (!sizesString) return ['A4'];
    
    const sizes = sizesString.toString().split(',').map(s => s.trim());
    const validSizes = sizes.map(size => this.normalizeEnum(size, this.PAPER_SIZE_ENUM))
                           .filter(Boolean);
    
    return validSizes.length > 0 ? validSizes : ['A4'];
  }

  // Parse lease terms
  static parseLeaseTerms(leaseString) {
    if (!leaseString) {
      return [
        { term: 36, rate: 0.6 },
        { term: 48, rate: 0.55 },
        { term: 60, rate: 0.5 }
      ];
    }
    
    try {
      const separator = leaseString.includes(';') ? ';' : ',';
      return leaseString.split(separator).map(pair => {
        const [term, rate] = pair.split(':');
        if (term && rate && !isNaN(term) && !isNaN(rate)) {
          return {
            term: parseInt(term.trim()),
            rate: parseFloat(rate.trim())
          };
        }
        return null;
      }).filter(Boolean);
    } catch (error) {
      console.warn('Error parsing lease terms:', error);
      return [
        { term: 36, rate: 0.6 },
        { term: 48, rate: 0.55 },
        { term: 60, rate: 0.5 }
      ];
    }
  }

  // Parse features array
  static parseFeatures(featuresString) {
    if (!featuresString) return [];
    return featuresString.toString().split(',').map(f => f.trim()).filter(Boolean);
  }

  // Parse regions array
  static parseRegions(regionsString) {
    if (!regionsString) return [];
    return regionsString.toString().split(',').map(r => r.trim()).filter(Boolean);
  }

  /**
   * FIXED: Parse CSV row to match VendorProduct schema exactly
   */
  static parseRow(row, originalHeaders) {
    const normalizedHeaders = this.normalizeHeaders(originalHeaders);
    const product = {};
    
    // Map CSV row to product object using normalized headers
    normalizedHeaders.forEach((header, index) => {
      const value = row[index];
      product[header] = value;
    });
    
    // Apply defaults for missing values
    Object.keys(this.defaultValues).forEach(header => {
      if (!product[header] || product[header] === '') {
        product[header] = this.defaultValues[header];
      }
    });
    
    // FIXED: Create flat structure that matches your VendorProduct model
    return {
      // Basic required fields
      manufacturer: product.manufacturer ? product.manufacturer.toString().trim() : '',
      model: product.model ? product.model.toString().trim() : '',
      category: product.category ? product.category.toString().trim() : 'A4 MFP',
      description: product.description ? product.description.toString().trim() : 
        `${product.manufacturer || ''} ${product.model || ''}`.trim(),
      
      // Performance - flat fields
      speed: product.speed ? parseInt(product.speed) : this.defaultValues.speed,
      
      // Paper sizes - check your model schema format
      paperSizePrimary: this.normalizeEnum(product.paper_size_primary, this.PAPER_SIZE_ENUM) || 'A4',
      paperSizesSupported: this.parsePaperSizes(product.paper_sizes_supported),
      
      // Volume - flat fields
      volumeMinMonthly: product.volume_min_monthly ? parseInt(product.volume_min_monthly) : this.defaultValues.volume_min_monthly,
      volumeMaxMonthly: product.volume_max_monthly ? parseInt(product.volume_max_monthly) : this.defaultValues.volume_max_monthly,
      
      // Costs - flat fields (not nested)
      machineCost: product.machine_cost ? parseFloat(product.machine_cost) : this.defaultValues.machine_cost,
      installationCost: product.installation_cost ? parseFloat(product.installation_cost) : this.defaultValues.installation_cost,
      profitMargin: product.profit_margin ? parseFloat(product.profit_margin) : this.defaultValues.profit_margin,
      
      // CPC rates - flat fields
      cpcMonoPence: product.cpc_mono_pence ? parseFloat(product.cpc_mono_pence) : this.defaultValues.cpc_mono_pence,
      cpcColourPence: product.cpc_colour_pence ? parseFloat(product.cpc_colour_pence) : this.defaultValues.cpc_colour_pence,
      cpcA3MonoPence: product.cpc_a3_mono_pence ? parseFloat(product.cpc_a3_mono_pence) : this.defaultValues.cpc_a3_mono_pence,
      cpcA3ColourPence: product.cpc_a3_colour_pence ? parseFloat(product.cpc_a3_colour_pence) : this.defaultValues.cpc_a3_colour_pence,
      
      // Lease terms - array
      leaseTerms: this.parseLeaseTerms(product.lease_terms),
      
      // Features - array
      features: this.parseFeatures(product.features),
      
      // Service - check if your model expects flat fields or nested object
      serviceLevel: this.normalizeEnum(product.service_level, this.SERVICE_LEVEL_ENUM) || 'Standard',
      responseTime: this.normalizeEnum(product.response_time, this.RESPONSE_TIME_ENUM) || '24 hours',
      quarterlyService: product.quarterly_service ? 
        ['yes', 'true', '1'].includes(product.quarterly_service.toString().toLowerCase()) : false,
      
      // Coverage - arrays
      regionsCovered: this.parseRegions(product.regions_covered),
      industries: this.parseFeatures(product.industries),
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Flexible validation - only check essential fields
   */
  static validateProduct(product, rowNumber) {
    const errors = [];
    const warnings = [];
    
    // Only validate truly essential fields
    const requiredFields = ['manufacturer', 'model', 'category'];
    
    requiredFields.forEach(field => {
      if (!product[field] || product[field].toString().trim() === '') {
        errors.push(`Missing required field '${field}'`);
      }
    });
    
    // Volume and speed alignment validation
    if (product.volumeMinMonthly && product.volumeMaxMonthly && product.speed) {
      const alignmentIssues = this.validateVolumeSpeedAlignment(
        product.volumeMinMonthly, 
        product.volumeMaxMonthly, 
        product.speed
      );
      alignmentIssues.forEach(issue => warnings.push(issue));
    }
    
    // CPC rate validation
    if (product.cpcMonoPence !== undefined && product.cpcColourPence !== undefined) {
      const cpcIssues = this.validateCPCRates(product.cpcMonoPence, product.cpcColourPence);
      cpcIssues.forEach(issue => warnings.push(issue));
    }
    
    return {
      isValid: errors.length === 0,
      product: errors.length === 0 ? product : null,
      errors,
      warnings
    };
  }

  /**
   * Upload validation with header mapping
   */
  static validateUpload(csvData, originalHeaders) {
    const normalizedHeaders = this.normalizeHeaders(originalHeaders);
    
    const validation = {
      success: true,
      validProducts: [],
      errors: [],
      warnings: [],
      stats: {
        total: csvData.length,
        valid: 0,
        invalid: 0
      }
    };
    
    // Check for required headers
    const missingHeaders = this.requiredHeaders.filter(h => 
      !normalizedHeaders.includes(h.toLowerCase())
    );
    
    if (missingHeaders.length > 0) {
      validation.errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
      validation.success = false;
      return validation;
    }
    
    // Check optional headers
    const missingOptional = this.optionalHeaders.filter(h => 
      !normalizedHeaders.includes(h.toLowerCase())
    );
    
    if (missingOptional.length > 0) {
      validation.warnings.push(`Missing optional headers (will use defaults): ${missingOptional.join(', ')}`);
    }
    
    // Validate each row
    csvData.forEach((row, index) => {
      const rowNumber = index + 2;
      
      // Skip empty rows
      if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
        return;
      }
      
      const product = this.parseRow(row, originalHeaders);
      const result = this.validateProduct(product, rowNumber);
      
      if (result.errors.length > 0) {
        validation.errors.push(`Row ${rowNumber}: ${result.errors.join(', ')}`);
        validation.stats.invalid++;
      } else {
        validation.validProducts.push(result.product);
        validation.stats.valid++;
      }
      
      if (result.warnings.length > 0) {
        validation.warnings.push(`Row ${rowNumber}: ${result.warnings.join(', ')}`);
      }
    });
    
    validation.success = validation.errors.length === 0;
    return validation;
  }

  static validateProduct(product, mode = 'create') {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!product.manufacturer) errors.push('Manufacturer is required');
    if (!product.model) errors.push('Model is required');
    if (!product.category) errors.push('Category is required');

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * FIXED: Import function that creates proper VendorProduct documents
 */
export async function importVendorProducts(filePath, vendorId) {
  console.log('🔍 Starting import for vendor:', vendorId);
  
  try {
    const ext = filePath.split('.').pop().toLowerCase();
    let rows = [];
    
    if (ext === 'xlsx' || ext === 'xls') {
      rows = readExcelFile(filePath);
    } else if (ext === 'csv') {
      // Use Papa Parse for better CSV handling
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parseResult = Papa.parse(fileContent, {
        header: false,
        skipEmptyLines: true,
        trimHeaders: true,
        dynamicTyping: false,
        delimitersToGuess: [',', '\t', '|', ';']
      });
      
      if (parseResult.errors.length > 0) {
        console.error('CSV Parse Errors:', parseResult.errors);
        throw new Error(`CSV parsing failed: ${parseResult.errors[0].message}`);
      }
      
      rows = parseResult.data;
    } else {
      throw new Error('Unsupported file format. Please upload CSV or Excel file.');
    }
    
    console.log(`📋 File parsed: ${rows.length} total rows`);
    
    if (!rows || rows.length < 2) {
      throw new Error('File must contain at least a header row and one data row');
    }
    
    const originalHeaders = rows[0];
    const dataRows = rows.slice(1);
    
    console.log('📄 Headers:', originalHeaders);
    console.log('📊 Data rows:', dataRows.length);
    
    // Validate upload
    const validation = VendorUploadValidator.validateUpload(dataRows, originalHeaders);
    
    console.log('✅ Validation result:', {
      success: validation.success,
      valid: validation.stats.valid,
      invalid: validation.stats.invalid,
      errors: validation.errors.length,
      warnings: validation.warnings.length
    });
    
    if (!validation.success) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
        stats: validation.stats
      };
    }
    
    // Save valid products
    const savedProducts = [];
    for (const productData of validation.validProducts) {
      productData.vendorId = vendorId;
      
      try {
        // Check for existing product
        const existing = await VendorProduct.findOne({
          vendorId,
          manufacturer: productData.manufacturer,
          model: productData.model
        });

        if (existing) {
          // Update existing
          await VendorProduct.findByIdAndUpdate(existing._id, productData);
          validation.warnings.push(`Updated existing product ${productData.manufacturer} ${productData.model}`);
        } else {
          // Create new
          const product = new VendorProduct(productData);
          await product.save();
          savedProducts.push(product);
        }
        
        console.log(`✅ Saved product: ${productData.manufacturer} ${productData.model}`);
      } catch (saveError) {
        console.error(`❌ Error saving ${productData.manufacturer} ${productData.model}:`, saveError.message);
        validation.errors.push(`Error saving ${productData.manufacturer} ${productData.model}: ${saveError.message}`);
      }
    }
    
    console.log(`🎉 Import complete: ${savedProducts.length} products saved`);
    
    return {
      success: savedProducts.length > 0,
      savedProducts: savedProducts.length,
      errors: validation.errors,
      warnings: validation.warnings,
      stats: {
        ...validation.stats,
        saved: savedProducts.length
      }
    };
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    return {
      success: false,
      savedProducts: 0,
      errors: [error.message],
      warnings: [],
      stats: { total: 0, valid: 0, invalid: 0, saved: 0 }
    };
  }
}

/**
 * Additional utility functions
 */
export async function deleteVendorProducts(vendorId, productIds = []) {
  try {
    let deletedCount = 0;
    
    if (productIds.length > 0) {
      const result = await VendorProduct.deleteMany({
        vendorId,
        _id: { $in: productIds }
      });
      deletedCount = result.deletedCount;
    } else {
      const result = await VendorProduct.deleteMany({ vendorId });
      deletedCount = result.deletedCount;
    }
    
    console.log(`🗑️ Deleted ${deletedCount} products for vendor ${vendorId}`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('❌ Error deleting products:', error);
    return { success: false, error: error.message };
  }
}

export async function getVendorUploadStats(vendorId) {
  try {
    const totalProducts = await VendorProduct.countDocuments({ vendorId });
    const productsByCategory = await VendorProduct.aggregate([
      { $match: { vendorId } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    const recentUploads = await VendorProduct.find({ vendorId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('manufacturer model createdAt category');
    
    return {
      success: true,
      stats: {
        totalProducts,
        productsByCategory,
        recentUploads
      }
    };
  } catch (error) {
    console.error('❌ Error getting upload stats:', error);
    return { success: false, error: error.message };
  }
}

export function generateCSVTemplate() {
  const headers = [
    'manufacturer',
    'model',
    'category',
    'description',
    'speed',
    'paper_size_primary',
    'paper_sizes_supported',
    'volume_min_monthly',
    'volume_max_monthly',
    'machine_cost',
    'installation_cost',
    'profit_margin',
    'cpc_mono_pence',
    'cpc_colour_pence',
    'cpc_a3_mono_pence',
    'cpc_a3_colour_pence',
    'lease_terms',
    'features',
    'service_level',
    'response_time',
    'quarterly_service',
    'regions_covered',
    'industries'
  ];

  const sampleRow = [
    'Xerox',
    'WorkCentre 7830',
    'A3 MFP',
    'High-performance A3 multifunction device',
    '30',
    'A3',
    'A3,A4,A5',
    '5000',
    '30000',
    '3500',
    '300',
    '500',
    '0.4',
    '4.2',
    '0.45',
    '4.5',
    '36:0.6,48:0.55,60:0.5',
    'Print,Copy,Scan,Fax,Email',
    'Standard',
    '24 hours',
    '200',
    'London,Essex,Kent',
    'Legal,Healthcare,Education'
  ];

  return {
    headers,
    sampleRow,
    csvContent: [headers.join(','), sampleRow.join(',')].join('\n')
  };
}
