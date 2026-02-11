import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const hashedPassword = await bcrypt.hash('TendorAI2026!', 10);

  const vendor = {
    name: 'Blend Telecom',
    company: 'Blend Telecom',
    email: 'unclaimed-blend-telecom@tendorai.com',
    password: hashedPassword,
    services: ['Telecoms'],
    location: {
      city: 'Cardiff',
      region: 'South Wales',
    },
    contactInfo: {
      website: 'https://blendtelecom.co.uk',
    },
    tier: 'free',
    account: {
      status: 'active',
      verificationStatus: 'verified',
    },
    listingStatus: 'unclaimed',
    importedAt: new Date(),
    importSource: 'manual',
  };

  const result = await mongoose.connection.db.collection('vendors').insertOne(vendor);
  console.log('Inserted vendor:', result.insertedId.toString());

  // Verify
  const doc = await mongoose.connection.db.collection('vendors').findOne({ _id: result.insertedId });
  console.log('Verified:', doc.company, '| Services:', doc.services, '| City:', doc.location.city, '| Status:', doc.account.status);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
