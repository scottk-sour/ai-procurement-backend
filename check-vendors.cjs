const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Product = require('./models/Product');
  const Vendor = require('./models/Vendor');
  
  const vendors = await Vendor.find({}).select('name email');
  const products = await Product.aggregate([
    { $group: { _id: '$vendorId', count: { $sum: 1 } } }
  ]);
  
  console.log('Vendors:', vendors.length);
  vendors.forEach(v => console.log(' -', v.name, v.email));
  console.log('\nProducts per vendor:');
  products.forEach(p => console.log(' -', p._id, ':', p.count, 'products'));
  
  process.exit(0);
});
