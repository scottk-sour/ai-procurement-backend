import mongoose from 'mongoose';
import crypto from 'crypto';

const ENCRYPT_KEY = process.env.SCHEMA_ENCRYPT_KEY; // 32-byte hex string (64 chars)

export function encrypt(text) {
  if (!text) return text;
  if (!ENCRYPT_KEY) throw new Error('SCHEMA_ENCRYPT_KEY not configured');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encrypted) {
  if (!encrypted) return encrypted;
  if (!ENCRYPT_KEY) throw new Error('SCHEMA_ENCRYPT_KEY not configured');
  const [ivHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const schemaInstallRequestSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    websiteUrl: { type: String, required: true },
    cmsPlatform: {
      type: String,
      enum: ['wordpress', 'wix', 'squarespace', 'shopify', 'custom', 'other'],
      required: true,
    },
    cmsLoginUrl: { type: String },
    cmsUsername: { type: String },
    cmsPassword: { type: String },
    additionalNotes: { type: String },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    adminNotes: { type: String },
    completedAt: { type: Date },
    completedBy: { type: String },
  },
  { timestamps: true }
);

// Pre-save hook to encrypt credentials
schemaInstallRequestSchema.pre('save', function (next) {
  if (this.isModified('cmsUsername') && this.cmsUsername && !this.cmsUsername.includes(':')) {
    this.cmsUsername = encrypt(this.cmsUsername);
  }
  if (this.isModified('cmsPassword') && this.cmsPassword && !this.cmsPassword.includes(':')) {
    this.cmsPassword = encrypt(this.cmsPassword);
  }
  next();
});

const SchemaInstallRequest = mongoose.model('SchemaInstallRequest', schemaInstallRequestSchema);
export default SchemaInstallRequest;
