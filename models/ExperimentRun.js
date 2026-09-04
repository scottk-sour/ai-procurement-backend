import mongoose from 'mongoose';

const experimentRunSchema = new mongoose.Schema({
  study: { type: String, required: true, index: true },
  wave: { type: Number, required: true },
  promptId: { type: String, required: true },
  promptText: { type: String, required: true },
  platform: { type: String, required: true, enum: ['perplexity', 'chatgpt', 'gemini'] },
  modelVersion: { type: String, required: true },
  modelParams: { type: mongoose.Schema.Types.Mixed },
  responseText: { type: String },
  citedUrls: [String],
  // Raw API response, captured verbatim. Written ONLY on the Perplexity path and
  // ONLY for wave >= 2 (see scripts/experiments/runExperimentScan.js). Mixed, no
  // default, not indexed. Absent on wave-1 documents and on the ChatGPT/Gemini
  // paths, so those documents' field sets are unchanged by this addition.
  rawResponse: { type: mongoose.Schema.Types.Mixed },
  targets: [{
    url: { type: String, required: true },
    group: { type: String, enum: ['treatment', 'control'], required: true },
    cited: { type: Boolean, default: false },
    mentioned: { type: Boolean, default: false },
    entityName: { type: String },
  }],
  status: { type: String, enum: ['ok', 'error'], default: 'ok' },
  error: { type: String, default: null },
  runAt: { type: Date, default: Date.now },
}, { timestamps: false });

experimentRunSchema.index({ study: 1, wave: 1, promptId: 1, platform: 1 });
experimentRunSchema.index({ study: 1, wave: 1, platform: 1, 'targets.group': 1 });

export default mongoose.model('ExperimentRun', experimentRunSchema, 'experiment_runs');
