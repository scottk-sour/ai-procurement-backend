/**
 * TendorAI - Enriched Solicitor Update Script
 * Updates 14 existing solicitor records with fee data, accreditations,
 * languages, lender panels, and other enriched fields.
 *
 * Run: node update-solicitors.js
 * Safe: uses updateOne with $set only — never overwrites _id or existing slug
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://kinder1975sd:4FtK7wvRRg24pYV0@cluster0.mpjodzz.mongodb.net/ai-procurement?retryWrites=true&w=majority&appName=Cluster0';

const firms = [
  {
    match: { $or: [{ sraNumber: '282115' }, { name: /ackland/i }] },
    update: {
      name: 'Ackland & Co Solicitors',
      sraNumber: '282115',
      'contactInfo.website': 'https://www.acklandslegal.co.uk',
      'contactInfo.phone': '029 2064 1461',
      'contactInfo.email': 'info@acklandslegal.co.uk',
      'location.address': '68 Llandaff Road, Canton',
      'location.city': 'Cardiff',
      'location.postcode': 'CF11 9NL',
      'location.region': 'South Wales',
      'location.coverage': ['Cardiff', 'South Wales'],
      practiceAreas: ['Residential Conveyancing', 'Wills & Probate'],
      accreditations: ['CQS', 'Cyber Essentials', 'Living Wage Employer'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing - Freehold Purchase/Sale', fee: '£850+VAT' },
        { service: 'Conveyancing - Leasehold Purchase/Sale', fee: '£850+VAT' },
        { service: 'Probate - Grant Only', fee: 'From £1,800+VAT' },
        { service: 'Probate - Full Administration', fee: 'From £3,000+VAT' },
        { service: 'Probate - Hourly Rate', fee: '£200-£250+VAT/hr' },
      ],
      'businessProfile.description': 'Cardiff-based solicitors specialising in residential conveyancing and probate. CQS accredited. Fixed fee conveyancing with no profit on disbursements. Serving Cardiff and South Wales.',
      'businessProfile.accreditations': ['CQS', 'Cyber Essentials', 'Living Wage Employer'],
    }
  },
  {
    match: { $or: [{ sraNumber: '638758' }, { name: /lg williams|williams.*prichard/i }] },
    update: {
      name: 'LG Williams & Prichard',
      sraNumber: '638758',
      companyNumber: '10730073',
      'contactInfo.website': 'https://www.cardiff-law.co.uk',
      'contactInfo.phone': '02920 229716',
      'contactInfo.email': 'mail@cardiff-law.co.uk',
      'location.address': '22 St Andrews Crescent',
      'location.city': 'Cardiff',
      'location.postcode': 'CF10 3DD',
      'location.region': 'South Wales',
      'location.coverage': ['Cardiff', 'South Wales'],
      practiceAreas: ['Residential Conveyancing', 'New Builds', 'Help to Buy', 'Leasehold'],
      accreditations: ['CQS'],
      languages: ['English', 'Welsh'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing - Fixed Fee (via online quote tool)', fee: 'Fixed fee - quote online' },
      ],
      individualSolicitors: [
        { name: 'Sian Mills', role: 'Director', specialisms: ['Residential Conveyancing'], qualifications: ['Qualified 2001'] },
        { name: 'Hedydd Davies', role: 'Director', specialisms: ['Residential Conveyancing', 'Welsh Language Service'], qualifications: [] },
      ],
      'businessProfile.description': 'Cardiff conveyancing specialists with a team of 10. CQS accredited. Welsh language service available. Specialists in new builds, Help to Buy and leasehold. Typical turnaround 10-14 weeks.',
      'businessProfile.accreditations': ['CQS'],
    }
  },
  {
    match: { $or: [{ sraNumber: '647122' }, { name: /rees wood terry/i }] },
    update: {
      name: 'Rees Wood Terry Solicitors',
      sraNumber: '647122',
      companyNumber: '04709180',
      'contactInfo.website': 'https://www.reeswoodterry.co.uk',
      'contactInfo.phone': '029 20 40 8800',
      'contactInfo.email': 'info@reeswoodterry.co.uk',
      'location.address': '9 St Andrews Crescent',
      'location.city': 'Cardiff',
      'location.postcode': 'CF10 3DG',
      'location.region': 'South Wales',
      'location.coverage': ['Cardiff', 'South Wales'],
      practiceAreas: ['Residential Conveyancing', 'Remortgage'],
      accreditations: ['CQS'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing Sale - Up to £250k Freehold', fee: '£800-£950' },
        { service: 'Conveyancing Sale - £250k-£300k Freehold', fee: '£900-£1,100' },
        { service: 'Conveyancing Sale - £300k-£400k Freehold', fee: '£950-£1,200' },
        { service: 'Conveyancing Sale - £400k-£500k Freehold', fee: '£1,000-£1,300' },
        { service: 'Conveyancing Purchase - Up to £250k Freehold', fee: '£800-£950' },
        { service: 'Conveyancing Purchase - £250k-£300k Freehold', fee: '£900-£1,100' },
        { service: 'Conveyancing Purchase - £300k-£400k Freehold', fee: '£950-£1,200' },
        { service: 'Conveyancing Purchase - £400k-£500k Freehold', fee: '£1,000-£1,300' },
        { service: 'Remortgage', fee: '£500-£600+VAT' },
      ],
      individualSolicitors: [
        { name: 'Frances Pitt', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: ['Qualified 2009'] },
        { name: 'Gareth Williams', role: 'Director', specialisms: ['Residential Conveyancing'], qualifications: ['Qualified 2004'] },
        { name: 'Andy Hillier', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: ['National firm background'] },
      ],
      'businessProfile.description': 'Cardiff conveyancing solicitors. CQS accredited. Transparent fee scale published online. Fees payable on completion. Typical turnaround 8-12 weeks for sales/purchases, 4-8 weeks for remortgage.',
      'businessProfile.accreditations': ['CQS'],
    }
  },
  {
    match: { $or: [{ sraNumber: '596508' }, { name: /martyn prowel|mpg solicitors/i }] },
    update: {
      name: 'MPG Solicitors',
      sraNumber: '596508',
      'contactInfo.email': 'crockey@mpgsolicitors.co.uk',
      'location.city': 'Cardiff',
      'location.region': 'South Wales',
      'location.coverage': ['Cardiff', 'Newport', 'Abergavenny', 'Bridgend', 'Ebbw Vale', 'South Wales'],
      practiceAreas: ['Residential Conveyancing', 'Legal Services'],
      officeCount: 5,
      fixedFees: [],
      individualSolicitors: [
        { name: 'Caron Rockey', role: 'Key Contact', specialisms: [], qualifications: [] },
      ],
      'businessProfile.description': 'South Wales solicitors with 5 offices across Cardiff, Newport, Abergavenny, Bridgend and Ebbw Vale.',
    }
  },
  {
    match: { $or: [{ sraNumber: '75571' }, { name: /david tang/i }] },
    update: {
      name: 'David Tang & Co',
      sraNumber: '75571',
      'contactInfo.website': 'https://www.davidtang.co.uk',
      'contactInfo.phone': '0207 439 4675',
      'contactInfo.email': 'david@davidtang.co.uk',
      'location.address': 'Suite 8 Nassau House, 122 Shaftesbury Avenue',
      'location.city': 'London',
      'location.postcode': 'W1D 5ER',
      'location.region': 'London',
      'location.coverage': ['London', 'UK'],
      practiceAreas: ['Immigration', 'Residential Conveyancing', 'Wills & Probate', 'Civil Litigation'],
      languages: ['English', 'Cantonese', 'Mandarin'],
      legalAid: false,
      fixedFees: [
        { service: 'Immigration - Leave to Remain (5yr)', fee: '£3,000-£4,500+VAT' },
        { service: 'Immigration - Leave to Remain (10yr)', fee: '£3,000-£4,500+VAT' },
        { service: 'Immigration - Leave to Remain (20yr)', fee: '~£8,000+VAT' },
        { service: 'Immigration - Entry Clearance', fee: '£2,000-£3,500+VAT' },
        { service: 'Immigration - ILR (work)', fee: '£1,500-£2,500+VAT' },
        { service: 'Immigration - ILR (family/private)', fee: '£1,800-£2,600+VAT' },
        { service: 'Immigration - British Citizenship', fee: '£1,000+VAT' },
        { service: 'Immigration - Visitor Visa', fee: '£1,000-£2,500+VAT' },
        { service: 'Immigration - Sponsorship Licence', fee: '£3,000-£5,000+VAT' },
        { service: 'Immigration - First Tier Tribunal', fee: '£3,000-£6,000+VAT' },
        { service: 'Immigration - Judicial Review', fee: '£3,000-£6,000+VAT' },
        { service: 'Immigration - Hourly Rate (Principal)', fee: '£450+VAT/hr' },
        { service: 'Immigration - Hourly Rate (Solicitor 5yr+ PQE)', fee: '£360+VAT/hr' },
        { service: 'Immigration - Hourly Rate (Solicitor up to 5yr PQE)', fee: '£300+VAT/hr' },
        { service: 'Immigration - Hourly Rate (Trainee/Paralegal)', fee: '£280+VAT/hr' },
      ],
      individualSolicitors: [
        { name: 'David Tang', role: 'Principal Solicitor', specialisms: ['Immigration'], qualifications: [] },
        { name: 'Lisa Tang', role: 'Solicitor', specialisms: ['Immigration'], qualifications: [] },
        { name: 'Tracy Zhao', role: 'Trainee Solicitor', specialisms: [], qualifications: [] },
      ],
      'businessProfile.description': 'London immigration and conveyancing solicitors based in Soho. Chinese language service available. Specialists in UK visa applications, ILR, British citizenship and sponsorship licences. Office hours Mon-Fri 10:00-18:00.',
    }
  },
  {
    match: { $or: [{ name: /amy.*co solicitors|amy and co/i }] },
    update: {
      name: 'Amy & Co Solicitors',
      'location.region': 'London',
      'location.coverage': ['London', 'UK'],
      practiceAreas: ['Residential Conveyancing', 'Wills & Probate', 'Employment', 'Debt Recovery'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing - Freehold Sale £0-£500k', fee: 'From £2,500+VAT' },
        { service: 'Conveyancing - Freehold Sale £500k-£1m', fee: 'From £4,950+VAT' },
        { service: 'Conveyancing - Freehold Sale Over £1m', fee: '0.1% of price+VAT' },
        { service: 'Conveyancing - Leasehold Sale', fee: '£1,500-£5,000+VAT' },
        { service: 'Conveyancing - Freehold Purchase £0-£500k', fee: 'From £3,500+VAT' },
        { service: 'Conveyancing - Freehold Purchase £500k-£1m', fee: 'From £7,950+VAT' },
        { service: 'Conveyancing - Freehold Purchase Over £1m', fee: '0.2% of price+VAT' },
        { service: 'Conveyancing - Leasehold Purchase', fee: '£3,575-£9,600+VAT' },
        { service: 'Probate - Simple Estate', fee: '£5,000-£15,000+VAT' },
        { service: 'Probate - Medium Estate', fee: '£15,000-£25,000+VAT' },
        { service: 'Probate - Complex Estate', fee: '£25,000-£40,000+VAT' },
        { service: 'Probate - Hourly Rate (Principal/Partner)', fee: '£285-£395+VAT/hr' },
        { service: 'Probate - Hourly Rate (Solicitor)', fee: '£250+VAT/hr' },
        { service: 'Probate - Hourly Rate (Paralegal)', fee: '£195+VAT/hr' },
        { service: 'Employment Tribunal - Simple', fee: '£7,500-£12,500+VAT' },
        { service: 'Employment Tribunal - Medium', fee: '£12,500-£25,000+VAT' },
        { service: 'Employment Tribunal - Complex', fee: '£25,000-£40,000+VAT' },
      ],
      'businessProfile.description': 'London solicitors specialising in residential conveyancing, probate, employment tribunals and debt recovery. Transparent published fee schedule. Conveyancing turnaround 4-6 weeks to exchange.',
    }
  },
  {
    match: { $or: [{ sraNumber: '46491' }, { name: /baldwin.*co|baldwin and co/i }] },
    update: {
      name: 'Baldwin & Co Solicitors',
      sraNumber: '46491',
      'contactInfo.website': 'https://www.baldwinsolicitors.co.uk',
      'contactInfo.phone': '020 7237 3035',
      'contactInfo.email': 'info@baldwinsolicitors.co.uk',
      'location.address': 'Unit 2b, Quinton Court, Plough Way',
      'location.city': 'London',
      'location.postcode': 'SE16 7FA',
      'location.region': 'London',
      'location.coverage': ['London', 'Surrey Quays', 'Canada Water'],
      practiceAreas: ['Residential Conveyancing', 'Commercial Property', 'Wills & Probate', 'Family', 'Civil Litigation'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing - Freehold/Leasehold Purchase or Sale up to £1m', fee: '£995+VAT' },
        { service: 'Conveyancing - Over £1m', fee: 'Bespoke' },
        { service: 'Conveyancing - New Build Surcharge', fee: '£300+VAT' },
        { service: 'Conveyancing - Professional Indemnity Contribution', fee: '£90+VAT' },
        { service: 'Conveyancing - Mortgage Handling', fee: '£275+VAT minimum' },
        { service: 'Conveyancing - Fast Completion (<10 days)', fee: '£50+VAT surcharge' },
        { service: 'Probate - Hourly Rate (Partner)', fee: '£350+VAT/hr' },
        { service: 'Probate - Hourly Rate (Solicitor)', fee: '£250+VAT/hr' },
        { service: 'Probate - Hourly Rate (Trainee)', fee: '£175+VAT/hr' },
        { service: 'Wills - Single Will', fee: '£200+VAT' },
        { service: 'Wills - Mirror Wills', fee: '£350+VAT' },
      ],
      'businessProfile.description': 'London solicitors near Surrey Quays and Canada Water. Simple, transparent conveyancing at £995+VAT fixed fee for all properties up to £1m. Wills from £200. 15 minute walk from Surrey Quays Overground or Canada Water Underground.',
    }
  },
  {
    match: { $or: [{ sraNumber: '633024' }, { name: /lees.*co law|lees and co/i }] },
    update: {
      name: 'Lees & Co Law',
      sraNumber: '633024',
      companyNumber: '16236558',
      'contactInfo.website': 'https://www.leesandco.co.uk',
      'contactInfo.phone': '07799 143825',
      'contactInfo.email': 'enquiries@leesandco.co.uk',
      'location.region': 'England & Wales',
      'location.coverage': ['UK'],
      practiceAreas: ['Wills & Probate', 'Lasting Powers of Attorney', 'Trusts', 'Tax Planning'],
      legalAid: false,
      organisationType: 'Limited Company',
      fixedFees: [
        { service: 'Wills - Basic Will', fee: '£350+VAT' },
        { service: 'Wills - Mirror Wills', fee: '£500+VAT' },
        { service: 'Wills - Life Interest Trust Will', fee: '£795+VAT' },
        { service: 'Wills - Mirror Life Interest Trust Wills', fee: '£950+VAT' },
        { service: 'Wills - Discretionary Trust Will', fee: '£1,000+VAT' },
        { service: 'Wills - Mirror Discretionary Trust Wills', fee: '£1,500+VAT' },
        { service: 'LPA - Single (Property/Financial or Health/Welfare)', fee: '£600+VAT' },
        { service: 'LPA - Both Types Single Person', fee: '£750+VAT' },
        { service: 'LPA - Both Types for Couple', fee: '£950+VAT' },
        { service: 'LPA - OPG Registration Fee', fee: '£92 per LPA (disbursement)' },
        { service: 'Probate - Application Only', fee: '£995+VAT' },
        { service: 'Probate - Application with Date of Death Figures', fee: '£1,500-£2,000+VAT' },
        { service: 'Probate - Estate Administration IHT400', fee: '£2,000-£3,000+VAT' },
        { service: 'Probate - Full Administration Hourly Rate', fee: '£260+VAT/hr' },
        { service: 'Trust Creation', fee: 'From £2,000+VAT' },
        { service: 'Trust Registration Service', fee: '£350+VAT' },
        { service: 'Trust Administration Hourly Rate', fee: '£260+VAT/hr' },
        { service: 'Inheritance Tax Report', fee: 'From £1,500+VAT' },
        { service: 'Severance of Joint Tenancy', fee: '£100+VAT' },
        { service: 'Letter of Wishes', fee: 'From £150+VAT' },
      ],
      'businessProfile.description': 'Specialist wills, probate, LPA and trust solicitors. Consultant practice of Nexa Law Limited. Transparent fixed fee pricing across all services. Specialists in trust creation, IHT planning and estate administration.',
    }
  },
  {
    match: { $or: [{ sraNumber: '633024' }, { name: /nadine wong/i }] },
    update: {
      name: 'Nadine Wong & Co Solicitors',
      'contactInfo.website': 'https://www.nadinewongsolicitors.co.uk',
      'contactInfo.phone': '020 7243 8888',
      'contactInfo.email': 'nadine@nadinewongsolicitors.co.uk',
      'location.address': '45 Queensway',
      'location.city': 'London',
      'location.postcode': 'W2 4QJ',
      'location.region': 'London',
      'location.coverage': ['London', 'UK'],
      practiceAreas: ['Immigration', 'Residential Conveyancing', 'Family Law', 'Wills & Probate', 'China Visa'],
      accreditations: ['CQS', 'ILPA', 'TPO', 'TSI'],
      languages: ['English', 'Cantonese', 'Mandarin'],
      legalAid: false,
      lenderPanels: ['Barclays', 'HSBC', 'Clydesdale Bank', 'Yorkshire Bank', 'Nationwide'],
      fixedFees: [
        { service: 'Conveyancing - Residential Sale/Purchase', fee: '£1,500-£8,000+VAT' },
        { service: 'Conveyancing - Money on Account', fee: '£500-£750' },
        { service: 'Conveyancing - Overseas Buyer Surcharge (up to £100k funds)', fee: '£1,000+VAT' },
        { service: 'Conveyancing - Overseas Buyer per additional £100k', fee: '£500+VAT' },
        { service: 'Conveyancing - Deed of Gift', fee: '£750+VAT' },
        { service: 'Conveyancing - Aborted Matter Hourly Rate', fee: '£150/hr' },
        { service: 'LPA - Single LPA', fee: 'From £500+VAT' },
        { service: 'LPA - Both LPAs Single Person', fee: 'From £900+VAT' },
        { service: 'LPA - Chinese Language Service Single', fee: 'From £600+VAT' },
        { service: 'LPA - Chinese Language Service Both', fee: 'From £1,100+VAT' },
        { service: 'LPA - OPG Registration', fee: '£82 per LPA (disbursement)' },
        { service: 'Probate - Straightforward Estate (Group 1)', fee: '£5,000-£11,000+VAT' },
        { service: 'Probate - Hourly Rate (Director)', fee: 'On request' },
      ],
      individualSolicitors: [
        { name: 'Nadine Wong', role: 'Principal Solicitor', specialisms: ['Immigration', 'Conveyancing'], qualifications: ['ILPA Member'] },
      ],
      'businessProfile.description': 'London solicitors based in Queensway. CQS accredited since 2013. Chinese and English language service. Specialists in immigration, conveyancing and international estates. On panel for Barclays, HSBC, Clydesdale, Yorkshire Bank and Nationwide. Experience in international estates and Chinese jurisdiction since 1991.',
      'businessProfile.accreditations': ['CQS', 'ILPA'],
    }
  },
  {
    match: { $or: [{ sraNumber: '55002' }, { name: /barnes.*partners|barnes and partners/i }] },
    update: {
      name: 'Barnes & Partners Solicitors',
      sraNumber: '55002',
      'contactInfo.website': 'https://barnesandpartners.com',
      'contactInfo.phone': '020 8370 2800',
      'location.city': 'London',
      'location.region': 'London & Home Counties',
      'location.coverage': ['London', 'Enfield', 'Cheshunt', 'Chingford', 'Crouch End', 'Stevenage'],
      practiceAreas: ['Residential Conveyancing', 'Commercial Property', 'Wills & Probate', 'Family', 'Civil Litigation', 'Employment', 'Landlord & Tenant', 'Power of Attorney'],
      accreditations: ['CQS', 'Family Law Advanced', 'Children Law', 'Community Legal Services'],
      legalAid: true,
      officeCount: 7,
      fixedFees: [
        { service: 'Conveyancing - Legal Fees', fee: '£700-£1,500+VAT' },
        { service: 'Conveyancing - Mortgage Lender Acting', fee: '£200-£500+VAT' },
        { service: 'Conveyancing - Search Fees', fee: '£331.67' },
        { service: 'Conveyancing - Estimated Total inc VAT', fee: '£1,784-£3,272' },
      ],
      individualSolicitors: [
        { name: 'Robert Webber', role: 'Partner', specialisms: ['Residential Conveyancing', 'Commercial Property', 'Wills & Probate'], qualifications: [] },
        { name: 'Nancy Mortemore', role: 'Partner & Department Head', specialisms: ['Residential Conveyancing', 'Wills & Probate', 'Power of Attorney'], qualifications: [] },
        { name: 'Robert Dawson', role: 'Partner', specialisms: ['Residential Conveyancing', 'Commercial Property'], qualifications: [] },
        { name: 'Nicola Payne', role: 'Partner', specialisms: ['Residential Conveyancing'], qualifications: [] },
        { name: 'Ozlem Ahmet', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: [] },
      ],
      'businessProfile.description': 'London and Home Counties solicitors with 7 offices. Over 40 years experience. Legal aid contracts in 7 offices. Specialists in conveyancing, family law and wills. Offices in Enfield, Cheshunt, Chingford, Crouch End and Stevenage.',
      'businessProfile.accreditations': ['CQS', 'Family Law Advanced', 'Children Law'],
    }
  },
  {
    match: { $or: [{ name: /graham evans/i }] },
    update: {
      name: 'Graham Evans & Partners Solicitors',
      'contactInfo.website': 'https://www.geplegal.co.uk',
      'contactInfo.phone': '01792 655822',
      'location.address': 'Swansea',
      'location.city': 'Swansea',
      'location.region': 'South Wales',
      'location.coverage': ['Swansea', 'South Wales'],
      practiceAreas: ['Personal Injury', 'Medical Negligence', 'Residential Conveyancing', 'Family', 'Employment', 'Wills & Probate', 'Civil Litigation'],
      accreditations: ['CQS', 'Children Law', 'Family Law', 'Personal Injury (SRA)', 'Resolution', 'Community Legal Service', 'APIL'],
      legalAid: true,
      fixedFees: [
        { service: 'Conveyancing - Up to £100k', fee: '£780 inc VAT' },
        { service: 'Conveyancing - £100k-£150k', fee: '£840 inc VAT' },
        { service: 'Conveyancing - £150k-£200k', fee: '£900 inc VAT' },
        { service: 'Conveyancing - £200k-£250k', fee: '£960 inc VAT' },
        { service: 'Conveyancing - £250k-£300k', fee: '£1,020 inc VAT' },
        { service: 'Conveyancing - £300k-£400k', fee: '£1,080 inc VAT' },
        { service: 'Conveyancing - £400k-£450k', fee: '£1,140 inc VAT' },
        { service: 'Conveyancing - £450k-£500k', fee: '£1,200 inc VAT' },
        { service: 'Conveyancing - £500k-£600k', fee: '£1,260 inc VAT' },
        { service: 'Conveyancing - £600k-£700k', fee: '£1,320-£1,380 inc VAT' },
        { service: 'Conveyancing - £700k-£900k', fee: '£1,440-£1,500 inc VAT' },
        { service: 'Conveyancing - £900k-£1m', fee: '£1,560 inc VAT' },
        { service: 'Conveyancing - Leasehold Supplement', fee: '£150+VAT' },
        { service: 'Conveyancing - New Build Supplement', fee: '£150+VAT' },
        { service: 'Conveyancing - Remortgage', fee: '£550+VAT' },
        { service: 'Personal Injury - No Win No Fee', fee: 'Max 25% of damages' },
      ],
      individualSolicitors: [
        { name: 'Louise Holmes', role: 'Solicitor', specialisms: ['Personal Injury'], qualifications: [] },
        { name: 'Steven Spencer', role: 'Solicitor', specialisms: ['Personal Injury'], qualifications: [] },
        { name: 'Craig Jenkins', role: 'Partner', specialisms: ['Personal Injury'], qualifications: [] },
      ],
      'businessProfile.description': 'Swansea solicitors with over 40 years combined experience. APIL accredited practice. No win no fee personal injury (max 25% of damages). Full conveyancing fee scale published online. Legal aid available. CQS, Children Law, Family Law and Personal Injury accredited.',
      'businessProfile.accreditations': ['CQS', 'APIL', 'Children Law', 'Family Law', 'Personal Injury'],
    }
  },
  {
    match: { $or: [{ sraNumber: '569494' }, { name: /john morse/i }] },
    update: {
      name: 'John Morse Solicitors',
      sraNumber: '569494',
      companyNumber: '07917274',
      'contactInfo.website': 'https://johnmorse.co.uk',
      'contactInfo.phone': '01792 648111',
      'location.city': 'Swansea',
      'location.region': 'South Wales',
      'location.coverage': ['Swansea', 'South Wales', 'South West', 'London', 'Midlands'],
      practiceAreas: ['Residential Conveyancing', 'Commercial Property', 'Wills & Probate', 'Personal Injury', 'Medical Negligence', 'Family', 'Civil Litigation', 'Landlord & Tenant', 'Lasting Powers of Attorney', 'Licensing'],
      accreditations: ['CQS', 'Clinical Negligence', 'Personal Injury (SRA)', 'Cyber Essentials'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing Sale - Freehold up to £100k', fee: '£700+VAT' },
        { service: 'Conveyancing Sale - Freehold £100k-£200k', fee: '£750+VAT' },
        { service: 'Conveyancing Sale - Freehold £200k-£300k', fee: '£800+VAT' },
        { service: 'Conveyancing Sale - Freehold £300k-£400k', fee: '£850+VAT' },
        { service: 'Conveyancing Sale - Freehold £400k-£500k', fee: '£900+VAT' },
        { service: 'Conveyancing Sale - Freehold Over £500k', fee: '£1,000+VAT minimum' },
        { service: 'Conveyancing Sale - Leasehold up to £100k', fee: '£850+VAT' },
        { service: 'Conveyancing Sale - Leasehold £100k-£200k', fee: '£900+VAT' },
        { service: 'Conveyancing Sale - Leasehold £200k-£300k', fee: '£950+VAT' },
        { service: 'Conveyancing Sale - Leasehold £300k-£400k', fee: '£1,000+VAT' },
        { service: 'Conveyancing Sale - Leasehold £400k-£500k', fee: '£1,050+VAT' },
        { service: 'Conveyancing Sale - Leasehold Over £500k', fee: '£1,100+VAT minimum' },
        { service: 'Conveyancing Purchase - Freehold up to £100k', fee: '£700+VAT' },
        { service: 'Conveyancing Purchase - Freehold £100k-£200k', fee: '£750+VAT' },
        { service: 'Conveyancing Purchase - Freehold £200k-£300k', fee: '£800+VAT' },
        { service: 'Conveyancing Purchase - Freehold £300k-£400k', fee: '£850+VAT' },
        { service: 'Conveyancing Purchase - Freehold £400k-£500k', fee: '£900+VAT' },
        { service: 'Conveyancing Purchase - Freehold Over £500k', fee: '£1,000+VAT minimum' },
        { service: 'Conveyancing New Build - Freehold up to £100k', fee: '£850+VAT' },
        { service: 'Conveyancing New Build - Freehold £100k-£200k', fee: '£900+VAT' },
        { service: 'Remortgage', fee: '£500+VAT minimum' },
        { service: 'Remortgage with Transfer', fee: '£650+VAT minimum' },
        { service: 'Freehold Reversion Purchase', fee: '£600' },
        { service: 'First Registration', fee: '£150+VAT' },
        { service: 'Help to Buy Mortgage', fee: '£200+VAT' },
      ],
      'businessProfile.description': 'Swansea solicitors covering South Wales, South West, London and Midlands. CQS and Clinical Negligence accredited. Full published conveyancing fee scale for freehold, leasehold and new builds. Incorporating Michelle Valerio and McGarrigle-Jones Solicitors.',
      'businessProfile.accreditations': ['CQS', 'Clinical Negligence', 'Personal Injury', 'Cyber Essentials'],
    }
  },
  {
    match: { $or: [{ sraNumber: '425900' }, { name: /morgan laroche|morgan la roche/i }] },
    update: {
      name: 'Morgan LaRoche',
      sraNumber: '425900',
      companyNumber: '5556632',
      'contactInfo.website': 'https://www.morganlaroche.com',
      'contactInfo.phone': '01792 776776',
      'location.address': 'Bay House, Phoenix Way',
      'location.city': 'Swansea',
      'location.postcode': 'SA7 9LA',
      'location.region': 'South Wales & Mid Wales',
      'location.coverage': ['Swansea', 'Carmarthen', 'Aberystwyth', 'South Wales', 'West Wales', 'Mid Wales'],
      practiceAreas: ['Residential Conveyancing', 'Commercial Property', 'Corporate & Commercial', 'Employment', 'Family', 'Estate Planning & Administration', 'Litigation', 'Agriculture', 'Insolvency', 'Intellectual Property'],
      accreditations: ['CQS', 'Chambers UK', 'Legal 500', 'Cyber Essentials', 'Association of Lifetime Lawyers', 'Resolution'],
      languages: ['English', 'Welsh'],
      legalAid: false,
      officeCount: 3,
      fixedFees: [
        { service: 'Conveyancing - Freehold Purchase up to £500k', fee: '£2,000+VAT' },
        { service: 'Conveyancing - Freehold Purchase £500k-£750k', fee: '£2,250+VAT' },
        { service: 'Conveyancing - Freehold Purchase £750k-£1m', fee: '£2,750+VAT' },
        { service: 'Conveyancing - Freehold Purchase Over £1m', fee: '1% of purchase price+VAT' },
        { service: 'Conveyancing - Leasehold Purchase up to £500k', fee: '£2,500+VAT' },
        { service: 'Conveyancing - Leasehold Purchase £500k-£750k', fee: '£2,750+VAT' },
        { service: 'Conveyancing - Leasehold Purchase £750k-£1m', fee: '£3,000+VAT' },
        { service: 'Conveyancing - Leasehold Purchase Over £1m', fee: '1% of purchase price+VAT' },
        { service: 'Conveyancing - Freehold Sale up to £500k', fee: '£1,500+VAT' },
        { service: 'Conveyancing - Freehold Sale £500k-£750k', fee: '£1,750+VAT' },
        { service: 'Conveyancing - Freehold Sale £750k-£1m', fee: '£2,000+VAT' },
        { service: 'Conveyancing - Freehold Sale Over £1m', fee: '1% of sale price+VAT' },
        { service: 'Conveyancing - Leasehold Sale up to £500k', fee: '£2,000+VAT' },
        { service: 'Conveyancing - Leasehold Sale £500k-£750k', fee: '£2,250+VAT' },
        { service: 'Conveyancing - Leasehold Sale £750k-£1m', fee: '£2,500+VAT' },
        { service: 'Probate - Grant Only (no IHT)', fee: '£1,450+VAT' },
        { service: 'Probate - Grant with IHT Return', fee: 'From £2,000+VAT' },
        { service: 'Probate - Personal Representatives Report', fee: 'From £500+VAT' },
        { service: 'Probate - Deed of Variation', fee: '£650+VAT' },
        { service: 'Probate - Deed of Renunciation', fee: '£250+VAT' },
        { service: 'Probate - Full Administration up to £1m (Associate Solicitor)', fee: '£6,250-£8,750+VAT' },
        { service: 'Probate - Full Administration up to £1m (Director)', fee: '£8,125-£11,375+VAT' },
        { service: 'Probate - Full Administration Over £1m', fee: '1.5% first £1m, 0.5% £1m-£4m+VAT' },
        { service: 'Probate - Hourly Rate (Director)', fee: '£325+VAT/hr' },
        { service: 'Probate - Hourly Rate (Associate Director)', fee: 'From £280+VAT/hr' },
        { service: 'Probate - Hourly Rate (Associate Solicitor)', fee: '£250+VAT/hr' },
        { service: 'Probate - Hourly Rate (Solicitor)', fee: 'From £195+VAT/hr' },
        { service: 'Probate - Hourly Rate (Trainee)', fee: '£150+VAT/hr' },
      ],
      'businessProfile.description': 'Chambers UK and Legal 500 ranked solicitors with 3 offices across Swansea, Carmarthen and Aberystwyth. Welsh and English language service. Specialists in residential and commercial property, agriculture, corporate and private client work across South, West and Mid Wales. CQS, Cyber Essentials and Association of Lifetime Lawyers accredited.',
      'businessProfile.accreditations': ['CQS', 'Chambers UK', 'Legal 500', 'Cyber Essentials', 'Association of Lifetime Lawyers', 'Resolution'],
    }
  },
  {
    match: { $or: [{ sraNumber: '421845' }, { name: /goldstones/i }] },
    update: {
      name: 'Goldstones Solicitors',
      sraNumber: '421845',
      companyNumber: '546594',
      'contactInfo.website': 'https://goldstones.co.uk',
      'contactInfo.phone': '01792 643021',
      'contactInfo.email': 'law@goldstones.co.uk',
      'location.address': '9-10 Walter Road',
      'location.city': 'Swansea',
      'location.postcode': 'SA1 5NF',
      'location.region': 'South Wales',
      'location.coverage': ['Swansea', 'South Wales'],
      practiceAreas: ['Residential Conveyancing', 'Commercial Conveyancing', 'Wills & Probate', 'Powers of Attorney', 'Family', 'Criminal Law'],
      legalAid: false,
      fixedFees: [
        { service: 'Conveyancing Purchase/Sale - £0-£200k', fee: '£780-£936 inc VAT' },
        { service: 'Conveyancing Purchase/Sale - £200k-£300k', fee: '£936-£984 inc VAT' },
        { service: 'Conveyancing Purchase/Sale - £300k-£500k', fee: '£984-£1,200 inc VAT' },
        { service: 'Conveyancing Purchase/Sale - £500k-£700k', fee: '£1,200-£1,440 inc VAT' },
        { service: 'Conveyancing Purchase/Sale - Over £700k', fee: '0.15% capped at £3,000' },
        { service: 'Conveyancing - Leasehold Supplement', fee: '£100-£350 inc VAT' },
        { service: 'Conveyancing - New Build Supplement', fee: '£150 inc VAT' },
        { service: 'Conveyancing - Help to Buy Supplement', fee: '£250 inc VAT' },
        { service: 'Conveyancing - Shared Ownership', fee: '£250 inc VAT' },
        { service: 'Conveyancing - Search Fees', fee: '~£360 inc VAT' },
        { service: 'Conveyancing - Bank Transfer Fee', fee: '£19.20 inc VAT' },
      ],
      individualSolicitors: [
        { name: 'Helen Lowe', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: [] },
        { name: 'Bridgitte Harvey', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: [] },
        { name: 'Julian Hoskins', role: 'Solicitor', specialisms: ['Residential Conveyancing'], qualifications: [] },
        { name: 'Catherine Stewart', role: 'Consultant', specialisms: ['Residential Conveyancing'], qualifications: [] },
      ],
      'businessProfile.description': 'Swansea solicitors based on Walter Road. Out of hours service available. Specialists in residential and commercial conveyancing, wills, probate and family law. Transparent published fee scale with fees inclusive of VAT.',
    }
  },
];

async function updateSolicitors() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('ai-procurement');
    const vendors = db.collection('vendors');

    let updated = 0;
    let notFound = 0;

    for (const firm of firms) {
      const result = await vendors.updateOne(
        firm.match,
        { $set: firm.update },
        { upsert: false }
      );

      if (result.matchedCount === 0) {
        console.log(`NOT FOUND: ${firm.update.name}`);
        notFound++;
      } else {
        console.log(`UPDATED: ${firm.update.name} (modified: ${result.modifiedCount})`);
        updated++;
      }
    }

    console.log(`\nDone. Updated: ${updated} | Not found: ${notFound}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

updateSolicitors();
