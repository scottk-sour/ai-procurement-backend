import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const callHistorySchema = new mongoose.Schema({
  calledAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  outcome: {
    type: String,
    enum: ['called', 'call-back', 'interested', 'signed-up', 'not-interested'],
    default: 'called',
  },
  nextActionDate: { type: Date },
}, { _id: false });

const outreachLogSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    index: true,
  },
  firmName: { type: String, required: true },
  contactName: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  reportLink: { type: String, default: '' },
  reportCategory: { type: String, default: '', index: true },
  reportCity: { type: String, default: '', index: true },
  reportScore: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['new', 'email-sent', 'opened', 'called', 'call-back', 'interested', 'signed-up', 'not-interested'],
    default: 'new',
    index: true,
  },
  nextActionDate: { type: Date, index: true },
  nextAction: { type: String, default: '' },
  emailSentAt: { type: Date },
  emailOpenedAt: { type: Date },
  lastCalledAt: { type: Date },
  notes: [noteSchema],
  callHistory: [callHistorySchema],
}, { timestamps: true });

outreachLogSchema.index({ status: 1, nextActionDate: 1 });

export default mongoose.model('OutreachLog', outreachLogSchema);
