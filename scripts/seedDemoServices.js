import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Vendor from '../models/Vendor.js';
import VendorProduct from '../models/VendorProduct.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find demo vendors
  const dragon = await Vendor.findOne({ email: 'demo-dragon@tendorai.com' });
  const secureview = await Vendor.findOne({ email: 'demo-secureview@tendorai.com' });

  if (!dragon) {
    console.error('Dragon Law vendor not found');
    process.exit(1);
  }
  if (!secureview) {
    console.error('SecureView vendor not found');
    process.exit(1);
  }

  console.log(`Dragon Law: ${dragon._id} (${dragon.company})`);
  console.log(`SecureView: ${secureview._id} (${secureview.company})`);

  // Delete old products for both vendors
  const deleted = await VendorProduct.deleteMany({
    vendorId: { $in: [dragon._id, secureview._id] },
  });
  console.log(`Deleted ${deleted.deletedCount} old products`);

  // Insert solicitor services for Dragon Law
  const solicitorServices = [
    {
      vendorId: dragon._id,
      serviceCategory: 'Solicitor',
      manufacturer: 'Dragon Law Solicitors',
      model: 'Residential Conveyancing',
      description: 'Full conveyancing service for buying and selling residential property in South Wales',
      category: 'Conveyancing',
      status: 'active',
      solicitorPricing: {
        practiceArea: 'Conveyancing',
        serviceName: 'Residential Conveyancing',
        feeType: 'fixed',
        feeAmount: 895,
        turnaroundTime: '6-8 weeks',
      },
    },
    {
      vendorId: dragon._id,
      serviceCategory: 'Solicitor',
      manufacturer: 'Dragon Law Solicitors',
      model: 'Divorce Proceedings',
      description: 'Contested and uncontested divorce proceedings including financial settlements',
      category: 'Family Law',
      status: 'active',
      solicitorPricing: {
        practiceArea: 'Family Law',
        serviceName: 'Divorce Proceedings',
        feeType: 'from',
        feeAmount: 750,
        turnaroundTime: 'varies',
      },
    },
    {
      vendorId: dragon._id,
      serviceCategory: 'Solicitor',
      manufacturer: 'Dragon Law Solicitors',
      model: 'Single Will',
      description: 'Drafting of a single will including consultation',
      category: 'Wills & Probate',
      status: 'active',
      solicitorPricing: {
        practiceArea: 'Wills & Probate',
        serviceName: 'Single Will',
        feeType: 'fixed',
        feeAmount: 250,
        turnaroundTime: '1-2 weeks',
      },
    },
  ];

  // Insert accountant services for SecureView
  const accountantServices = [
    {
      vendorId: secureview._id,
      serviceCategory: 'Accountant',
      manufacturer: 'SecureView Accountants',
      model: 'Self-Assessment Tax Return',
      category: 'Tax Returns',
      status: 'active',
      accountantPricing: {
        serviceCategory: 'Tax Returns',
        serviceName: 'Self-Assessment Tax Return',
        feeType: 'fixed',
        feeAmount: 250,
      },
    },
    {
      vendorId: secureview._id,
      serviceCategory: 'Accountant',
      manufacturer: 'SecureView Accountants',
      model: 'Monthly Bookkeeping',
      category: 'Bookkeeping',
      status: 'active',
      accountantPricing: {
        serviceCategory: 'Bookkeeping',
        serviceName: 'Monthly Bookkeeping',
        feeType: 'monthly-retainer',
        feeAmount: 150,
      },
    },
    {
      vendorId: secureview._id,
      serviceCategory: 'Accountant',
      manufacturer: 'SecureView Accountants',
      model: 'Quarterly VAT Returns',
      category: 'VAT Returns',
      status: 'active',
      accountantPricing: {
        serviceCategory: 'VAT Returns',
        serviceName: 'Quarterly VAT Returns',
        feeType: 'per-transaction',
        feeAmount: 95,
      },
    },
  ];

  const inserted = await VendorProduct.insertMany([...solicitorServices, ...accountantServices]);
  console.log(`Inserted ${inserted.length} services`);

  // Update vendor services field
  await Vendor.updateOne({ _id: dragon._id }, { $set: { services: ['Solicitors'] } });
  await Vendor.updateOne({ _id: secureview._id }, { $set: { services: ['Accountants'] } });
  console.log('Updated vendor services fields');

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(console.error);
