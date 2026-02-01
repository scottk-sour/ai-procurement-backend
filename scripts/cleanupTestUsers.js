/**
 * Cleanup Test Users Script
 * Deletes test/debug user accounts while preserving real users
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const deleteEmailPatterns = [
  /@test\.com$/i,
  /@me\.com$/i,
  /@a\.com$/i,
  /@b\.com$/i,
  /@c\.com$/i,
  /@d\.com$/i,
  /@u\.com$/i,
  /@x\.com$/i,
  /@y\.com$/i,
  /@m\.com$/i,
  /@1\.com$/i,
  /@example\.com$/i,
  /@tes\.com$/i,
  /@123456\.com$/i,
  /^test@/i
];

const keepEmailPatterns = [
  /@gmail\.com$/i,
  /@icloud\.com$/i,
  /@ascari-office\.co\.uk$/i,
  /@clf\.uk$/i,
  /@tendorai\.com$/i
];

async function deleteTestUsers() {
  await mongoose.connect(process.env.MONGODB_URI);

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const users = await User.find({}, { _id: 1, email: 1, name: 1 });

  let deleted = 0;

  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    const isRealEmail = keepEmailPatterns.some(p => p.test(email));
    const isTestEmail = deleteEmailPatterns.some(p => p.test(email));

    if (!isRealEmail && isTestEmail) {
      await User.findByIdAndDelete(u._id);
      console.log('✗ DELETED:', u.email, '|', u.name);
      deleted++;
    }
  }

  const remaining = await User.countDocuments();
  console.log('');
  console.log('Deleted:', deleted, 'test users');
  console.log('Remaining:', remaining, 'users');

  await mongoose.disconnect();
}

deleteTestUsers().catch(console.error);
