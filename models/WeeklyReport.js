import mongoose from 'mongoose';

const weeklyReportSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true,
  },
  weekStarting: { type: Date, required: true, index: true },
  weekEnding: { type: Date, required: true },
  digest: { type: mongoose.Schema.Types.Mixed, required: true },
  generatedAt: { type: Date, default: Date.now },
  cronVersion: { type: String, default: 'v1' },
}, { timestamps: true });

weeklyReportSchema.index({ vendorId: 1, weekStarting: 1 }, { unique: true });
weeklyReportSchema.index({ vendorId: 1, weekStarting: -1 });
weeklyReportSchema.index({ weekStarting: -1 });

weeklyReportSchema.statics.findOrCreate = async function (vendorId, weekStarting, digest) {
  const existing = await this.findOne({ vendorId, weekStarting });
  if (existing) return existing;

  try {
    return await this.create({
      vendorId,
      weekStarting,
      weekEnding: digest.weekEnding,
      digest,
      generatedAt: digest.generatedAt || new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return await this.findOne({ vendorId, weekStarting });
    }
    throw err;
  }
};

weeklyReportSchema.methods.toClientJSON = function () {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    vendorId: obj.vendorId.toString(),
    weekStarting: obj.weekStarting.toISOString(),
    weekEnding: obj.weekEnding.toISOString(),
    digest: obj.digest,
    generatedAt: obj.generatedAt.toISOString(),
    cronVersion: obj.cronVersion,
    createdAt: obj.createdAt?.toISOString() || null,
    updatedAt: obj.updatedAt?.toISOString() || null,
  };
};

export default mongoose.model('WeeklyReport', weeklyReportSchema);
