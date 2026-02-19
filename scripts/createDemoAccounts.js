// scripts/createDemoAccounts.js
// Creates demo vendor accounts for mortgage-advisor and estate-agent verticals.
// Usage: node scripts/createDemoAccounts.js

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';

dotenv.config();

const DEMO_PASSWORD = await bcrypt.hash('DemoVendor2026!', 12);

const demoVendors = [
  // ═══════════════════════════════════════════════════════════
  // 1. Cardiff Mortgage Solutions — Mortgage Advisor, Cardiff
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'James Morgan',
      company: 'Cardiff Mortgage Solutions',
      email: 'demo-mortgage@tendorai.com',
      password: DEMO_PASSWORD,
      vendorType: 'mortgage-advisor',
      services: ['Mortgage Advisors'],
      practiceAreas: ['Residential Mortgages', 'First-Time Buyer', 'Buy-to-Let'],
      fcaNumber: 'DEMO-FCA-001',
      location: {
        address: '22 Churchill Way',
        city: 'Cardiff',
        postcode: 'CF10 2DY',
        region: 'South Wales',
        coverage: ['Cardiff', 'Newport', 'Barry', 'Bridgend', 'Pontypridd', 'Caerphilly', 'Penarth'],
        coordinates: { latitude: 51.4816, longitude: -3.1791 },
      },
      contactInfo: {
        phone: '029 2045 6789',
        website: 'https://www.cardiffmortgages.example.com',
      },
      businessProfile: {
        yearsInBusiness: 12,
        companySize: 'Small (1-50)',
        numEmployees: 8,
        specializations: ['First-Time Buyers', 'Residential Mortgages', 'Buy-to-Let Portfolios'],
        certifications: ['CeMAP Qualified'],
        accreditations: ['CeMAP', 'Equity Release Council', 'Whole of Market'],
        description: 'Cardiff Mortgage Solutions is an FCA-authorised, whole-of-market mortgage brokerage based in Cardiff city centre. We help first-time buyers, home movers, and buy-to-let investors find the best mortgage deals from the whole market. Our team of CeMAP-qualified advisors provides free initial consultations and no-obligation mortgage comparisons.',
      },
      lenderPanels: ['Nationwide', 'Halifax', 'Barclays', 'NatWest', 'HSBC', 'Santander'],
      fixedFees: [
        { service: 'Residential Mortgage Advice', fee: 'Free initial consultation' },
        { service: 'Remortgage Advice', fee: 'from £499' },
        { service: 'Buy-to-Let Advice', fee: 'from £595' },
      ],
      performance: { rating: 4.8, reviewCount: 42, averageResponseTime: 2, completionRate: 96, customerSatisfaction: 97, onTimeDelivery: 95 },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 35 },
      tier: 'verified',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        serviceCategory: 'MortgageAdvisor',
        category: 'residential-mortgages',
        name: 'Residential Mortgage Advice',
        description: 'Whole-of-market mortgage advice for home buyers. We compare thousands of deals to find the best rate for your circumstances.',
        status: 'active',
        mortgageAdvisorPricing: {
          serviceCategory: 'Residential Mortgages',
          serviceName: 'Residential Mortgage Advice',
          description: 'Full mortgage advice service including application support, conveyancer liaison, and completion.',
          feeType: 'fee-based',
          feeAmount: 499,
          lenderPanel: true,
          appointmentType: 'In-person or video call',
        },
      },
      {
        serviceCategory: 'MortgageAdvisor',
        category: 'first-time-buyer',
        name: 'First-Time Buyer Package',
        description: 'Specialist advice for first-time buyers, including Help to Buy, shared ownership, and 95% LTV mortgage options.',
        status: 'active',
        mortgageAdvisorPricing: {
          serviceCategory: 'First-Time Buyer',
          serviceName: 'First-Time Buyer Mortgage Advice',
          description: 'Tailored advice for first-time buyers including government scheme guidance and deposit planning.',
          feeType: 'free',
          lenderPanel: true,
          appointmentType: 'In-person, phone, or video call',
        },
      },
      {
        serviceCategory: 'MortgageAdvisor',
        category: 'buy-to-let',
        name: 'Buy-to-Let Mortgage Advice',
        description: 'Expert buy-to-let mortgage advice for landlords and property investors, including portfolio and limited company lending.',
        status: 'active',
        mortgageAdvisorPricing: {
          serviceCategory: 'Buy-to-Let',
          serviceName: 'Buy-to-Let Mortgage Advice',
          description: 'Specialist BTL advice including rental calculations, stress testing, and portfolio lending options.',
          feeType: 'fee-based',
          feeAmount: 595,
          lenderPanel: true,
          appointmentType: 'In-person or video call',
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 2. Cardiff Property Partners — Estate Agent, Cardiff
  // ═══════════════════════════════════════════════════════════
  {
    vendor: {
      name: 'Sarah Williams',
      company: 'Cardiff Property Partners',
      email: 'demo-estate@tendorai.com',
      password: DEMO_PASSWORD,
      vendorType: 'estate-agent',
      services: ['Estate Agents'],
      practiceAreas: ['Sales', 'Lettings', 'Property Management'],
      propertymarkNumber: 'PM-DEMO-001',
      propertymarkQualification: 'NAEA & ARLA',
      location: {
        address: '88 St Mary Street',
        city: 'Cardiff',
        postcode: 'CF10 1FA',
        region: 'South Wales',
        coverage: ['Cardiff', 'Penarth', 'Barry', 'Llandaff', 'Pontcanna', 'Whitchurch', 'Roath'],
        coordinates: { latitude: 51.4771, longitude: -3.1783 },
      },
      contactInfo: {
        phone: '029 2067 8901',
        website: 'https://www.cardiffpropertypartners.example.com',
      },
      businessProfile: {
        yearsInBusiness: 15,
        companySize: 'Small (1-50)',
        numEmployees: 14,
        specializations: ['Residential Sales', 'Lettings', 'Property Management'],
        certifications: ['Client Money Protection'],
        accreditations: ['NAEA Propertymark', 'ARLA Propertymark', 'The Property Ombudsman'],
        description: 'Cardiff Property Partners is a Propertymark-registered estate agency covering Cardiff and the surrounding areas. We specialise in residential sales, lettings, and property management. All properties are listed on Rightmove and Zoopla, with professional photography and floorplans as standard. Our NAEA and ARLA-qualified team provides honest valuations and proactive marketing.',
      },
      portalListings: ['Rightmove', 'Zoopla', 'OnTheMarket'],
      coveragePostcodes: ['CF10', 'CF11', 'CF14', 'CF15', 'CF23', 'CF24', 'CF64'],
      fixedFees: [
        { service: 'Sales Fee (Sole Agency)', fee: 'from 1% + VAT' },
        { service: 'Lettings Fee (Tenant Find)', fee: 'from £600 + VAT' },
        { service: 'Full Management', fee: 'from 10% + VAT of monthly rent' },
      ],
      performance: { rating: 4.6, reviewCount: 58, averageResponseTime: 1, completionRate: 94, customerSatisfaction: 93, onTimeDelivery: 96 },
      account: { status: 'active', verificationStatus: 'verified', loginCount: 52 },
      tier: 'verified',
      subscriptionStatus: 'active',
      listingStatus: 'verified',
      isDemoVendor: true,
    },
    products: [
      {
        serviceCategory: 'EstateAgent',
        category: 'sales',
        name: 'Residential Property Sales',
        description: 'Full property sales service including professional photography, Rightmove/Zoopla listings, accompanied viewings, and negotiation through to completion.',
        status: 'active',
        estateAgentPricing: {
          serviceCategory: 'Sales',
          serviceName: 'Residential Property Sales',
          description: 'Complete sales service with professional photography, portal listings, and dedicated agent.',
          feeType: 'percentage',
          feePercentage: 1.0,
          propertyTypes: ['Detached', 'Semi-Detached', 'Terraced', 'Flat', 'Bungalow'],
          coveragePostcodes: ['CF10', 'CF11', 'CF14', 'CF15', 'CF23', 'CF24', 'CF64'],
          portalListings: ['Rightmove', 'Zoopla', 'OnTheMarket'],
        },
      },
      {
        serviceCategory: 'EstateAgent',
        category: 'lettings',
        name: 'Lettings & Tenant Find',
        description: 'Comprehensive lettings service including tenant referencing, Right to Rent checks, inventory preparation, and tenancy agreement handling.',
        status: 'active',
        estateAgentPricing: {
          serviceCategory: 'Lettings',
          serviceName: 'Lettings & Tenant Find',
          description: 'Full lettings service including marketing, viewings, referencing, and agreement preparation.',
          feeType: 'fixed',
          feeAmount: 600,
          propertyTypes: ['Flat', 'Terraced', 'Semi-Detached', 'Detached', 'HMO'],
          coveragePostcodes: ['CF10', 'CF11', 'CF14', 'CF15', 'CF23', 'CF24', 'CF64'],
          portalListings: ['Rightmove', 'Zoopla'],
        },
      },
      {
        serviceCategory: 'EstateAgent',
        category: 'property-management',
        name: 'Full Property Management',
        description: 'End-to-end property management including rent collection, maintenance coordination, inspections, and tenant communication.',
        status: 'active',
        estateAgentPricing: {
          serviceCategory: 'Property Management',
          serviceName: 'Full Property Management',
          description: 'Complete management service including rent collection, maintenance, quarterly inspections.',
          feeType: 'percentage',
          feePercentage: 10,
          propertyTypes: ['Flat', 'Terraced', 'Semi-Detached', 'Detached', 'HMO'],
          coveragePostcodes: ['CF10', 'CF11', 'CF14', 'CF15', 'CF23', 'CF24', 'CF64'],
          portalListings: ['Rightmove', 'Zoopla', 'OnTheMarket'],
        },
      },
    ],
  },
];

async function createDemoAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const demo of demoVendors) {
      // Check if vendor already exists
      const existing = await Vendor.findOne({ email: demo.vendor.email });
      if (existing) {
        console.log(`⚠ Vendor already exists: ${demo.vendor.email} — skipping`);
        continue;
      }

      // Create vendor
      const vendor = await Vendor.create(demo.vendor);
      console.log(`✓ Created vendor: ${vendor.company} (${vendor.email})`);

      // Create products
      for (const product of demo.products) {
        await VendorProduct.create({
          ...product,
          vendorId: vendor._id,
        });
        console.log(`  + Product: ${product.name}`);
      }
    }

    console.log('\nDone! Demo accounts created.');
    console.log('  demo-mortgage@tendorai.com / DemoVendor2026!');
    console.log('  demo-estate@tendorai.com / DemoVendor2026!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

createDemoAccounts();
