import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import VendorProduct from '../models/VendorProduct.js';
import Vendor from '../models/Vendor.js';
import { getVendorRecommendations } from '../services/VendorRecommendationService.js';
import FileParser from '../utils/fileProcessor.js';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

/**
 * Handles detailed copier quotation requests from users.
 */
export const submitCopierQuoteRequest = async (req, res) => {
  try {
    const data = req.body;

    const invoiceFiles = req.files?.invoices || [];
    const invoicePaths = invoiceFiles.map(file => file.path);

    const copierRequest = new CopierQuoteRequest({
      ...data,
      invoices: invoicePaths,
      userId: req.body.userId,
      status: 'Pending'
    });

    await copierRequest.save();

    const matchedVendors = await VendorRecommendationService.findBestMatches(copierRequest, invoicePaths);

    copierRequest.matchedVendors = matchedVendors.map(vendor => ({
      vendorId: vendor.vendorId,
      score: vendor.score
    }));

    copierRequest.status = 'Matched';
    await copierRequest.save();

    await notifyMatchedVendors(matchedVendors, copierRequest);

    return res.status(201).json({
      message: '✅ Copier quotation request submitted successfully.',
      requestId: copierRequest._id,
      matchedVendors
    });
  } catch (error) {
    console.error('❌ Failed to submit copier quotation request:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * Get matched vendors for a specific quotation request
 */
export const getMatchedVendors = async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({ message: 'Missing requestId' });
    }

    const quoteRequest = await CopierQuoteRequest.findById(requestId);

    if (!quoteRequest) {
      return res.status(404).json({ message: 'Quotation request not found' });
    }

    if (!quoteRequest.matchedVendors || quoteRequest.matchedVendors.length === 0) {
      const matchedVendors = await VendorRecommendationService.findBestMatches(quoteRequest, quoteRequest.invoices);

      quoteRequest.matchedVendors = matchedVendors.map(vendor => ({
        vendorId: vendor.vendorId,
        score: vendor.score
      }));

      quoteRequest.status = 'Matched';
      await quoteRequest.save();

      await notifyMatchedVendors(matchedVendors, quoteRequest);

      return res.status(200).json({ matchedVendors });
    }

    const vendorIds = quoteRequest.matchedVendors.map(s => s.vendorId);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } });
    const vendorProducts = await VendorProduct.find({ vendorId: { $in: vendorIds } });

    const detailedMatches = quoteRequest.matchedVendors.map(match => {
      const vendor = vendors.find(s => s._id.toString() === match.vendorId.toString());
      const products = vendorProducts.filter(p => p.vendorId.toString() === match.vendorId.toString());

      const bestProduct = products.length > 0 ? products[0] : null;

      return {
        vendorId: match.vendorId,
        vendorName: vendor ? vendor.name : 'Unknown Vendor',
        score: match.score,
        product: bestProduct ? {
          manufacturer: bestProduct.manufacturer,
          model: bestProduct.model,
          speed: bestProduct.speed,
          description: bestProduct.description,
          totalMachineCost: bestProduct.totalMachineCost,
          costPerCopy: bestProduct.costPerCopy
        } : null
      };
    });

    return res.status(200).json({ matchedVendors: detailedMatches });
  } catch (error) {
    console.error('❌ Failed to get matched vendors:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * Fetch all copier quotation requests for a user.
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
    console.error('❌ Failed to fetch copier quotations:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * Get vendor quotation requests
 */
export const getVendorQuoteRequests = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ message: 'Missing vendorId' });
    }

    const quoteRequests = await CopierQuoteRequest.find({
      'matchedVendors.vendorId': vendorId
    }).lean();

    return res.status(200).json({ quoteRequests });
  } catch (error) {
    console.error('❌ Failed to fetch vendor quotation requests:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * Update quotation request status
 */
export const updateQuoteStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    if (!requestId || !status) {
      return res.status(400).json({ message: 'Missing requestId or status' });
    }

    const validStatuses = ['Pending', 'Matched', 'Accepted', 'Declined', 'Completed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updatedQuote = await CopierQuoteRequest.findByIdAndUpdate(
      requestId,
      { status },
      { new: true }
    );

    if (!updatedQuote) {
      return res.status(404).json({ message: 'Quotation request not found' });
    }

    return res.status(200).json({
      message: 'Quotation status updated successfully',
      quote: updatedQuote
    });
  } catch (error) {
    console.error('❌ Failed to update quotation status:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

/**
 * Notify matched vendors about new quotation request
 */
const notifyMatchedVendors = async (matchedVendors, quoteRequest) => {
  try {
    console.log('🔔 Notifying matched vendors:');

    for (const vendor of matchedVendors) {
      console.log(`📧 Email notification to: ${vendor.vendorName}`);
      console.log(`Subject: New Quotation Request Matched - ${quoteRequest.companyName}`);
      console.log(`Body: You have been matched with a new quotation request from ${quoteRequest.companyName}. Please log in to your dashboard to view the details.`);

      // Placeholder email logic (disabled by default)
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to notify vendors:', error.message);
    return false;
  }
};

/**
 * Initialise the Vendor Recommendation Service
 */
export const initialiseVendorMatching = async () => {
  try {
    await VendorRecommendationService.loadVendorProductsFromCSV();
    console.log('✅ Vendor Recommendation Service initialised successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialise Vendor Recommendation Service:', error.message);
    return false;
  }
};

initialiseVendorMatching().catch(console.error);
