// scripts/seedDemoPosts.js
// Seeds 2-3 demo blog posts per demo vendor.
// Run after seedDemoVendors.js
// Usage: node scripts/seedDemoPosts.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';
import VendorPost from '../models/VendorPost.js';

dotenv.config();

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find all demo vendors
    const demoVendors = await Vendor.find({ isDemoVendor: true }).select('company services location.city').lean();
    if (demoVendors.length === 0) {
      console.log('No demo vendors found. Run seedDemoVendors.js first.');
      return;
    }

    console.log(`Found ${demoVendors.length} demo vendors\n`);

    // Remove existing demo posts
    const deleted = await VendorPost.deleteMany({ isDemoVendor: true });
    if (deleted.deletedCount > 0) {
      console.log(`Removed ${deleted.deletedCount} existing demo posts\n`);
    }

    // Post templates per vendor
    const postsByVendor = {
      'CopyTech Wales': [
        {
          title: 'Why Managed Print Services Save Welsh Businesses Money',
          body: `If your business is still buying toner cartridges from Amazon and calling out engineers ad-hoc, you're almost certainly overspending on print.\n\nManaged Print Services (MPS) bundle everything — toner, drums, parts, labour, and quarterly servicing — into a single, predictable monthly cost. For most of our Cardiff clients, switching to MPS reduces their print costs by 25-40%.\n\nHere's how it works:\n\n1. We audit your current print volume and costs\n2. Right-size your fleet (most offices have too many devices)\n3. Supply a modern MFP with all consumables included\n4. Monitor toner levels remotely and ship replacements automatically\n5. Provide same-day on-site service when something goes wrong\n\nThe result? No surprise bills, no downtime waiting for toner, and a single invoice each quarter.\n\nWe currently have Canon and Ricoh MFPs available from just £45/month all-inclusive for up to 5,000 pages. Get in touch for a free print audit.`,
          category: 'guide',
          tags: ['managed print', 'cardiff', 'cost savings', 'photocopiers'],
        },
        {
          title: 'New Canon imageRUNNER ADVANCE DX Range Now Available',
          body: `We're pleased to announce we now stock the full Canon imageRUNNER ADVANCE DX range, including the C5860i and C5840i models.\n\nThese machines represent Canon's latest generation of A3 colour MFPs, featuring:\n\n- Print speeds up to 60ppm colour and mono\n- Enhanced security with McAfee Embedded Control\n- Cloud-ready with uniFLOW Online integration\n- Energy Star certified with sleep mode under 1W\n- Optional booklet finisher and large capacity trays\n\nWe have demo units available at our Cardiff showroom. Book a visit to see them in action and get a personalised quote based on your volume.\n\nAll machines come with our Premium service contract — 4-hour response time, all toner and parts included.`,
          category: 'product',
          tags: ['canon', 'imagerunner', 'new product', 'a3 mfp'],
        },
        {
          title: 'Spring 2026 Offer: Free Installation on All New Copier Contracts',
          body: `For contracts signed before 30th April 2026, we're waiving our standard £250 installation fee on all new photocopier leases.\n\nThis applies to any machine in our range — from compact A4 devices for small offices to high-volume A3 production MFPs.\n\nWhat's included in our installation:\n- Site survey and network configuration\n- Physical delivery and setup\n- Driver installation on all connected PCs\n- User training session (up to 1 hour)\n- Scan-to-email and scan-to-folder setup\n\nThis offer applies to all postcode areas we cover: CF, NP, SA, and surrounding areas.\n\nContact us on 029 2034 5678 or request a quote through TendorAI.`,
          category: 'offer',
          tags: ['offer', 'free installation', 'spring 2026', 'copier lease'],
        },
      ],
      'Dragon Office Solutions': [
        {
          title: 'Switching from Traditional Phone Lines to VoIP: A Newport Business Guide',
          body: `BT is switching off its traditional PSTN network by 2027. If your Newport business still relies on analogue phone lines, now is the time to plan your switch to VoIP.\n\nHere's what you need to know:\n\n**What changes?**\nYour existing phone lines will stop working. All calls will route over broadband (SIP/VoIP) instead.\n\n**What do you need?**\n- A reliable broadband connection (minimum 10Mbps, ideally FTTP)\n- VoIP handsets or softphone apps\n- A hosted PBX provider (we recommend 3CX)\n\n**What does it cost?**\nTypically £8-15 per user per month, with handsets from £65-95 each. Most businesses find VoIP is cheaper than their old phone bills, especially if you make lots of calls.\n\n**How long does it take?**\nWe can port your existing numbers and have you up and running in 5-10 working days.\n\nWe're offering free VoIP readiness assessments for businesses in the NP postcode area. Call 01633 456 789 to book yours.`,
          category: 'guide',
          tags: ['voip', 'newport', 'pstn switch off', '3cx', 'telecoms'],
        },
        {
          title: 'New Xerox VersaLink Range in Stock',
          body: `We've just taken delivery of the new Xerox VersaLink C7025 and C7030 models.\n\nThese A3 colour MFPs feature Xerox ConnectKey technology, making them cloud-connected from day one. They integrate with Google Drive, OneDrive, Dropbox, and can scan directly to email.\n\nKey specs:\n- 25ppm and 30ppm colour/mono\n- Up to 1200 x 2400 dpi print resolution\n- Standard duplex, DADF, and WiFi\n- Optional 520-sheet tray and booklet finisher\n\nAvailable on 36, 48, or 60-month lease terms. CPC rates from just 0.38p mono.\n\nVisit our Newport showroom or request a demo through TendorAI.`,
          category: 'product',
          tags: ['xerox', 'versalink', 'new stock', 'a3 mfp'],
        },
      ],
      'Severn Business Systems': [
        {
          title: 'Microsoft Teams Calling: Everything Bristol Businesses Need to Know',
          body: `If your business already uses Microsoft Teams for meetings and chat, you might be wondering: can we use it as our phone system too?\n\nThe answer is yes — and we've helped over 50 Bristol businesses make the switch.\n\n**How it works:**\nGamma Horizon provides "direct routing" — connecting Teams to the phone network so you can make and receive regular phone calls through the Teams app.\n\n**Benefits:**\n- One app for calls, meetings, and messages\n- No desk phones needed (use PC, mobile, or Teams-certified handsets)\n- Keep your existing phone numbers\n- Call recording and advanced analytics included\n- Works from anywhere — office, home, or on the road\n\n**What does it cost?**\nFrom £9.50 per user/month for unlimited UK and mobile calls. No handsets to buy if you use softphones.\n\n**Requirements:**\n- Microsoft 365 Business or Enterprise licence\n- Reliable broadband (minimum 100kbps per concurrent call)\n\nWe offer a free Teams telephony consultation for Bristol and South West businesses. Book yours at severnbusiness.example.com or through TendorAI.`,
          category: 'guide',
          tags: ['microsoft teams', 'bristol', 'voip', 'gamma horizon', 'unified communications'],
        },
        {
          title: 'Why Every SME Needs a Managed IT Provider in 2026',
          body: `Cyber attacks on UK SMEs increased by 38% in 2025. If your business relies on one "IT person" or — worse — no dedicated IT support at all, you're exposed.\n\nHere's why managed IT makes sense for businesses with 10-100 employees:\n\n**1. Proactive monitoring prevents downtime**\nWe monitor your servers, endpoints, and network 24/7. Most issues are resolved before you even notice them.\n\n**2. Cybersecurity is non-negotiable**\nEndpoint protection, email filtering, and security awareness training are included as standard. We also help you achieve Cyber Essentials certification.\n\n**3. Predictable costs**\nOne monthly fee per user covers everything — helpdesk, M365 management, backup, and security. No surprise bills.\n\n**4. Strategic IT planning**\nQuarterly reviews align your technology with your business goals. We help you plan upgrades, migrations, and new projects.\n\nOur Managed IT Pro package starts at £42 per user/month with a 4-hour SLA. Contact us for a free IT health check.`,
          category: 'guide',
          tags: ['managed it', 'cybersecurity', 'bristol', 'sme', 'it support'],
        },
        {
          title: 'Severn Business Systems Achieves ISO 27001 Certification',
          body: `We're proud to announce that Severn Business Systems has achieved ISO 27001:2022 certification for our information security management system.\n\nThis internationally recognised standard demonstrates our commitment to protecting client data and maintaining the highest security practices across our managed IT and telecoms operations.\n\nWhat this means for our clients:\n- Independently audited security controls\n- Documented incident response procedures\n- Regular penetration testing and vulnerability assessments\n- Staff security awareness training programme\n- Business continuity and disaster recovery planning\n\nISO 27001 joins our existing Cyber Essentials Plus certification. Together, these accreditations give our clients confidence that their IT infrastructure and communications are managed to the highest security standards.\n\nIf you'd like to learn more about how our security practices protect your business, get in touch.`,
          category: 'news',
          tags: ['iso 27001', 'certification', 'security', 'accreditation'],
        },
      ],
      'SecureView Wales': [
        {
          title: 'IP vs Analogue CCTV: Which Is Right for Your Business?',
          body: `Choosing a CCTV system for your business? The biggest decision is IP vs analogue. Here's a straightforward comparison.\n\n**Analogue (Turbo HD)**\n- Lower upfront cost (cameras from £95)\n- Simpler installation using coaxial cable\n- Good enough for basic monitoring (1080p)\n- Limited smart features\n- Best for: small sites, tight budgets, basic security needs\n\n**IP (Network cameras)**\n- Higher resolution (2K, 4K available)\n- Smart analytics (person detection, line crossing, ANPR)\n- Remote viewing and cloud integration\n- Power over Ethernet (one cable for power + data)\n- Best for: larger sites, warehouses, retail, anywhere needing detailed footage\n\n**Our recommendation:**\nFor most Swansea businesses, a 4-camera IP system is the sweet spot. Our Hikvision 4K systems start at £295 per camera installed, with NVR and remote viewing included.\n\nBook a free site survey to get a tailored recommendation and quote.`,
          category: 'guide',
          tags: ['cctv', 'ip cameras', 'analogue', 'swansea', 'business security'],
        },
        {
          title: 'Cloud CCTV: Monitor Your Business from Anywhere',
          body: `Traditional CCTV records to a box on your premises. Cloud CCTV records to secure data centres — meaning you can view live and recorded footage from your phone, tablet, or PC anywhere in the world.\n\n**Why cloud CCTV?**\n- No NVR box to maintain (or get stolen by burglars)\n- Automatic offsite backup of all footage\n- AI-powered alerts for people, vehicles, and unusual activity\n- Easy to scale — add cameras without replacing hardware\n- Professional monitoring available 24/7\n\n**What does it cost?**\nOur Dahua cloud systems start at £210 per camera plus £5.99/month per camera for cloud storage. Professional monitoring from £29.99/month.\n\n**Who is it for?**\nRetail shops, restaurants, pubs, small warehouses, and multi-site businesses that want peace of mind without the complexity of managing their own recording equipment.\n\nWe cover all SA postcodes and most of South Wales. Contact us for a free consultation.`,
          category: 'product',
          tags: ['cloud cctv', 'dahua', 'remote monitoring', 'swansea', 'business security'],
        },
      ],
      'Valleys Tech': [
        {
          title: 'Valleys Tech Celebrates 20 Years Serving South Wales Businesses',
          body: `This year marks our 20th anniversary! What started as a one-man copier repair business in Merthyr Tydfil has grown into a 56-strong team serving over 400 businesses across South Wales.\n\nA lot has changed since 2005:\n- Our first client (a solicitor in Aberdare) is still with us\n- We've expanded from photocopiers into telecoms, CCTV, and IT support\n- We've moved from our garage to a 5,000 sq ft office and warehouse\n- We now cover CF, NP, SA, and LD postcode areas\n\nWhat hasn't changed is our commitment to honest pricing, local service, and treating every client like our most important one.\n\nTo celebrate, we're offering 20% off installation costs on all new contracts signed during 2026. Use code VALLEYS20 when requesting a quote.\n\nThank you to every client, partner, and team member who has been part of our journey.`,
          category: 'news',
          tags: ['anniversary', 'merthyr tydfil', 'south wales', 'valleys tech'],
        },
        {
          title: 'The Complete Office Technology Checklist for Welsh SMEs',
          body: `Running a business in the Valleys or across South Wales? Here's our checklist of essential office technology — and what you should be paying in 2026.\n\n**Printing & Copying**\n- A3 colour MFP: £45-120/month (lease + all-inclusive service)\n- Average CPC: 0.3-0.5p mono, 3-5p colour\n- Tip: Don't lease a 60ppm machine if you only do 3,000 pages/month\n\n**Phone System**\n- Cloud VoIP: £8-15 per user/month\n- Handsets: £65-95 each (or free with softphones)\n- Tip: Check your broadband speed before switching\n\n**CCTV & Security**\n- 4-camera IP system: £1,200-2,000 installed\n- Cloud monitoring: £25-30/month\n- Tip: 4K is only worth it if you need to read number plates or facial detail\n\n**IT Support**\n- Managed IT: £35-50 per user/month\n- Should include: M365, endpoint protection, helpdesk, backup\n- Tip: Make sure your provider has Cyber Essentials at minimum\n\nNeed help with any of the above? We cover all four categories from our Merthyr Tydfil base. One provider, one invoice, one phone call when something goes wrong.`,
          category: 'guide',
          tags: ['office technology', 'sme', 'pricing guide', 'south wales', 'valleys'],
        },
        {
          title: 'Brother MFC-L9670CDN: Best A4 Colour MFP for Small Teams',
          body: `Not every office needs an A3 machine. If your team is under 15 people and you mainly print A4, the Brother MFC-L9670CDN is hard to beat.\n\n**Why we recommend it:**\n- 40ppm colour and mono — fast enough for any small office\n- Low running costs: 0.3p mono, 3p colour per page\n- Compact footprint — fits on a desk or small stand\n- WiFi, NFC tap-to-print, and secure print as standard\n- Duplex scanning and printing\n\n**What it costs with us:**\n- Machine: £1,650 (or from £42/month on a 60-month lease)\n- All-inclusive service contract: £45/quarter\n- Includes all toner, drums, parts, and labour\n\n**Who is it for?**\nSmall offices, branch locations, home workers who need a reliable colour MFP without the A3 premium. We've installed dozens across the Valleys and Cardiff area.\n\nRequest a demo or quote through TendorAI.`,
          category: 'product',
          tags: ['brother', 'a4 mfp', 'small office', 'colour printer', 'merthyr tydfil'],
        },
      ],
    };

    let totalPosts = 0;

    for (const vendor of demoVendors) {
      const posts = postsByVendor[vendor.company];
      if (!posts) {
        console.log(`  No posts defined for ${vendor.company}, skipping`);
        continue;
      }

      console.log(`Creating posts for ${vendor.company}:`);
      for (const postData of posts) {
        const post = new VendorPost({
          vendor: vendor._id,
          ...postData,
          isDemoVendor: true,
        });
        await post.save();
        console.log(`  + [${postData.category}] ${postData.title.substring(0, 60)}...`);
        totalPosts++;
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════');
    console.log(`  Created ${totalPosts} demo posts for ${demoVendors.length} vendors`);
    console.log('═══════════════════════════════════════════');

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
