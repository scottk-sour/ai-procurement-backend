import mongoose from 'mongoose';
import dotenv from 'dotenv';
import VendorProduct from '../models/VendorProduct.js';
import Vendor from '../models/Vendor.js';

dotenv.config();

const DEMO_VENDOR_ID = '697e212e7df418c53adbfafc';

const demoProducts = [
  // =====================================================
  // TELECOMS (2 products)
  // =====================================================
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: '3CX',
    model: 'Cloud VoIP Business',
    description: 'Cloud-hosted VoIP phone system ideal for SMEs. Includes auto-attendant, call recording, and mobile app.',
    category: 'Cloud VoIP',
    serviceCategory: 'Telecoms',
    status: 'active',
    telecomsPricing: {
      systemType: 'Cloud VoIP',
      perUserMonthly: 12.50,
      minUsers: 5,
      maxUsers: 50,
      handsetCost: 85,
      handsetModel: 'Yealink T46U',
      callPackage: {
        packageType: 'Unlimited UK',
        includedMinutes: 0,
        perMinuteRate: 0,
      },
      broadbandIncluded: false,
      broadbandSpeed: '80Mbps FTTC',
      broadbandMonthlyCost: 35,
      setupFee: 150,
      contractTermMonths: 36,
      features: [
        'Auto attendant/IVR',
        'Call recording',
        'Mobile app',
        'Voicemail to email',
        'Call queuing',
        'Hot desking',
        'CRM integration',
        'Video conferencing',
      ],
      numberPortingFee: 0,
    },
  },
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: 'Gamma',
    model: 'Horizon Teams Integration',
    description: 'Enterprise-grade Microsoft Teams direct routing with Gamma Horizon. Full PSTN calling through Teams.',
    category: 'Microsoft Teams',
    serviceCategory: 'Telecoms',
    status: 'active',
    telecomsPricing: {
      systemType: 'Microsoft Teams',
      perUserMonthly: 8.95,
      minUsers: 10,
      maxUsers: 200,
      handsetCost: 0,
      handsetModel: 'Softphone (Teams app)',
      callPackage: {
        packageType: 'Unlimited UK + Mobiles',
        includedMinutes: 0,
        perMinuteRate: 0,
      },
      broadbandIncluded: false,
      broadbandSpeed: '100Mbps FTTP',
      broadbandMonthlyCost: 45,
      setupFee: 250,
      contractTermMonths: 24,
      features: [
        'Microsoft Teams integration',
        'Call recording',
        'Auto attendant/IVR',
        'Call queuing',
        'Voicemail to email',
        'Mobile app',
        'Reporting & analytics',
        'Number porting',
      ],
      numberPortingFee: 0,
    },
  },

  // =====================================================
  // CCTV (2 products)
  // =====================================================
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: 'Hikvision',
    model: 'IP 4K Pro System',
    description: 'Professional 4K IP camera system with NVR. Ideal for commercial premises requiring high-resolution monitoring.',
    category: 'IP Camera System',
    serviceCategory: 'CCTV',
    status: 'active',
    cctvPricing: {
      systemType: 'IP Camera System',
      perCameraCost: 285,
      cameraModel: 'Hikvision DS-2CD2T86G2-ISU/SL',
      resolution: '4K 2160p',
      indoor: true,
      outdoor: true,
      nightVision: true,
      nvrCost: 450,
      nvrChannels: 16,
      installationPerCamera: 120,
      installationFlat: 0,
      monthlyMonitoring: 0,
      cloudStorageMonthly: 0,
      cloudStoragePerCamera: 0,
      maintenanceAnnual: 180,
      contractTermMonths: 36,
      features: [
        'Night vision (30m)',
        'Motion detection',
        'Remote mobile viewing',
        'Number plate recognition (ANPR)',
        'Two-way audio',
        'IP67 weatherproof',
        'H.265+ compression',
        'Smart event detection',
      ],
      minCameras: 4,
      maxCameras: 32,
    },
  },
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: 'Dahua',
    model: 'Cloud CCTV Starter',
    description: 'Cloud-based CCTV solution with remote monitoring. Perfect for small businesses and retail.',
    category: 'Cloud-Based CCTV',
    serviceCategory: 'CCTV',
    status: 'active',
    cctvPricing: {
      systemType: 'Cloud-Based',
      perCameraCost: 195,
      cameraModel: 'Dahua IPC-HDBW3441E-AS',
      resolution: '2K 1440p',
      indoor: true,
      outdoor: true,
      nightVision: true,
      nvrCost: 0,
      nvrChannels: 0,
      installationPerCamera: 95,
      installationFlat: 0,
      monthlyMonitoring: 24.99,
      cloudStorageMonthly: 0,
      cloudStoragePerCamera: 4.99,
      maintenanceAnnual: 0,
      contractTermMonths: 24,
      features: [
        'Night vision (30m)',
        'Motion detection',
        'Remote mobile viewing',
        'Cloud recording',
        'Two-way audio',
        'Push notifications',
        'IP67 weatherproof',
        'AI person detection',
      ],
      minCameras: 1,
      maxCameras: 16,
    },
  },

  // =====================================================
  // IT (2 products)
  // =====================================================
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: 'Dell',
    model: 'Fully Managed IT Support',
    description: 'Comprehensive fully managed IT support including helpdesk, M365 management, cybersecurity, and backup.',
    category: 'Fully Managed IT',
    serviceCategory: 'IT',
    status: 'active',
    itPricing: {
      serviceType: 'Fully Managed',
      perUserMonthly: 45,
      perDeviceMonthly: 0,
      minUsers: 5,
      maxUsers: 100,
      serverManagementMonthly: 75,
      includes: [
        'Help desk support',
        'Microsoft 365 management',
        'Cybersecurity (Endpoint Protection)',
        'Backup & disaster recovery',
        'Network monitoring',
        'Patch management',
        'Hardware procurement',
        'Quarterly business reviews',
      ],
      m365LicenceIncluded: true,
      m365CostPerUser: 0,
      cybersecurityAddon: 0,
      backupPerGb: 0.10,
      setupFee: 500,
      projectDayRate: 650,
      contractTermMonths: 12,
      responseTimeSLA: '4 hours',
      supportHours: 'Business hours (8-6)',
      accreditations: ['Cyber Essentials Plus', 'ISO 27001', 'Microsoft Gold Partner'],
    },
  },
  {
    vendorId: DEMO_VENDOR_ID,
    manufacturer: 'Sophos',
    model: 'Co-Managed IT & Security',
    description: 'Co-managed IT solution supplementing your in-house team. Focus on cybersecurity, cloud, and infrastructure.',
    category: 'Co-Managed IT',
    serviceCategory: 'IT',
    status: 'active',
    itPricing: {
      serviceType: 'Co-Managed',
      perUserMonthly: 28,
      perDeviceMonthly: 0,
      minUsers: 20,
      maxUsers: 500,
      serverManagementMonthly: 120,
      includes: [
        'Help desk support (escalation)',
        'Cybersecurity management',
        'Cloud migration support',
        'Backup & disaster recovery',
        'Network infrastructure',
        'Security awareness training',
        'Vulnerability scanning',
        'Incident response',
      ],
      m365LicenceIncluded: false,
      m365CostPerUser: 10.50,
      cybersecurityAddon: 5,
      backupPerGb: 0.08,
      setupFee: 1000,
      projectDayRate: 750,
      contractTermMonths: 12,
      responseTimeSLA: '2 hours',
      supportHours: 'Extended (7-10)',
      accreditations: ['Cyber Essentials Plus', 'Sophos Gold Partner', 'IASME Governance'],
    },
  },
];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check for existing non-Photocopier products
    const existingProducts = await VendorProduct.find({
      vendorId: DEMO_VENDOR_ID,
      serviceCategory: { $in: ['Telecoms', 'CCTV', 'IT'] },
    });
    console.log(`\nFound ${existingProducts.length} existing Telecoms/CCTV/IT products for Demo vendor`);

    if (existingProducts.length > 0) {
      console.log('\nExisting products:');
      existingProducts.forEach(p => {
        console.log(`  - [${p.serviceCategory}] ${p.manufacturer} ${p.model}`);
      });
      console.log('\nNo new products added — products already exist.');
    } else {
      console.log('\nCreating 6 demo products (2 Telecoms, 2 CCTV, 2 IT)...\n');

      for (const product of demoProducts) {
        const newProduct = new VendorProduct(product);
        await newProduct.save();
        console.log(`Created: [${product.serviceCategory}] ${product.manufacturer} ${product.model}`);
      }

      console.log('\nSuccessfully created 6 demo products!');
    }

    // Update demo vendor's services to include all categories
    const result = await Vendor.updateOne(
      { _id: DEMO_VENDOR_ID },
      { $addToSet: { services: { $each: ['Telecoms', 'CCTV', 'IT'] } } }
    );
    if (result.modifiedCount > 0) {
      console.log('\nUpdated demo vendor services to include Telecoms, CCTV, IT');
    } else {
      console.log('\nDemo vendor already has all service categories');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main();
