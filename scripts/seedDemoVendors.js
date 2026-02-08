// scripts/seedDemoVendors.js
// Creates 5 fictional demo vendor profiles with products to show what a complete profile looks like.
// Usage: node scripts/seedDemoVendors.js

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';

dotenv.config();

const DEMO_PASSWORD = await bcrypt.hash('DemoVendor2026!', 12);

const demoVendors = [
  // ═══════════════════════════════════════════════════════════
  // 1. CopyTech Wales — Photocopiers, Cardiff, CF10
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'Gareth Evans',
      company: 'CopyTech Wales',
      email: 'demo-copytech@tendorai.com',
      password: DEMO_PASSWORD,
      services: ['Photocopiers'],
      location: {
        address: '14 Cathedral Road',
        city: 'Cardiff',
        postcode: 'CF11 9LJ',
        region: 'South Wales',
        coverage: ['Cardiff', 'Newport', 'Barry', 'Bridgend', 'Pontypridd', 'Caerphilly', 'Vale of Glamorgan'],
        coordinates: { latitude: 51.4816, longitude: -3.1791 },
      },
      contactInfo: {
        phone: '029 2034 5678',
        website: 'https://www.copytechwa.example.com',
      },
      businessProfile: {
        yearsInBusiness: 18,
        companySize: 'Small (1-50)',
        numEmployees: 22,
        specializations: ['Managed Print', 'Education Sector', 'Healthcare'],
        certifications: ['ISO 9001:2015'],
        accreditations: ['Canon Authorised Partner', 'Ricoh Silver Partner', 'Konica Minolta Pro Partner'],
        description: 'CopyTech Wales is Cardiff\'s leading independent photocopier and managed print specialist. Established in 2008, we supply, install and maintain multifunction printers for businesses across South Wales. Our expert team provides same-day support and transparent, all-inclusive service contracts with no hidden costs.',
      },
      brands: ['Canon', 'Ricoh', 'Konica Minolta'],
      postcodeAreas: ['CF', 'NP', 'SA'],
      performance: { rating: 4.7, reviewCount: 34, averageResponseTime: 4, completionRate: 97, customerSatisfaction: 95, onTimeDelivery: 98 },
      serviceCapabilities: { responseTime: '4hr', supportHours: '8-6', installationService: true, maintenanceService: true, trainingProvided: true, remoteSupport: true, emergencySupport: true },
      commercial: { creditRating: 'Excellent', paymentTerms: 'Net 30', preferredLeasePartners: ['Grenke', 'BNP Paribas'] },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 48 },
      tier: 'verified',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        manufacturer: 'Canon', model: 'imageRUNNER ADVANCE DX C5860i',
        description: 'High-performance A3 colour MFP with 60ppm output. Ideal for busy offices needing fast, reliable colour printing with advanced security features.',
        category: 'A3 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 60, isA3: true, isColour: true, minVolume: 8000, maxVolume: 30000,
        features: ['Duplex', 'Scanning', 'Stapling', 'Booklet Finishing', 'WiFi', 'Cloud Connect', 'Secure Print'],
        paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
        costs: { machineCost: 6800, installation: 250, profitMargin: 950, totalMachineCost: 8000, cpcRates: { A4Mono: 0.35, A4Colour: 3.5, A3Mono: 0.70, A3Colour: 7.0 } },
        service: { level: 'Premium', responseTime: '4hr', quarterlyService: 85, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: true },
        leaseRates: { term36: 285, term48: 225, term60: 190 },
      },
      {
        manufacturer: 'Ricoh', model: 'IM C3000',
        description: 'Versatile A3 colour MFP producing 30ppm. Great all-rounder for small to medium offices needing reliable colour output.',
        category: 'A3 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 30, isA3: true, isColour: true, minVolume: 2000, maxVolume: 12000,
        features: ['Duplex', 'Scanning', 'WiFi', 'Cloud Connect', 'Secure Print', 'Mobile Print'],
        paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
        costs: { machineCost: 3200, installation: 250, profitMargin: 550, totalMachineCost: 4000, cpcRates: { A4Mono: 0.40, A4Colour: 4.0, A3Mono: 0.80, A3Colour: 8.0 } },
        service: { level: 'Standard', responseTime: '8hr', quarterlyService: 65, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: false },
        leaseRates: { term36: 145, term48: 115, term60: 98 },
      },
      {
        manufacturer: 'Konica Minolta', model: 'bizhub C250i',
        description: 'Compact A3 colour MFP with 25ppm speed. Perfect entry-level device for smaller teams needing colour A3 capability.',
        category: 'A3 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 25, isA3: true, isColour: true, minVolume: 1000, maxVolume: 8000,
        features: ['Duplex', 'Scanning', 'WiFi', 'Mobile Print', 'Secure Print'],
        paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
        costs: { machineCost: 2400, installation: 250, profitMargin: 400, totalMachineCost: 3050, cpcRates: { A4Mono: 0.45, A4Colour: 4.5, A3Mono: 0.90, A3Colour: 9.0 } },
        service: { level: 'Standard', responseTime: '8hr', quarterlyService: 55, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: false },
        leaseRates: { term36: 112, term48: 89, term60: 76 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 2. Dragon Office Solutions — Photocopiers + Telecoms, Newport, NP
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'Rhys Morgan',
      company: 'Dragon Office Solutions',
      email: 'demo-dragon@tendorai.com',
      password: DEMO_PASSWORD,
      services: ['Photocopiers', 'Telecoms'],
      location: {
        address: '7 Commercial Street',
        city: 'Newport',
        postcode: 'NP20 1PL',
        region: 'South Wales',
        coverage: ['Newport', 'Cardiff', 'Cwmbran', 'Pontypool', 'Abergavenny', 'Chepstow', 'Monmouth'],
        coordinates: { latitude: 51.5842, longitude: -2.9977 },
      },
      contactInfo: {
        phone: '01633 456 789',
        website: 'https://www.dragonoffice.example.com',
      },
      businessProfile: {
        yearsInBusiness: 9,
        companySize: 'Small (1-50)',
        numEmployees: 12,
        specializations: ['SME Office Equipment', 'VoIP Installation'],
        certifications: [],
        accreditations: ['Ricoh Authorised Dealer', 'Xerox Partner', '3CX Certified Partner'],
        description: 'Dragon Office Solutions provides photocopiers and business phone systems to SMEs across Gwent and South Wales. We pride ourselves on honest pricing and responsive local service. Whether you need a new copier or a modern VoIP phone system, we\'ll find the right solution for your budget.',
      },
      brands: ['Ricoh', 'Xerox', '3CX', 'Yealink'],
      postcodeAreas: ['NP', 'CF', 'HR'],
      performance: { rating: 4.2, reviewCount: 16, averageResponseTime: 6, completionRate: 92, customerSatisfaction: 90, onTimeDelivery: 94 },
      serviceCapabilities: { responseTime: '8hr', supportHours: '9-5', installationService: true, maintenanceService: true, trainingProvided: true, remoteSupport: true, emergencySupport: false },
      commercial: { creditRating: 'Good', paymentTerms: 'Net 30', preferredLeasePartners: ['Grenke'] },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 22 },
      tier: 'visible',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        manufacturer: 'Ricoh', model: 'IM C6000',
        description: 'High-volume A3 colour MFP at 60ppm. Built for demanding office environments with heavy print volumes.',
        category: 'A3 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 60, isA3: true, isColour: true, minVolume: 10000, maxVolume: 40000,
        features: ['Duplex', 'Scanning', 'Stapling', 'Booklet Finishing', 'WiFi', 'Secure Print'],
        paperSizes: { primary: 'A3', supported: ['A3', 'A4', 'A5'] },
        costs: { machineCost: 7500, installation: 250, profitMargin: 1050, totalMachineCost: 8800, cpcRates: { A4Mono: 0.30, A4Colour: 3.2, A3Mono: 0.60, A3Colour: 6.4 } },
        service: { level: 'Premium', responseTime: '4hr', quarterlyService: 95, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: true },
        leaseRates: { term36: 310, term48: 245, term60: 208 },
      },
      {
        manufacturer: 'Xerox', model: 'VersaLink C7030',
        description: 'Reliable A3 colour MFP with 30ppm speed. Excellent print quality with Xerox ConnectKey technology.',
        category: 'A3 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 30, isA3: true, isColour: true, minVolume: 3000, maxVolume: 15000,
        features: ['Duplex', 'Scanning', 'WiFi', 'Cloud Connect', 'Secure Print', 'Xerox ConnectKey'],
        paperSizes: { primary: 'A3', supported: ['A3', 'A4'] },
        costs: { machineCost: 3800, installation: 250, profitMargin: 600, totalMachineCost: 4650, cpcRates: { A4Mono: 0.38, A4Colour: 3.8, A3Mono: 0.76, A3Colour: 7.6 } },
        service: { level: 'Standard', responseTime: '8hr', quarterlyService: 70, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: false },
        leaseRates: { term36: 168, term48: 132, term60: 112 },
      },
      {
        manufacturer: '3CX', model: 'Cloud PBX Pro',
        description: 'Professional cloud-hosted phone system with 3CX. Easy management, mobile apps, and CRM integration.',
        category: 'Cloud VoIP', serviceCategory: 'Telecoms', status: 'active',
        telecomsPricing: {
          systemType: 'Cloud VoIP', perUserMonthly: 11.95, minUsers: 3, maxUsers: 40,
          handsetCost: 79, handsetModel: 'Yealink T43U',
          callPackage: { packageType: 'Unlimited UK', includedMinutes: 0, perMinuteRate: 0 },
          broadbandIncluded: false, broadbandSpeed: '80Mbps FTTC', broadbandMonthlyCost: 32,
          setupFee: 120, contractTermMonths: 24,
          features: ['Auto attendant/IVR', 'Call recording', 'Mobile app', 'Voicemail to email', 'CRM integration', 'Video conferencing'],
          numberPortingFee: 0,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 3. Severn Business Systems — Telecoms + IT, Bristol, BS
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'James Wilson',
      company: 'Severn Business Systems',
      email: 'demo-severn@tendorai.com',
      password: DEMO_PASSWORD,
      services: ['Telecoms', 'IT'],
      location: {
        address: '22 Baldwin Street',
        city: 'Bristol',
        postcode: 'BS1 1SE',
        region: 'South West England',
        coverage: ['Bristol', 'Bath', 'Weston-super-Mare', 'Gloucester', 'Cheltenham', 'Swindon', 'Chippenham'],
        coordinates: { latitude: 51.4545, longitude: -2.5879 },
      },
      contactInfo: {
        phone: '0117 456 7890',
        website: 'https://www.severnbusiness.example.com',
      },
      businessProfile: {
        yearsInBusiness: 14,
        companySize: 'Small (1-50)',
        numEmployees: 28,
        specializations: ['Unified Communications', 'Managed IT for SMEs', 'Cloud Migration'],
        certifications: ['ISO 27001:2022', 'Cyber Essentials Plus'],
        accreditations: ['3CX Titanium Partner', 'Gamma Channel Partner', 'Dell Technologies Partner', 'Microsoft Gold Partner'],
        description: 'Severn Business Systems delivers enterprise-grade telecoms and IT support to businesses across the South West. We specialise in unified communications — combining VoIP phone systems with Microsoft Teams integration — and provide comprehensive managed IT services. Our Bristol-based team offers rapid on-site support throughout the region.',
      },
      brands: ['3CX', 'Gamma', 'Dell', 'Microsoft', 'Sophos'],
      postcodeAreas: ['BS', 'BA', 'GL', 'SN'],
      performance: { rating: 4.5, reviewCount: 27, averageResponseTime: 3, completionRate: 96, customerSatisfaction: 94, onTimeDelivery: 97 },
      serviceCapabilities: { responseTime: '4hr', supportHours: '8-6', installationService: true, maintenanceService: true, trainingProvided: true, remoteSupport: true, emergencySupport: true },
      commercial: { creditRating: 'Excellent', paymentTerms: 'Net 30', preferredLeasePartners: ['BNP Paribas'] },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 55 },
      tier: 'verified',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        manufacturer: 'Gamma', model: 'Horizon Collaborate',
        description: 'All-in-one cloud phone system with Microsoft Teams direct routing, unlimited UK calling, and advanced analytics.',
        category: 'Microsoft Teams', serviceCategory: 'Telecoms', status: 'active',
        telecomsPricing: {
          systemType: 'Microsoft Teams', perUserMonthly: 9.50, minUsers: 10, maxUsers: 250,
          handsetCost: 0, handsetModel: 'Softphone (Teams app)',
          callPackage: { packageType: 'Unlimited UK + Mobiles', includedMinutes: 0, perMinuteRate: 0 },
          broadbandIncluded: false, broadbandSpeed: '100Mbps FTTP', broadbandMonthlyCost: 42,
          setupFee: 200, contractTermMonths: 24,
          features: ['Microsoft Teams integration', 'Call recording', 'Auto attendant/IVR', 'Call analytics', 'Voicemail to email', 'Mobile app', 'Number porting', 'SLA-backed uptime'],
          numberPortingFee: 0,
        },
      },
      {
        manufacturer: '3CX', model: 'Enterprise V20',
        description: 'Feature-rich on-premise/cloud phone system for larger businesses. Supports SIP trunking and advanced call centre features.',
        category: 'Cloud VoIP', serviceCategory: 'Telecoms', status: 'active',
        telecomsPricing: {
          systemType: 'Cloud VoIP', perUserMonthly: 14.95, minUsers: 20, maxUsers: 500,
          handsetCost: 95, handsetModel: 'Yealink T48U',
          callPackage: { packageType: 'Unlimited UK + Mobiles', includedMinutes: 0, perMinuteRate: 0 },
          broadbandIncluded: true, broadbandSpeed: '300Mbps FTTP', broadbandMonthlyCost: 0,
          setupFee: 350, contractTermMonths: 36,
          features: ['Auto attendant/IVR', 'Call recording', 'Call centre module', 'CRM integration', 'Hot desking', 'Video conferencing', 'Wallboard', 'Custom reporting'],
          numberPortingFee: 0,
        },
      },
      {
        manufacturer: 'Dell', model: 'Managed IT Pro',
        description: 'End-to-end managed IT support tailored for growing businesses. Includes helpdesk, M365, cybersecurity, and proactive monitoring.',
        category: 'Fully Managed IT', serviceCategory: 'IT', status: 'active',
        itPricing: {
          serviceType: 'Fully Managed', perUserMonthly: 42, perDeviceMonthly: 0, minUsers: 10, maxUsers: 150,
          serverManagementMonthly: 85,
          includes: ['Help desk support', 'Microsoft 365 management', 'Cybersecurity (Endpoint Protection)', 'Backup & disaster recovery', 'Network monitoring', 'Patch management', 'Quarterly business reviews'],
          m365LicenceIncluded: true, m365CostPerUser: 0, cybersecurityAddon: 0, backupPerGb: 0.08,
          setupFee: 400, projectDayRate: 600, contractTermMonths: 12,
          responseTimeSLA: '4 hours', supportHours: 'Business hours (8-6)',
          accreditations: ['Cyber Essentials Plus', 'ISO 27001', 'Microsoft Gold Partner', 'Dell Certified Partner'],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. SecureView Wales — CCTV + IT, Swansea, SA
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'Dafydd Thomas',
      company: 'SecureView Wales',
      email: 'demo-secureview@tendorai.com',
      password: DEMO_PASSWORD,
      services: ['CCTV', 'IT'],
      location: {
        address: '5 Wind Street',
        city: 'Swansea',
        postcode: 'SA1 1DP',
        region: 'South Wales',
        coverage: ['Swansea', 'Neath', 'Port Talbot', 'Llanelli', 'Carmarthen', 'Pembrokeshire'],
        coordinates: { latitude: 51.6214, longitude: -3.9436 },
      },
      contactInfo: {
        phone: '01792 345 678',
        website: 'https://www.secureviewwales.example.com',
      },
      businessProfile: {
        yearsInBusiness: 7,
        companySize: 'Small (1-50)',
        numEmployees: 15,
        specializations: ['Commercial CCTV', 'Cybersecurity', 'Retail Security'],
        certifications: ['NSI Gold', 'Cyber Essentials Plus'],
        accreditations: ['Hikvision Authorised Partner', 'Dahua Technology Partner', 'Sophos Silver Partner'],
        description: 'SecureView Wales is Swansea\'s specialist in commercial CCTV and IT security. We design, install and monitor IP camera systems for businesses of all sizes — from single-site retail to multi-location warehouses. Our IT division provides managed cybersecurity and Sophos endpoint protection to keep your business safe online and on-site.',
      },
      brands: ['Hikvision', 'Dahua', 'Sophos', 'Ubiquiti'],
      postcodeAreas: ['SA', 'CF', 'LD'],
      performance: { rating: 4.3, reviewCount: 19, averageResponseTime: 5, completionRate: 93, customerSatisfaction: 91, onTimeDelivery: 95 },
      serviceCapabilities: { responseTime: '8hr', supportHours: '9-5', installationService: true, maintenanceService: true, trainingProvided: true, remoteSupport: true, emergencySupport: false },
      commercial: { creditRating: 'Good', paymentTerms: 'Net 30' },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 18 },
      tier: 'visible',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        manufacturer: 'Hikvision', model: '4K IP Pro System',
        description: 'Enterprise 4K IP CCTV system with intelligent analytics. Suitable for commercial and industrial premises.',
        category: 'IP Camera System', serviceCategory: 'CCTV', status: 'active',
        cctvPricing: {
          systemType: 'IP Camera System', perCameraCost: 295, cameraModel: 'Hikvision DS-2CD2T86G2-4I',
          resolution: '4K 2160p', indoor: true, outdoor: true, nightVision: true,
          nvrCost: 520, nvrChannels: 32, installationPerCamera: 130, installationFlat: 0,
          monthlyMonitoring: 0, cloudStorageMonthly: 0, cloudStoragePerCamera: 0, maintenanceAnnual: 220,
          contractTermMonths: 36,
          features: ['Night vision (50m)', 'Motion detection', 'Remote mobile viewing', 'Number plate recognition (ANPR)', 'Two-way audio', 'IP67 weatherproof', 'H.265+ compression', 'Smart line crossing'],
          minCameras: 4, maxCameras: 32,
        },
      },
      {
        manufacturer: 'Dahua', model: 'Cloud CCTV Business',
        description: 'Cloud-managed CCTV with AI-powered detection and remote monitoring. Ideal for retail and hospitality.',
        category: 'Cloud-Based CCTV', serviceCategory: 'CCTV', status: 'active',
        cctvPricing: {
          systemType: 'Cloud-Based', perCameraCost: 210, cameraModel: 'Dahua IPC-HDBW3849E1-AS-PV',
          resolution: '2K 1440p', indoor: true, outdoor: true, nightVision: true,
          nvrCost: 0, nvrChannels: 0, installationPerCamera: 100, installationFlat: 0,
          monthlyMonitoring: 29.99, cloudStorageMonthly: 0, cloudStoragePerCamera: 5.99, maintenanceAnnual: 0,
          contractTermMonths: 24,
          features: ['Night vision (30m)', 'AI person/vehicle detection', 'Remote mobile viewing', 'Cloud recording', 'Push notifications', 'IP67 weatherproof', 'Active deterrence (siren & strobe)'],
          minCameras: 2, maxCameras: 16,
        },
      },
      {
        manufacturer: 'Sophos', model: 'Managed Security Suite',
        description: 'Comprehensive co-managed cybersecurity with Sophos XDR, endpoint protection, and 24/7 threat monitoring.',
        category: 'Co-Managed IT', serviceCategory: 'IT', status: 'active',
        itPricing: {
          serviceType: 'Co-Managed', perUserMonthly: 22, perDeviceMonthly: 0, minUsers: 10, maxUsers: 200,
          serverManagementMonthly: 95,
          includes: ['Sophos XDR endpoint protection', 'Email security', 'Firewall management', 'Vulnerability scanning', 'Security awareness training', 'Incident response', 'Monthly security reports'],
          m365LicenceIncluded: false, m365CostPerUser: 10.50, cybersecurityAddon: 0, backupPerGb: 0.12,
          setupFee: 600, projectDayRate: 550, contractTermMonths: 12,
          responseTimeSLA: '2 hours', supportHours: 'Extended (7-10)',
          accreditations: ['Cyber Essentials Plus', 'Sophos Gold Partner', 'NSI Gold'],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. Valleys Tech — All categories, Merthyr Tydfil, CF
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'Owen Price',
      company: 'Valleys Tech',
      email: 'demo-valleystech@tendorai.com',
      password: DEMO_PASSWORD,
      services: ['Photocopiers', 'Telecoms', 'CCTV', 'IT'],
      location: {
        address: '3 High Street',
        city: 'Merthyr Tydfil',
        postcode: 'CF47 8DP',
        region: 'South Wales',
        coverage: ['Merthyr Tydfil', 'Aberdare', 'Pontypridd', 'Treorchy', 'Rhondda', 'Mountain Ash', 'Hirwaun', 'Cardiff', 'Brecon'],
        coordinates: { latitude: 51.7480, longitude: -3.3786 },
      },
      contactInfo: {
        phone: '01685 234 567',
        website: 'https://www.valleystech.example.com',
      },
      businessProfile: {
        yearsInBusiness: 21,
        companySize: 'Medium (51-200)',
        numEmployees: 56,
        specializations: ['Full Office Technology', 'Public Sector', 'Manufacturing', 'Construction'],
        certifications: ['ISO 9001:2015', 'ISO 27001:2022', 'Cyber Essentials Plus'],
        accreditations: ['Brother Authorised Dealer', 'Yealink Gold Partner', 'Hikvision Platinum Partner', 'Microsoft Silver Partner'],
        description: 'Valleys Tech is the Valleys\' one-stop technology partner covering photocopiers, telecoms, CCTV and IT support. Founded in 2005, we serve over 400 businesses across South Wales — from small workshops in the Valleys to large public sector organisations in Cardiff. Our in-house team of 56 covers every aspect of office technology, backed by SLA-guaranteed response times and comprehensive service contracts.',
      },
      brands: ['Brother', 'Yealink', 'Hikvision', 'Microsoft', 'HP'],
      postcodeAreas: ['CF', 'NP', 'SA', 'LD'],
      performance: { rating: 4.8, reviewCount: 52, averageResponseTime: 3, completionRate: 98, customerSatisfaction: 97, onTimeDelivery: 99 },
      serviceCapabilities: { responseTime: '4hr', supportHours: '8-6', installationService: true, maintenanceService: true, trainingProvided: true, remoteSupport: true, emergencySupport: true },
      commercial: { creditRating: 'Excellent', paymentTerms: 'Net 30', preferredLeasePartners: ['Grenke', 'BNP Paribas', 'Shire Leasing'] },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 112 },
      tier: 'verified',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      // Photocopier
      {
        manufacturer: 'Brother', model: 'MFC-L9670CDN',
        description: 'Fast A4 colour MFP with 40ppm output. Cost-effective for businesses needing high-quality A4 colour without the A3 premium.',
        category: 'A4 MFP', serviceCategory: 'Photocopiers', status: 'active',
        speed: 40, isA3: false, isColour: true, minVolume: 2000, maxVolume: 10000,
        features: ['Duplex', 'Scanning', 'WiFi', 'Mobile Print', 'Secure Print', 'NFC Tap to Print'],
        paperSizes: { primary: 'A4', supported: ['A4', 'A5'] },
        costs: { machineCost: 1200, installation: 150, profitMargin: 300, totalMachineCost: 1650, cpcRates: { A4Mono: 0.30, A4Colour: 3.0 } },
        service: { level: 'Standard', responseTime: '8hr', quarterlyService: 45, includesToner: true, includesPartsLabour: true, includesDrums: true, includesStaples: false },
        leaseRates: { term36: 62, term48: 49, term60: 42 },
      },
      // Telecoms
      {
        manufacturer: 'Yealink', model: 'Cloud VoIP SME',
        description: 'Simple, affordable cloud VoIP system using Yealink handsets. Perfect for small businesses moving from traditional phone lines.',
        category: 'Cloud VoIP', serviceCategory: 'Telecoms', status: 'active',
        telecomsPricing: {
          systemType: 'Cloud VoIP', perUserMonthly: 8.50, minUsers: 2, maxUsers: 30,
          handsetCost: 65, handsetModel: 'Yealink T33G',
          callPackage: { packageType: 'Unlimited UK', includedMinutes: 0, perMinuteRate: 0 },
          broadbandIncluded: false, broadbandSpeed: '80Mbps FTTC', broadbandMonthlyCost: 30,
          setupFee: 75, contractTermMonths: 12,
          features: ['Auto attendant/IVR', 'Voicemail to email', 'Mobile app', 'Call transfer', 'Call recording', 'Number porting'],
          numberPortingFee: 0,
        },
      },
      // CCTV
      {
        manufacturer: 'Hikvision', model: 'Turbo HD Starter',
        description: 'HD analogue CCTV starter kit with Hikvision Turbo HD cameras. Budget-friendly option for small business security.',
        category: 'IP Camera System', serviceCategory: 'CCTV', status: 'active',
        cctvPricing: {
          systemType: 'IP Camera System', perCameraCost: 145, cameraModel: 'Hikvision DS-2CE78H0T-IT3F',
          resolution: 'HD 1080p', indoor: true, outdoor: true, nightVision: true,
          nvrCost: 280, nvrChannels: 8, installationPerCamera: 85, installationFlat: 0,
          monthlyMonitoring: 0, cloudStorageMonthly: 0, cloudStoragePerCamera: 0, maintenanceAnnual: 120,
          contractTermMonths: 24,
          features: ['Night vision (40m)', 'Motion detection', 'Remote mobile viewing', 'IP67 weatherproof', 'Wide dynamic range'],
          minCameras: 2, maxCameras: 8,
        },
      },
      // IT
      {
        manufacturer: 'Microsoft', model: '365 Managed Workplace',
        description: 'Fully managed Microsoft 365 environment with helpdesk, security, and backup. Everything your business needs in one monthly fee.',
        category: 'Fully Managed IT', serviceCategory: 'IT', status: 'active',
        itPricing: {
          serviceType: 'Fully Managed', perUserMonthly: 38, perDeviceMonthly: 0, minUsers: 5, maxUsers: 80,
          serverManagementMonthly: 65,
          includes: ['Help desk support', 'Microsoft 365 management', 'Cybersecurity (Endpoint Protection)', 'Backup & disaster recovery', 'Patch management', 'New starter/leaver setup', 'Hardware procurement'],
          m365LicenceIncluded: true, m365CostPerUser: 0, cybersecurityAddon: 0, backupPerGb: 0.10,
          setupFee: 300, projectDayRate: 500, contractTermMonths: 12,
          responseTimeSLA: '4 hours', supportHours: 'Business hours (8-6)',
          accreditations: ['Cyber Essentials Plus', 'Microsoft Silver Partner'],
        },
      },
    ],
  },
];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Check for existing demo vendors
    const existingDemo = await Vendor.find({ isDemoVendor: true }).select('company email');
    if (existingDemo.length > 0) {
      console.log(`Found ${existingDemo.length} existing demo vendors:`);
      existingDemo.forEach(v => console.log(`  - ${v.company} (${v.email})`));
      console.log('\nRemoving existing demo vendors and their products...');

      const demoIds = existingDemo.map(v => v._id);
      await VendorProduct.deleteMany({ vendorId: { $in: demoIds } });
      await Vendor.deleteMany({ _id: { $in: demoIds } });
      console.log('Cleaned up existing demo data.\n');
    }

    // Create each vendor and their products
    for (const { vendor: vendorData, products } of demoVendors) {
      // Create vendor using insertOne to bypass password hashing (already hashed)
      const vendor = await Vendor.collection.insertOne(vendorData);
      const vendorId = vendor.insertedId;
      console.log(`Created vendor: ${vendorData.company} (${vendorId})`);

      // Create products
      for (const product of products) {
        const newProduct = new VendorProduct({ ...product, vendorId });
        await newProduct.save();
        console.log(`  + [${product.serviceCategory}] ${product.manufacturer} ${product.model}`);
      }
      console.log('');
    }

    // Summary
    const totalVendors = demoVendors.length;
    const totalProducts = demoVendors.reduce((sum, d) => sum + d.products.length, 0);
    console.log('═══════════════════════════════════════════');
    console.log(`  Created ${totalVendors} demo vendors with ${totalProducts} products`);
    console.log('═══════════════════════════════════════════');
    console.log('\nDemo vendors:');
    demoVendors.forEach(d => {
      console.log(`  - ${d.vendor.company} (${d.vendor.tier}) — ${d.vendor.services.join(', ')}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    if (error.errors) {
      Object.entries(error.errors).forEach(([field, err]) => {
        console.error(`  ${field}: ${err.message}`);
      });
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main();
