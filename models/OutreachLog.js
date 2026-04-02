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

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  note: { type: String, default: '' },
  subject: { type: String },
  body: { type: String },
  date: { type: Date, default: Date.now },
  completedBy: { type: String, default: 'admin' },
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
  website: { type: String, default: '' },
  reportLink: { type: String, default: '' },
  reportCategory: { type: String, default: '', index: true },
  reportCity: { type: String, default: '', index: true },
  reportScore: { type: Number, default: 0 },
  vendorType: {
    type: String,
    enum: ['solicitor', 'accountant', 'mortgage-adviser', 'estate-agent', 'office-equipment', ''],
    default: '',
  },
  aeoReportUrl: { type: String, default: '' },
  aeoRunAt: { type: Date },
  status: {
    type: String,
    enum: [
      'new', 'prospect', 'aeo_sent', 'email_sent', 'email-sent', 'opened',
      'called', 'call-back', 'email_followup_sent', 'called_followup',
      'interested', 'meeting_booked', 'signed-up', 'won',
      'not-interested', 'lost', 'no_response',
    ],
    default: 'prospect',
    index: true,
  },
  nextActionDate: { type: Date, index: true },
  nextAction: {
    type: String,
    enum: ['run_aeo', 'send_aeo', 'send_email', 'call', 'send_followup', 'call_followup', 'none', ''],
    default: 'run_aeo',
  },
  emailSentAt: { type: Date },
  emailOpenedAt: { type: Date },
  lastCalledAt: { type: Date },
  email1SentAt: { type: Date, default: null },
  email2SentAt: { type: Date, default: null },
  notes: [noteSchema],
  callHistory: [callHistorySchema],
  history: [historySchema],
}, { timestamps: true });

outreachLogSchema.index({ status: 1, nextActionDate: 1 });

export default mongoose.model('OutreachLog', outreachLogSchema);
