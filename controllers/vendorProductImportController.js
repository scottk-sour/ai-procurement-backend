// controllers/vendorProductImportController.js - FIXED to match VendorProduct schema
import fs from 'fs';
import Papa from 'papaparse';
import VendorProduct from "../models/VendorProduct.js";
import { readExcelFile } from '../utils/readExcel.js';
import { processCSVFile } from '../utils/readCSV.js';

/**
 * FIXED: Enhanced validation with correct schema mapping
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

  // FIXED: Enum mappings that match VendorProduct model exactly
  static PAPER_SIZE_ENUM = {
    'A4': 'A4',
    'A3': 'A3', 
    'A5': 'A5',
    'SRA3': 'SRA3',
    'a4': 'A4',
    'a3': 'A3',
    'sra3': 'SRA3'
  };

  static RESPONSE_TIME_ENUM = {
    '4hr': '4hr',
    '8hr': '8hr', 
    'Next day': 'Next day',
    '4 hours': '4hr',
    '8 hours': '8hr',
    '24 hours': 'Next day',
    '48 hours': 'Next day'
  };

  static SERVICE_LEVEL_ENUM = {
    'Standard': 'Standard',
    'Premium': 'Premium', 
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
    'response_time': 'Next day',
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

  // Parse lease terms - FIXED to match schema structure
  static parseLeaseTerms(leaseString) {
    if (!leaseString) {
      return [
        { term: 36, margin: 0.6 },
        { term: 48, margin: 0.55 },
        { term: 60, margin: 0.5 }
      ];
    }
    
    try {
      const separator = leaseString.includes(';') ? ';' : ',';
      return leaseString.split(separator).map(pair => {
        const [term, margin] = pair.split(':');
        if (term && margin && !isNaN(term) && !isNaN(margin)) {
          return {
            term: parseInt(term.trim()),
            margin: parseFloat(margin.trim())
          };
        }
        return null;
      }).filter(Boolean);
    } catch (error) {
      console.warn('Error parsing lease terms:', error);
      return [
        { term: 36, margin: 0.6 },
        { term: 48, margin: 0.55 },
        { term: 60, margin: 0.5 }
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
   * FIXED: Parse CSV row to match VendorProduct schema EXACTLY
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
    
    // FIXED: Create structure that matches VendorProduct schema exactly
    return {
      // Basic required fields
      manufacturer: product.manufacturer ? product.manufacturer.toString().trim() : '',
      model: product.model ? product.model.toString().trim() : '',
      category: product.category ? product.category.toString().trim() : 'A4 MFP',
      description: product.description ? product.description.toString().trim() : 
        `${product.manufacturer || ''} ${product.model || ''}`.trim(),
      
      // Performance
      speed: product.speed ? parseInt(product.speed) : this.defaultValues.speed,
      isA3: product.paper_size_primary === 'A3' || product.paper_size_primary === 'SRA3',
      features: this.parseFeatures(product.features),
      
      // FIXED: Volume fields to match schema
      minVolume: product.volume_min_monthly ? parseInt(product.volume_min_monthly) : this.defaultValues.volume_min_monthly,
      maxVolume: product.volume_max_monthly ? parseInt(product.volume_max_monthly) : this.defaultValues.volume_max_monthly,
      
      // FIXED: Paper sizes - nested structure matching schema
      paperSizes: {
        primary: this.normalizeEnum(product.paper_size_primary, this.PAPER_SIZE_ENUM) || 'A4',
        supported: this.parsePaperSizes(product.paper_sizes_supported)
      },
      
      // FIXED: Costs - nested structure matching schema
      costs: {
        machineCost: product.machine_cost ? parseFloat(product.machine_cost) : this.defaultValues.machine_cost,
        installation: product.installation_cost ? parseFloat(product.installation_cost) : this.defaultValues.installation_cost,
        profitMargin: product.profit_margin ? parseFloat(product.profit_margin) : this.defaultValues.profit_margin,
        cpcRates: {
          A4Mono: product.cpc_mono_pence ? parseFloat(product.cpc_mono_pence) : this.defaultValues.cpc_mono_pence,
          A4Colour: product.cpc_colour_pence ? parseFloat(product.cpc_colour_pence) : this.defaultValues.cpc_colour_pence,
          A3Mono: product.cpc_a3_mono_pence ? parseFloat(product.cpc_a3_mono_pence) : this.defaultValues.cpc_a3_mono_pence,
          A3Colour: product.cpc_a3_colour_pence ? parseFloat(product.cpc_a3_colour_pence) : this.defaultValues.cpc_a3_colour_pence
        }
      },
      
      // FIXED: Lease terms - matching schema structure
      leaseTermsAndMargins: this.parseLeaseTerms(product.lease_terms),
      
      // FIXED: Service - nested structure matching schema
      service: {
        level: this.normalizeEnum(product.service_level, this.SERVICE_LEVEL_ENUM) || 'Standard',
        responseTime: this.normalizeEnum(product.response_time, this.RESPONSE_TIME_ENUM) || 'Next day',
        quarterlyService: product.quarterly_service ? parseFloat(product.quarterly_service) : this.defaultValues.quarterly_service
      },
      
      // Coverage arrays
      regionsCovered: this.parseRegions(product.regions_covered),
      industries: this.parseFeatures(product.industries),
      
      // Availability defaults
      availability: {
        inStock: true,
        leadTime: 14,
        installationWindow: 7
      },
      
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
    
    // Validate volume range makes sense
    if (product.minVolume && product.maxVolume && product.minVolume >= product.maxVolume) {
      errors.push(`Min volume (${product.minVolume}) must be less than max volume (${product.maxVolume})`);
    }
    
    // Validate CPC rates are reasonable
    if (product.costs?.cpcRates?.A4Mono && (product.costs.cpcRates.A4Mono < 0.1 || product.costs.cpcRates.A4Mono > 5)) {
      warnings.push(`Mono CPC ${product.costs.cpcRates.A4Mono}p seems unusual (typical range: 0.2p-3p)`);
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
    'Next day',
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
