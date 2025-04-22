import mongoose from "mongoose";

const quoteRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    serviceType: { type: String, required: true },
    companyName: { type: String, required: true },
    industryType: { type: String, required: true },
    numEmployees: { type: Number, required: true },
    numOfficeLocations: { type: Number, required: true },
    multipleFloors: { type: Boolean, default: false },
    colour: { type: String, required: true },
    min_speed: { type: Number, required: true },
    max_lease_price: { type: Number, required: true },
    required_functions: { type: [String], required: true },
    additional_notes: { type: String },
    monthlyVolume: {
      mono: { type: Number, required: true },
      colour: { type: Number, required: true }
    },
    status: { type: String, default: "Pending" },
    preferredVendor: { type: String },
  },
  { timestamps: true }
);

const QuoteRequest = mongoose.model("QuoteRequest", quoteRequestSchema);
export default QuoteRequest;
