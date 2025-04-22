import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import VendorProduct from '../models/VendorProduct.js'; // optional future use
import fs from 'fs';
import path from 'path';

/**
 * Handles detailed copier quote requests from users.
 */
export const submitCopierQuoteRequest = async (req, res) => {
  try {
    const data = req.body;

    // Parse invoice file uploads if present (via multer)
    const invoiceFiles = req.files?.invoices || [];
    const invoicePaths = invoiceFiles.map(file => file.path);

    // Optional: Debug matching info (uncomment and set variables if needed)
    // console.log('🧠 Matching with:', {
    //   max_lease_price: data.max_lease_price,
    //   monthlyVolume: data.monthlyVolume,
    //   pagesPerMinuteEstimate: data.pagesPerMinuteEstimate,
    // });
    // console.log('✅ Matched Machines:', matchingMachines.map(m => m.model));

    const copierRequest = new CopierQuoteRequest({
      ...data,
      invoices: invoicePaths,
      userId: req.body.userId, // Ensure this is sent from frontend
      status: 'Pending'
    });

    await copierRequest.save();

    return res.status(201).json({
      message: '✅ Copier quote request submitted successfully.',
      requestId: copierRequest._id
    });
  } catch (error) {
    console.error('❌ Failed to submit copier quote request:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * (Optional) Fetch all copier quote requests for a user.
 */
export const getUserCopierQuotes = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    const quotes = await CopierQuoteRequest.find({ userId }).lean();
    return res.status(200).json({ quotes });
  } catch (error) {
    console.error('❌ Failed to fetch copier quotes:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
