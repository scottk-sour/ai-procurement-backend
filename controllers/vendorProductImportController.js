// controllers/vendorProductImportController.js - Fixed for your current CSV format
import VendorProduct from "../models/VendorProduct.js";
import { readExcelFile } from '../utils/readExcel.js';
import { readCSVFile } from '../utils/readCSV.js';

/**
 * Enhanced validation matching your current CSV and future expansions
 */
class VendorUploadValidator {
  
  // Required headers that match your current CSV format
  static requiredHeaders = [
    'manufacturer',
    'model', 
    'category',
    'profit_margin',
    'cpc_mono_pence',
    'cpc_colour_pence'
  ];

  // Optional headers for future CSV expansions
  static optionalHeaders = [
    'description',
    'speed',
    'paper_size_primary',
    'paper_sizes_supported',
    'volume_min_monthly',
    'volume_max_monthly',
    'machine_cost',
    'installation_cost',
    'features',
    'lease_terms',
    'auxiliaries',
    'service_level',
    'response_time',
    'regions_covered',
    'industries',
    'stock_status',
    'model_year',
    'compliance_tags',
    'in_stock',
    'lead_time',
    'installation_window'
  ];

  /**
   * Validate volume and speed alignment (critical to prevent oversizing)
   */
  static validateVolumeSpeedAlignment(minVol, maxVol, speed) {
    const suggestedSpeed = this.getSuggestedSpeed(maxVol);
    const issues = [];
    
    if (speed && speed < suggestedSpeed * 0.7) {
      issues.push(`Speed ${speed}ppm too low for max volume ${maxVol} (suggested: ${suggestedSpeed}ppm+)`);
    }
    
    if (speed && speed > suggestedSpeed * 3) {
      issues.push(`Speed ${speed}ppm very high for max volume ${maxVol} (may be oversized)`);
    }
    
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

  static getSuggestedSpeed(monthlyVolume) {
    if (!monthlyVolume) return 30;
    if (monthlyVolume <= 6000) return 20;
    if (monthlyVolume <= 13000) return 25;
    if (monthlyVolume <= 20000) return 30;
    if (monthlyVolume <= 30000) return 35;
    if (monthlyVolume <= 40000) return 45;
    if (monthlyVolume <= 50000) return 55;
    return 65;
  }

  /**
   * Validate CPC rates are reasonable
   */
  static validateCPCRates(monoCPC, colourCPC) {
    const issues = [];
    
    if (monoCPC && (monoCPC < 0.2 || monoCPC > 3)) {
      issues.push(`Mono CPC ${monoCPC}p seems unrealistic (typical range: 0.2p-3p)`);
    }
    
    if (colourCPC && colourCPC > 0 && (colourCPC < 2 || colourCPC > 15)) {
      issues.push(`Colour CPC ${colourCPC}p seems unrealistic (typical range: 2p-15p)`);
    }
    
    if (colourCPC && monoCPC && colourCPC > 0 && colourCPC <= monoCPC) {
      issues.push(`Colour CPC should be higher than mono CPC`);
    }
    
    return issues;
  }

  // Helper functions to infer missing data from category
  static inferSpeedFromCategory(category) {
    const speeds = {
      'A4 Printers': 25,
      'A4 MFP': 35,
      'A3 MFP': 45,
      'SRA3 MFP': 50
    };
    return speeds[category] || 30;
  }

  static inferIsA3FromCategory(category) {
    return category === 'A3 MFP' || category === 'SRA3 MFP';
  }

  static inferMinVolumeFromCategory(category) {
    const minVolumes = {
      'A4 Printers': 500,
      'A4 MFP': 2000,
      'A3 MFP': 5000,
      'SRA3 MFP': 8000
    };
    return minVolumes[category] || 1000;
  }

  static inferMaxVolumeFromCategory(category) {
    const maxVolumes = {
      'A4 Printers': 5000,
      'A4 MFP': 15000,
      'A3 MFP': 30000,
      'SRA3 MFP': 50000
    };
    return maxVolumes[category] || 10000;
  }

  static inferPaperSizeFromCategory(category) {
    if (category === 'SRA3 MFP') return 'SRA3';
    if (category === 'A3 MFP') return 'A3';
    return 'A4';
  }

  static inferMachineCostFromMargin(profitMargin) {
    if (!profitMargin) return 1000;
    // Reverse engineer machine cost from profit margin (assuming margin is ~20-30% of total)
    return Math.round(profitMargin * 3.5);
  }

  static inferFeaturesFromCategory(category) {
    const featureMap = {
      'A4 Printers': ['print', 'duplex', 'network'],
      'A4 MFP': ['print', 'copy', 'scan', 'duplex', 'network', 'email'],
      'A3 MFP': ['print', 'copy', 'scan', 'fax', 'duplex', 'network', 'email', 'staple'],
      'SRA3 MFP': ['print', 'copy', 'scan', 'fax', 'duplex', 'network', 'email', 'staple', 'booklet']
    };
    return featureMap[category] || ['print'];
  }

  /**
   * Parse CSV row to product object - WORKS WITH YOUR CURRENT CSV FORMAT
   */
  static parseRow(row, headers) {
    const product = {};
    
    headers.forEach((header, index) => {
      const value = row[index];
      product[header] = value;
    });
    
    // Normalize category
    const category = this.normalizeCategory(product.category?.trim());
    
    return {
      manufacturer: product.manufacturer?.trim() || '',
      model: product.model?.trim() || '',
      category: category,
      description: product.description?.trim() || `${product.manufacturer} ${product.model}`.trim(),
      
      // Performance specs - inferred from category since not in current CSV
      speed: product.speed ? parseInt(product.speed) : this.inferSpeedFromCategory(category),
      isA3: product.is_a3 ? product.is_a3.toLowerCase() === 'true' : this.inferIsA3FromCategory(category),
      
      paperSizes: {
        primary: product.paper_size_primary?.trim() || this.inferPaperSizeFromCategory(category),
        supported: product.paper_sizes_supported ? 
          product.paper_sizes_supported.split(',').map(s => s.trim()) : 
          [this.inferPaperSizeFromCategory(category)]
      },
      
      // Volume handling - inferred from category since not in current CSV
      minVolume: product.volume_min_monthly ? parseInt(product.volume_min_monthly) : this.inferMinVolumeFromCategory(category),
      maxVolume: product.volume_max_monthly ? parseInt(product.volume_max_monthly) : this.inferMaxVolumeFromCategory(category),
      
      costs: {
        machineCost: product.machine_cost ? parseFloat(product.machine_cost) : this.inferMachineCostFromMargin(parseFloat(product.profit_margin)),
        installation: product.installation_cost ? parseFloat(product.installation_cost) : (category.includes('Printer') ? 100 : 250),
        profitMargin: parseFloat(product.profit_margin) || 0,
        totalMachineCost: 0, // Will be calculated in validation
        cpcRates: {
          A4Mono: parseFloat(product.cpc_mono_pence) || 0,
          A4Colour: parseFloat(product.cpc_colour_pence) || 0,
          A3Mono: parseFloat(product.cpc_a3_mono_pence) || parseFloat(product.cpc_mono_pence) || 0,
          A3Colour: parseFloat(product.cpc_a3_colour_pence) || parseFloat(product.cpc_colour_pence) || 0
        }
      },
      
      features: product.features ? 
        product.features.split(',').map(s => s.trim()) : 
        this.inferFeaturesFromCategory(category),
      
      leaseTermsAndMargins: this.parseLeaseTerms(product.lease_terms),
      
      auxiliaries: this.parseAuxiliaries(product.auxiliaries),
      
      service: {
        level: product.service_level || 'Standard',
        responseTime: product.response_time || 'Next day',
        quarterlyService: product.quarterly_service ? parseFloat(product.quarterly_service) : 150
      },
      
      stockStatus: product.stock_status || 'In Stock',
      modelYear: product.model_year ? parseInt(product.model_year) : new Date().getFullYear(),
      complianceTags: product.compliance_tags ? 
        product.compliance_tags.split(',').map(s => s.trim()) : [],
      regionsCovered: product.regions_covered ? 
        product.regions_covered.split(',').map(s => s.trim()) : ['UK'],
      industries: product.industries ? 
        product.industries.split(',').map(s => s.trim()) : [],
      
      availability: {
        inStock: product.in_stock ? product.in_stock.toLowerCase() === 'true' : true,
        leadTime: product.lead_time ? parseInt(product.lead_time) : 14,
        installationWindow: product.installation_window ? parseInt(product.installation_window) : 7
      }
    };
  }

  static normalizeCategory(category) {
    if (!category) return 'A4 MFP';
    
    const categoryMap = {
      'a4 printer': 'A4 Printers',
      'a4 printers': 'A4 Printers',
      'a4 mfp': 'A4 MFP',
      'a4 multifunction': 'A4 MFP',
      'a3 mfp': 'A3 MFP',
      'a3 multifunction': 'A3 MFP',
      'sra3 mfp': 'SRA3 MFP'
    };
    
    return categoryMap[category.toLowerCase()] || category;
  }

  static parseLeaseTerms(leaseString) {
    if (!leaseString) {
      // Default lease terms
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
        return {
          term: parseInt(term.trim()),
          margin: parseFloat(margin.trim())
        };
      }).filter(item => item.term && item.margin);
    } catch (error) {
      console.warn('Error parsing lease terms:', error);
      return [
        { term: 36, margin: 0.6 },
        { term: 48, margin: 0.55 },
        { term: 60, margin: 0.5 }
      ];
    }
  }

  static parseAuxiliaries(auxString) {
    if (!auxString) return [];
    
    try {
      if (auxString.startsWith('[')) {
        return JSON.parse(auxString);
      }
      
      return auxString.split(',').map(pair => {
        const [item, price] = pair.split(':');
        return {
          item: item?.trim(),
          price: parseFloat(price?.trim()) || 0
        };
      }).filter(aux => aux.item && aux.price > 0);
    } catch (error) {
      console.warn('Error parsing auxiliaries:', error);
      return [];
    }
  }

  /**
   * Validate a single product
   */
  static validateProduct(product, rowNumber) {
    const errors = [];
    const warnings = [];
    
    // Validate required fields
    const requiredFields = [
      'manufacturer', 'model', 'category',
      'costs.profitMargin', 'costs.cpcRates.A4Mono', 'costs.cpcRates.A4Colour'
    ];
    
    requiredFields.forEach(field => {
      const value = this.getNestedValue(product, field);
      if (!value && value !== 0) {
        errors.push(`Row ${rowNumber}: Missing required field '${field}'`);
      }
    });
    
    // Category validation
    const validCategories = ['A4 Printers', 'A4 MFP', 'A3 MFP', 'SRA3 MFP'];
    if (!validCategories.includes(product.category)) {
      warnings.push(`Row ${rowNumber}: Category '${product.category}' will be normalized`);
      product.category = this.normalizeCategory(product.category) || 'A4 MFP';
    }
    
    // Paper size validation
    const validPaperSizes = ['A4', 'A3', 'SRA3'];
    if (!validPaperSizes.includes(product.paperSizes?.primary)) {
      warnings.push(`Row ${rowNumber}: Paper size '${product.paperSizes?.primary}' will be set to 'A4'`);
      product.paperSizes.primary = 'A4';
    }
    
    // Volume and speed alignment validation
    if (product.minVolume && product.maxVolume && product.speed) {
      const alignmentIssues = this.validateVolumeSpeedAlignment(
        product.minVolume, 
        product.maxVolume, 
        product.speed
      );
      alignmentIssues.forEach(issue => warnings.push(`Row ${rowNumber}: ${issue}`));
    }
    
    // CPC rate validation
    if (product.costs?.cpcRates?.A4Mono !== undefined && product.costs?.cpcRates?.A4Colour !== undefined) {
      const cpcIssues = this.validateCPCRates(
        product.costs.cpcRates.A4Mono,
        product.costs.cpcRates.A4Colour
      );
      cpcIssues.forEach(issue => warnings.push(`Row ${rowNumber}: ${issue}`));
    }
    
    // Calculate total machine cost
    if (product.costs) {
      product.costs.totalMachineCost = 
        (product.costs.machineCost || 0) + 
        (product.costs.installation || 0) + 
        (product.costs.profitMargin || 0);
    }
    
    // Set volume range
    if (product.maxVolume) {
      if (product.maxVolume <= 6000) product.volumeRange = '0-6k';
      else if (product.maxVolume <= 13000) product.volumeRange = '6k-13k';
      else if (product.maxVolume <= 20000) product.volumeRange = '13k-20k';
      else if (product.maxVolume <= 30000) product.volumeRange = '20k-30k';
      else if (product.maxVolume <= 40000) product.volumeRange = '30k-40k';
      else if (product.maxVolume <= 50000) product.volumeRange = '40k-50k';
      else product.volumeRange = '50k+';
    } else {
      product.volumeRange = '0-6k';
    }
    
    // Set legacy fields for compatibility
    product.salePrice = product.costs?.totalMachineCost;
    product.A4MonoCPC = product.costs?.cpcRates?.A4Mono;
    product.A4ColourCPC = product.costs?.cpcRates?.A4Colour;
    product.A3MonoCPC = product.costs?.cpcRates?.A3Mono;
    product.A3ColourCPC = product.costs?.cpcRates?.A3Colour;
    
    return {
      isValid: errors.length === 0,
      product: errors.length === 0 ? product : null,
      errors,
      warnings
    };
  }

  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Validate entire upload
   */
  static validateUpload(csvData, headers) {
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
    const missingHeaders = this.requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      validation.errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
      validation.success = false;
      return validation;
    }
    
    // Validate each row
    csvData.forEach((row, index) => {
      const rowNumber = index + 2; // Account for header row
      const product = this.parseRow(row, headers);
      const result = this.validateProduct(product, rowNumber);
      
      if (result.errors.length > 0) {
        validation.errors.push(...result.errors);
        validation.stats.invalid++;
      } else {
        validation.validProducts.push(result.product);
        validation.stats.valid++;
      }
      
      if (result.warnings.length > 0) {
        validation.warnings.push(...result.warnings);
      }
    });
    
    validation.success = validation.errors.length === 0;
    return validation;
  }
}

/**
 * Enhanced import function with validation
 */
export async function importVendorProducts(filePath, vendorId) {
  try {
    console.log('📊 Starting import process for:', filePath);
    
    // Read file
    let rows = [];
    const ext = filePath.split('.').pop().toLowerCase();
    
    if (ext === 'xlsx' || ext === 'xls') {
      rows = readExcelFile(filePath);
    } else if (ext === 'csv') {
      rows = await readCSVFile(filePath);
    } else {
      throw new Error('Unsupported file format. Please upload CSV or Excel file.');
    }
    
    console.log(`📋 File parsed: ${rows.length} total rows`);
    
    if (!rows || rows.length < 2) {
      throw new Error('File must contain at least a header row and one data row');
    }
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    console.log('📄 Headers found:', headers);
    console.log('📊 Data rows:', dataRows.length);
    
    // Validate upload
    const validation = VendorUploadValidator.validateUpload(dataRows, headers);
    
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
        const product = new VendorProduct(productData);
        await product.save();
        savedProducts.push(product);
        console.log(`✅ Saved product: ${productData.manufacturer} ${productData.model}`);
      } catch (saveError) {
        console.error(`❌ Error saving ${productData.manufacturer} ${productData.model}:`, saveError);
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
    console.error('❌ Import error:', error);
    return {
      success: false,
      errors: [error.message],
      warnings: [],
      stats: { total: 0, valid: 0, invalid: 0, saved: 0 }
    };
  }
}

// Export both as named exports
export { VendorUploadValidator };
export default VendorUploadValidator;
