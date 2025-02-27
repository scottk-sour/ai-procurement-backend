import mongoose from 'mongoose';

const MachineSchema = new mongoose.Schema({
  vendorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  model: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    required: true 
  },
  mono_cpc: { 
    type: Number, 
    default: 0 
  },
  color_cpc: { 
    type: Number, 
    default: 0 
  },
  lease_cost: { 
    type: Number, 
    required: true 
  },
  services: { 
    type: String, 
    default: 'Photocopiers' 
  },
  provider: { 
    type: String, 
    default: '' 
  }
});

export default mongoose.model('Machine', MachineSchema);
