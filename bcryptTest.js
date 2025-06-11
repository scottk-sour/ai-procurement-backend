// bcryptTest.js
import bcrypt from 'bcrypt';

const hashed = 'PASTE_HASH_HERE'; // 👈 paste the one just logged
bcrypt.compare('SecurePass123!', hashed).then(result => {
  console.log('✅ Password match:', result);
});
