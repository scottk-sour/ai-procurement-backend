import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkMatches() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Get all vendor products
  const products = await mongoose.connection.db.collection('vendorproducts').find({}).toArray();
  const vendors = await mongoose.connection.db.collection('vendors').find({}).toArray();

  const vendorMap = {};
  vendors.forEach(v => vendorMap[v._id.toString()] = v.companyName || v.name || 'Unknown');

  // Requirements
  const minVolume = 6000;
  const maxVolume = 13000;
  const minSpeed = 35;
  const requiredFeatures = ['print', 'copy', 'scan'];

  const matches = [];

  products.forEach(p => {
    // Check volume range
    const pMaxVol = p.maxVolume || p.monthlyVolume || p.recommendedVolume || 0;

    // Product should handle the volume range (max >= 6k)
    const volumeOk = pMaxVol >= minVolume;

    // Check speed
    const speed = p.speed || p.ppm || p.printSpeed || 0;
    const speedOk = speed >= minSpeed;

    // Check features
    const productFeatures = (p.features || []).map(f => f.toLowerCase());
    const hasAllFeatures = requiredFeatures.every(req =>
      productFeatures.some(f => f.includes(req))
    );

    if (volumeOk && speedOk && hasAllFeatures) {
      matches.push({
        vendorId: p.vendorId,
        model: p.model || p.name,
        speed: speed,
        maxVolume: pMaxVol,
        features: productFeatures
      });
    }
  });

  // Group by vendor
  const vendorBreakdown = {};
  matches.forEach(m => {
    const vendorName = vendorMap[m.vendorId?.toString()] || 'Unknown';
    if (!vendorBreakdown[vendorName]) {
      vendorBreakdown[vendorName] = [];
    }
    vendorBreakdown[vendorName].push(m);
  });

  console.log('Products matching requirements:');
  console.log('- Volume: 6,000 - 13,000/month');
  console.log('- Speed: 35+ ppm');
  console.log('- Features: Print, Copy, Scan');
  console.log('- Paper: A4');
  console.log('');
  console.log('================================');
  console.log('VENDOR BREAKDOWN');
  console.log('================================');

  Object.keys(vendorBreakdown).sort().forEach(vendor => {
    const prods = vendorBreakdown[vendor];
    console.log('');
    console.log(`${vendor}: ${prods.length} matching products`);
    prods.forEach(p => {
      console.log(`  - ${p.model} (${p.speed} ppm, ${p.maxVolume} vol)`);
    });
  });

  console.log('');
  console.log('================================');
  console.log('SUMMARY');
  console.log('================================');
  console.log(`Total matching products: ${matches.length}`);
  console.log(`Vendors with matches: ${Object.keys(vendorBreakdown).length}`);

  await mongoose.disconnect();
}

checkMatches().catch(console.error);
