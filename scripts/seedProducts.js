/**
 * TendorAI Product Seeding Script
 * Seeds realistic copier/MFP product data for vendors
 *
 * Usage: node scripts/seedProducts.js
 * Requires: MONGODB_URI environment variable
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Product templates based on real machine specs
const PRODUCT_TEMPLATES = {
  // Canon imageRUNNER ADVANCE range
  'Canon iR-ADV C3530i III': {
    manufacturer: 'Canon',
    model: 'imageRUNNER ADVANCE C3530i III',
    description: 'A3 colour multifunction device ideal for small to medium workgroups. Excellent colour output with print, copy, scan and optional fax.',
    category: 'A3 MFP',
    speed: 30,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'WiFi', 'Cloud Print', 'Mobile Print'],
    minVolume: 1000,
    maxVolume: 8000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 3200,
      installation: 250,
      profitMargin: 450,
      cpcRates: { A4Mono: 0.4, A4Colour: 3.5, A3Mono: 0.8, A3Colour: 7.0 }
    },
    leaseRates: { term36: 330, term48: 270, term60: 234 },
    service: { level: 'Standard', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Canon iR-ADV C5540i III': {
    manufacturer: 'Canon',
    model: 'imageRUNNER ADVANCE C5540i III',
    description: 'High-performance A3 colour MFP for busy workgroups. Fast 40ppm output with advanced finishing options including stapling.',
    category: 'A3 MFP',
    speed: 40,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'Stapling', 'WiFi', 'Cloud Print', 'Secure Print'],
    minVolume: 3000,
    maxVolume: 15000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 5500,
      installation: 350,
      profitMargin: 650,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.8, A3Mono: 0.6, A3Colour: 5.6 }
    },
    leaseRates: { term36: 525, term48: 420, term60: 360 },
    service: { level: 'Standard', responseTime: '8hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Canon iR-ADV C5560i III': {
    manufacturer: 'Canon',
    model: 'imageRUNNER ADVANCE C5560i III',
    description: 'Enterprise-class A3 colour production MFP. 60ppm with booklet making, hole punch and advanced workflow integration.',
    category: 'A3 MFP',
    speed: 60,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'Stapling', 'Booklet', 'Hole Punch', 'WiFi', 'Secure Print'],
    minVolume: 5000,
    maxVolume: 30000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 8200,
      installation: 450,
      profitMargin: 850,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.5, A3Mono: 0.6, A3Colour: 5.0 }
    },
    leaseRates: { term36: 780, term48: 630, term60: 540 },
    service: { level: 'Premium', responseTime: '4hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Canon iR-ADV DX 4745i': {
    manufacturer: 'Canon',
    model: 'imageRUNNER ADVANCE DX 4745i',
    description: 'High-volume A3 mono MFP built for demanding environments. Fast 45ppm with excellent paper handling.',
    category: 'A3 MFP',
    speed: 45,
    isA3: true,
    isColour: false,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'Stapling', 'Large Capacity'],
    minVolume: 2000,
    maxVolume: 15000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 2800,
      installation: 250,
      profitMargin: 350,
      cpcRates: { A4Mono: 0.3, A4Colour: 0, A3Mono: 0.6, A3Colour: 0 }
    },
    leaseRates: { term36: 285, term48: 234, term60: 195 },
    service: { level: 'Standard', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Konica Minolta bizhub range
  'Konica Minolta bizhub C250i': {
    manufacturer: 'Konica Minolta',
    model: 'bizhub C250i',
    description: 'Compact A3 colour MFP perfect for small offices. 25ppm with intuitive touchscreen and mobile connectivity.',
    category: 'A3 MFP',
    speed: 25,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'WiFi', 'Mobile Print', 'Cloud Connect'],
    minVolume: 500,
    maxVolume: 5000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
    costs: {
      machineCost: 2600,
      installation: 250,
      profitMargin: 350,
      cpcRates: { A4Mono: 0.4, A4Colour: 3.8, A3Mono: 0.8, A3Colour: 7.6 }
    },
    leaseRates: { term36: 270, term48: 216, term60: 186 },
    service: { level: 'Standard', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Konica Minolta bizhub C360i': {
    manufacturer: 'Konica Minolta',
    model: 'bizhub C360i',
    description: 'Versatile A3 colour MFP for medium workgroups. 36ppm with optional finishing and excellent scan capabilities.',
    category: 'A3 MFP',
    speed: 36,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Fax', 'Duplex', 'Stapling', 'WiFi', 'Secure Print'],
    minVolume: 2000,
    maxVolume: 12000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 4800,
      installation: 300,
      profitMargin: 550,
      cpcRates: { A4Mono: 0.3, A4Colour: 3.0, A3Mono: 0.6, A3Colour: 6.0 }
    },
    leaseRates: { term36: 465, term48: 375, term60: 315 },
    service: { level: 'Standard', responseTime: '8hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Konica Minolta bizhub C650i': {
    manufacturer: 'Konica Minolta',
    model: 'bizhub C650i',
    description: 'Production-class A3 colour MFP. 65ppm with professional finishing including booklet and hole punch.',
    category: 'A3 MFP',
    speed: 65,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'Stapling', 'Booklet', 'Hole Punch', 'Large Capacity'],
    minVolume: 10000,
    maxVolume: 50000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 12000,
      installation: 500,
      profitMargin: 1200,
      cpcRates: { A4Mono: 0.2, A4Colour: 2.0, A3Mono: 0.4, A3Colour: 4.0 }
    },
    leaseRates: { term36: 1140, term48: 900, term60: 765 },
    service: { level: 'Premium', responseTime: '4hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Xerox range
  'Xerox VersaLink C400': {
    manufacturer: 'Xerox',
    model: 'VersaLink C400',
    description: 'Compact A4 colour printer ideal for small offices. Fast 36ppm with excellent connectivity options.',
    category: 'A4 Printers',
    speed: 36,
    isA3: false,
    isColour: true,
    features: ['Print', 'Duplex', 'WiFi', 'Mobile Print', 'Cloud Print'],
    minVolume: 500,
    maxVolume: 4000,
    paperSizes: { primary: 'A4', supported: ['A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 1200,
      installation: 150,
      profitMargin: 200,
      cpcRates: { A4Mono: 0.5, A4Colour: 4.0, A3Mono: 0, A3Colour: 0 }
    },
    leaseRates: { term36: 135, term48: 114, term60: 96 },
    service: { level: 'Basic', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Xerox AltaLink C8155': {
    manufacturer: 'Xerox',
    model: 'AltaLink C8155',
    description: 'Enterprise A3 colour MFP with advanced security and workflow automation. 55ppm with comprehensive finishing.',
    category: 'A3 MFP',
    speed: 55,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Fax', 'Duplex', 'Stapling', 'Booklet', 'Secure Print', 'Workflow'],
    minVolume: 5000,
    maxVolume: 30000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 9500,
      installation: 450,
      profitMargin: 950,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.2, A3Mono: 0.6, A3Colour: 4.4 }
    },
    leaseRates: { term36: 900, term48: 720, term60: 615 },
    service: { level: 'Premium', responseTime: '4hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Sharp range
  'Sharp BP-70C31': {
    manufacturer: 'Sharp',
    model: 'BP-70C31',
    description: 'Reliable A3 colour MFP for general office use. 31ppm with intuitive operation and strong security.',
    category: 'A3 MFP',
    speed: 31,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'WiFi', 'Mobile Print'],
    minVolume: 1000,
    maxVolume: 8000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
    costs: {
      machineCost: 3000,
      installation: 250,
      profitMargin: 400,
      cpcRates: { A4Mono: 0.4, A4Colour: 3.2, A3Mono: 0.8, A3Colour: 6.4 }
    },
    leaseRates: { term36: 300, term48: 246, term60: 210 },
    service: { level: 'Standard', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Sharp BP-70C45': {
    manufacturer: 'Sharp',
    model: 'BP-70C45',
    description: 'High-performance A3 colour MFP built for busy offices. 45ppm with optional finishing and large paper capacity.',
    category: 'A3 MFP',
    speed: 45,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'Stapling', 'Large Capacity', 'Secure Print'],
    minVolume: 3000,
    maxVolume: 15000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 5800,
      installation: 350,
      profitMargin: 650,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.7, A3Mono: 0.6, A3Colour: 5.4 }
    },
    leaseRates: { term36: 555, term48: 450, term60: 384 },
    service: { level: 'Standard', responseTime: '8hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Ricoh range
  'Ricoh IM C3000': {
    manufacturer: 'Ricoh',
    model: 'IM C3000',
    description: 'Smart A3 colour MFP with Always Current Technology. 30ppm with excellent energy efficiency.',
    category: 'A3 MFP',
    speed: 30,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Duplex', 'WiFi', 'Cloud Connect', 'Voice Control'],
    minVolume: 1000,
    maxVolume: 8000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
    costs: {
      machineCost: 3400,
      installation: 250,
      profitMargin: 450,
      cpcRates: { A4Mono: 0.4, A4Colour: 3.4, A3Mono: 0.8, A3Colour: 6.8 }
    },
    leaseRates: { term36: 345, term48: 276, term60: 237 },
    service: { level: 'Standard', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },
  'Ricoh IM C4500': {
    manufacturer: 'Ricoh',
    model: 'IM C4500',
    description: 'Versatile A3 colour MFP for demanding workgroups. 45ppm with comprehensive finishing options.',
    category: 'A3 MFP',
    speed: 45,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Fax', 'Duplex', 'Stapling', 'Secure Print', 'Workflow'],
    minVolume: 3000,
    maxVolume: 18000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 6200,
      installation: 350,
      profitMargin: 700,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.6, A3Mono: 0.6, A3Colour: 5.2 }
    },
    leaseRates: { term36: 600, term48: 480, term60: 411 },
    service: { level: 'Standard', responseTime: '8hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Brother range (A4 mono for small offices)
  'Brother MFC-L6900DW': {
    manufacturer: 'Brother',
    model: 'MFC-L6900DW',
    description: 'High-speed A4 mono MFP perfect for small businesses. 50ppm with low running costs and wireless connectivity.',
    category: 'A4 MFP',
    speed: 50,
    isA3: false,
    isColour: false,
    features: ['Print', 'Copy', 'Scan', 'Fax', 'Duplex', 'WiFi', 'NFC'],
    minVolume: 500,
    maxVolume: 5000,
    paperSizes: { primary: 'A4', supported: ['A4', 'A5', 'Letter'] },
    costs: {
      machineCost: 800,
      installation: 100,
      profitMargin: 150,
      cpcRates: { A4Mono: 0.6, A4Colour: 0, A3Mono: 0, A3Colour: 0 }
    },
    leaseRates: { term36: 90, term48: 75, term60: 66 },
    service: { level: 'Basic', responseTime: 'Next day', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  },

  // Lexmark range
  'Lexmark CX944adxse': {
    manufacturer: 'Lexmark',
    model: 'CX944adxse',
    description: 'Enterprise A3 colour MFP with exceptional reliability. 65ppm with advanced security and finishing.',
    category: 'A3 MFP',
    speed: 65,
    isA3: true,
    isColour: true,
    features: ['Print', 'Copy', 'Scan', 'Fax', 'Duplex', 'Stapling', 'Secure Print', 'Cloud'],
    minVolume: 5000,
    maxVolume: 25000,
    paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
    costs: {
      machineCost: 6500,
      installation: 350,
      profitMargin: 700,
      cpcRates: { A4Mono: 0.3, A4Colour: 2.5, A3Mono: 0.6, A3Colour: 5.0 }
    },
    leaseRates: { term36: 630, term48: 504, term60: 435 },
    service: { level: 'Standard', responseTime: '8hr', quarterlyService: 0, includesToner: true, includesPartsLabour: true, includesDrums: true }
  }
};

// Vendor assignments - which products each vendor sells
const VENDOR_PRODUCTS = {
  // Southwest Digital Systems - Canon/Konica dealer
  '697fcdae7bb59d4fbe9db411': ['Canon iR-ADV C3530i III', 'Canon iR-ADV C5540i III', 'Konica Minolta bizhub C250i', 'Konica Minolta bizhub C360i'],

  // Lanier South West - Ricoh dealer (Lanier is Ricoh brand)
  '697d23a2faf4d0d38ce2d564': ['Ricoh IM C3000', 'Ricoh IM C4500', 'Brother MFC-L6900DW'],

  // Clarity Solutions - Multi-brand
  '697d23a6faf4d0d38ce2d57c': ['Konica Minolta bizhub C250i', 'Konica Minolta bizhub C360i', 'Sharp BP-70C31', 'Sharp BP-70C45'],

  // Camelott Digital - Canon specialist
  '697d23a6faf4d0d38ce2d57f': ['Canon iR-ADV C3530i III', 'Canon iR-ADV C5540i III', 'Canon iR-ADV C5560i III', 'Canon iR-ADV DX 4745i'],

  // Clarity Copiers Bristol - Konica/Sharp
  '697d2455dfa2a1cabf117145': ['Konica Minolta bizhub C250i', 'Konica Minolta bizhub C360i', 'Konica Minolta bizhub C650i', 'Sharp BP-70C31'],

  // Print Logic Reprographics - Multi-brand enterprise
  '697d2456dfa2a1cabf11714b': ['Canon iR-ADV C5560i III', 'Xerox AltaLink C8155', 'Konica Minolta bizhub C650i', 'Lexmark CX944adxse', 'Sharp BP-70C45'],

  // Elmrep Office Solutions - Canon/Xerox
  '697d2458dfa2a1cabf11715f': ['Canon iR-ADV C3530i III', 'Canon iR-ADV C5540i III', 'Xerox VersaLink C400', 'Xerox AltaLink C8155'],

  // Magenta Technology - Konica specialist
  '697d245adfa2a1cabf11716b': ['Konica Minolta bizhub C250i', 'Konica Minolta bizhub C360i', 'Konica Minolta bizhub C650i'],

  // RED Business Machines - Sharp/Ricoh
  '697d245ddfa2a1cabf11717d': ['Sharp BP-70C31', 'Sharp BP-70C45', 'Ricoh IM C3000', 'Ricoh IM C4500'],

  // Print Logic Midlands - Enterprise focus
  '697fcd5f7bb59d4fbe9db3e0': ['Canon iR-ADV C5560i III', 'Konica Minolta bizhub C650i', 'Xerox AltaLink C8155', 'Lexmark CX944adxse']
};

// VendorProduct Schema (simplified for direct insert)
const vendorProductSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  description: String,
  category: { type: String, enum: ['A4 Printers', 'A4 MFP', 'A3 MFP', 'SRA3 MFP'], required: true },
  speed: { type: Number, required: true },
  isA3: { type: Boolean, default: false },
  isColour: { type: Boolean, default: true },
  features: [String],
  minVolume: { type: Number, required: true },
  maxVolume: { type: Number, required: true },
  volumeRange: { type: String, enum: ['0-6k', '6k-13k', '13k-20k', '20k-30k', '30k-40k', '40k-50k', '50k+'] },
  paperSizes: {
    primary: { type: String, enum: ['A4', 'A3', 'SRA3'], required: true },
    supported: [{ type: String, enum: ['A4', 'A3', 'SRA3', 'A5', 'Letter', 'Legal'] }]
  },
  costs: {
    machineCost: { type: Number, required: true },
    installation: { type: Number, default: 250 },
    profitMargin: { type: Number, required: true },
    totalMachineCost: { type: Number, required: true },
    cpcRates: {
      A4Mono: { type: Number, required: true },
      A4Colour: { type: Number, required: true },
      A3Mono: Number,
      A3Colour: Number
    }
  },
  service: {
    level: { type: String, enum: ['Basic', 'Standard', 'Premium'] },
    responseTime: { type: String, enum: ['4hr', '8hr', 'Next day'] },
    quarterlyService: Number,
    includesToner: { type: Boolean, default: true },
    includesPartsLabour: { type: Boolean, default: true },
    includesDrums: { type: Boolean, default: true },
    includesStaples: { type: Boolean, default: false }
  },
  availability: {
    inStock: { type: Boolean, default: true },
    leadTime: { type: Number, default: 14 }
  },
  leaseRates: {
    term36: Number,
    term48: Number,
    term60: Number
  },
  minimumQuarterlyCharge: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'active' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);

// Calculate volumeRange from maxVolume
function getVolumeRange(maxVolume) {
  if (maxVolume <= 6000) return '0-6k';
  if (maxVolume <= 13000) return '6k-13k';
  if (maxVolume <= 20000) return '13k-20k';
  if (maxVolume <= 30000) return '20k-30k';
  if (maxVolume <= 40000) return '30k-40k';
  if (maxVolume <= 50000) return '40k-50k';
  return '50k+';
}

async function seedProducts() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully.\n');

    // Check existing products
    const existingCount = await VendorProduct.countDocuments();
    console.log(`Existing products in database: ${existingCount}`);

    // Build products to insert
    const productsToInsert = [];

    for (const [vendorId, productNames] of Object.entries(VENDOR_PRODUCTS)) {
      console.log(`\nPreparing products for vendor: ${vendorId}`);

      for (const productName of productNames) {
        const template = PRODUCT_TEMPLATES[productName];
        if (!template) {
          console.log(`  ⚠️  Template not found: ${productName}`);
          continue;
        }

        // Check if product already exists for this vendor
        const exists = await VendorProduct.findOne({
          vendorId: new mongoose.Types.ObjectId(vendorId),
          manufacturer: template.manufacturer,
          model: template.model
        });

        if (exists) {
          console.log(`  ⏭️  Already exists: ${template.manufacturer} ${template.model}`);
          continue;
        }

        // Calculate totalMachineCost
        const totalMachineCost = template.costs.machineCost + template.costs.installation + template.costs.profitMargin;

        const product = {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          manufacturer: template.manufacturer,
          model: template.model,
          description: template.description,
          category: template.category,
          speed: template.speed,
          isA3: template.isA3,
          isColour: template.isColour,
          features: template.features,
          minVolume: template.minVolume,
          maxVolume: template.maxVolume,
          volumeRange: getVolumeRange(template.maxVolume),
          paperSizes: template.paperSizes,
          costs: {
            ...template.costs,
            totalMachineCost
          },
          service: template.service,
          availability: { inStock: true, leadTime: 14 },
          leaseRates: template.leaseRates,
          minimumQuarterlyCharge: 0,
          status: 'active',
          isActive: true
        };

        productsToInsert.push(product);
        console.log(`  ✅ Prepared: ${template.manufacturer} ${template.model}`);
      }
    }

    if (productsToInsert.length === 0) {
      console.log('\n⚠️  No new products to insert. All products already exist.');
    } else {
      console.log(`\n📦 Inserting ${productsToInsert.length} products...`);
      const result = await VendorProduct.insertMany(productsToInsert);
      console.log(`✅ Successfully inserted ${result.length} products!`);
    }

    // Final count
    const finalCount = await VendorProduct.countDocuments();
    console.log(`\n📊 Total products in database: ${finalCount}`);

    // Show breakdown by vendor
    const breakdown = await VendorProduct.aggregate([
      { $group: { _id: '$vendorId', count: { $sum: 1 } } }
    ]);
    console.log('\nProducts by vendor:');
    for (const item of breakdown) {
      console.log(`  ${item._id}: ${item.count} products`);
    }

  } catch (error) {
    console.error('Error seeding products:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

// Run the script
seedProducts();
