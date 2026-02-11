import mongoose from 'mongoose';

const locationContentSchema = new mongoose.Schema({
  category: { type: String, required: true, index: true },
  location: { type: String, required: true, index: true },
  slug: { type: String, required: true },
  content: { type: String, required: true },
  wordCount: { type: Number },
  generatedAt: { type: Date, default: Date.now },
  model: { type: String, default: 'gpt-4o-mini' },
}, {
  timestamps: true,
});

locationContentSchema.index({ category: 1, location: 1 }, { unique: true });

const LocationContent = mongoose.model('LocationContent', locationContentSchema);

export default LocationContent;
