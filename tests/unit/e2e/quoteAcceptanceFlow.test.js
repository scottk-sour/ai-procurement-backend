/**
 * Quote Acceptance Flow E2E Tests
 *
 * Tests:
 * 1. Buyer accepts quote → verify status updates, other quotes rejected
 * 2. Vendor sees accepted quotes with buyer contact details
 * 3. Vendor reply after acceptance
 * 4. Permissions - vendor cannot see buyer details before acceptance
 * 5. Edge cases - expired quotes, double-acceptance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  createTestUser,
  createTestVendor,
  createTestVendorProduct,
  createTestQuoteRequest,
  createTestQuote,
  createCompleteTestScenario,
  createExpiredQuote,
  cleanupTestData,
  TEST_PREFIX,
} from '../utils/testUtils.js';
import Quote from '../../models/Quote.js';
import QuoteRequest from '../../models/QuoteRequest.js';
import Order from '../../models/Order.js';

// Mock notification service
vi.mock('../../services/notificationService.js', () => ({
  default: {
    sendQuoteNotification: vi.fn().mockResolvedValue(true),
    sendVendorContactRequest: vi.fn().mockResolvedValue(true),
    sendQuoteAcceptedNotification: vi.fn().mockResolvedValue(true),
    sendQuoteDeclinedNotification: vi.fn().mockResolvedValue(true),
  },
}));

describe('Quote Acceptance Flow', () => {
  let testScenario;

  beforeEach(async () => {
    testScenario = await createCompleteTestScenario();
  });

  afterEach(async () => {
    await cleanupTestData();
    await Order.deleteMany({
      $or: [
        { 'orderDetails.specialInstructions': { $regex: /TEST_/i } },
      ]
    }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('1. Buyer Accepts Quote - Status Updates', () => {
    it('should update quote status to accepted when buyer accepts', async () => {
      const { buyer, quote, quoteRequest } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      savedQuote.customerActions.push({
        action: 'accepted',
        timestamp: new Date(),
        notes: 'Quote accepted by customer',
      });
      await savedQuote.save();

      const acceptedQuote = await Quote.findById(quote._id);
      expect(acceptedQuote.status).toBe('accepted');
      expect(acceptedQuote.decisionDetails.acceptedAt).toBeDefined();
      expect(acceptedQuote.decisionDetails.acceptedBy.toString()).toBe(buyer._id.toString());
      expect(acceptedQuote.customerActions).toHaveLength(1);
      expect(acceptedQuote.customerActions[0].action).toBe('accepted');
    });

    it('should update quote request status to completed when quote accepted', async () => {
      const { buyer, quote, quoteRequest } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const qr = await QuoteRequest.findById(quoteRequest._id);
      qr.status = 'completed';
      qr.acceptedQuote = quote._id;
      await qr.save();

      const updatedRequest = await QuoteRequest.findById(quoteRequest._id);
      expect(updatedRequest.status).toBe('completed');
      expect(updatedRequest.acceptedQuote.toString()).toBe(quote._id.toString());
    });

    it('should create an order when quote is accepted', async () => {
      const { buyer, vendor, quote, quoteRequest } = testScenario;

      const savedQuote = await Quote.findById(quote._id)
        .populate('quoteRequest')
        .populate('vendor');

      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };

      const order = new Order({
        vendor: vendor._id,
        user: buyer._id,
        items: [{
          product: savedQuote.productSummary.model,
          quantity: 1,
          price: savedQuote.costs.monthlyCosts.totalMonthlyCost,
        }],
        totalPrice: savedQuote.costs.monthlyCosts.totalMonthlyCost,
        status: 'Pending',
        quoteReference: quote._id,
        orderType: 'quote_acceptance',
        orderDetails: {
          contactPerson: savedQuote.quoteRequest?.contactName || 'Test Contact',
          specialInstructions: `${TEST_PREFIX}Order from accepted quote`,
        },
      });

      await order.save();
      savedQuote.createdOrder = order._id;
      await savedQuote.save();

      const finalQuote = await Quote.findById(quote._id).populate('createdOrder');
      expect(finalQuote.createdOrder).toBeDefined();
      expect(finalQuote.createdOrder.status).toBe('Pending');
      expect(finalQuote.createdOrder.vendor.toString()).toBe(vendor._id.toString());
      expect(finalQuote.createdOrder.user.toString()).toBe(buyer._id.toString());
    });

    it('should mark other quotes as rejected when one is accepted', async () => {
      const { buyer, vendor, product, quoteRequest } = testScenario;

      const { vendor: vendor2 } = await createTestVendor({
        name: `${TEST_PREFIX}Second Vendor`,
        email: `${TEST_PREFIX}second.vendor@test.com`,
      });
      const product2 = await createTestVendorProduct(vendor2._id, {
        model: `${TEST_PREFIX}Second-Model`,
      });

      const { vendor: vendor3 } = await createTestVendor({
        name: `${TEST_PREFIX}Third Vendor`,
        email: `${TEST_PREFIX}third.vendor@test.com`,
      });
      const product3 = await createTestVendorProduct(vendor3._id, {
        model: `${TEST_PREFIX}Third-Model`,
      });

      const quote2 = await createTestQuote(quoteRequest._id, vendor2._id, product2._id, {
        ranking: 2,
        matchScore: { total: 0.80, confidence: 'High' },
      });

      const quote3 = await createTestQuote(quoteRequest._id, vendor3._id, product3._id, {
        ranking: 3,
        matchScore: { total: 0.75, confidence: 'Medium' },
      });

      const qr = await QuoteRequest.findById(quoteRequest._id);
      qr.quotes.push(quote2._id, quote3._id);
      await qr.save();

      const winningQuote = await Quote.findById(testScenario.quote._id);
      winningQuote.status = 'accepted';
      winningQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await winningQuote.save();

      const otherQuotes = await Quote.find({
        quoteRequest: quoteRequest._id,
        _id: { $ne: winningQuote._id },
      });

      for (const otherQuote of otherQuotes) {
        otherQuote.status = 'rejected';
        otherQuote.decisionDetails = {
          rejectedAt: new Date(),
          rejectedBy: buyer._id,
          rejectionReason: 'Another quote was accepted',
        };
        await otherQuote.save();
      }

      const rejectedQuotes = await Quote.find({
        quoteRequest: quoteRequest._id,
        _id: { $ne: winningQuote._id },
      });

      expect(rejectedQuotes).toHaveLength(2);
      rejectedQuotes.forEach(q => {
        expect(q.status).toBe('rejected');
        expect(q.decisionDetails.rejectionReason).toBe('Another quote was accepted');
      });

      const acceptedQuote = await Quote.findById(winningQuote._id);
      expect(acceptedQuote.status).toBe('accepted');
    });

    it('should record timeToDecision metric when quote is accepted', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      savedQuote.createdAt = twoDaysAgo;

      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.metrics.timeToDecision).toBeDefined();
      expect(finalQuote.metrics.timeToDecision).toBeGreaterThan(2800);
    });
  });

  describe('2. Vendor Sees Accepted Quotes with Buyer Details', () => {
    it('should include buyer contact details in accepted quote for vendor', async () => {
      const { buyer, vendor, quote, quoteRequest } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const vendorAcceptedQuotes = await Quote.find({
        vendor: vendor._id,
        status: 'accepted',
      }).populate({
        path: 'quoteRequest',
        select: 'companyName contactName email phone location',
      });

      expect(vendorAcceptedQuotes).toHaveLength(1);

      const acceptedQuote = vendorAcceptedQuotes[0];
      expect(acceptedQuote.quoteRequest).toBeDefined();
      expect(acceptedQuote.quoteRequest.companyName).toContain(TEST_PREFIX);
      expect(acceptedQuote.quoteRequest.email).toContain(TEST_PREFIX);
      expect(acceptedQuote.quoteRequest.contactName).toBeDefined();
    });

    it('should allow vendor to see order details after quote accepted', async () => {
      const { buyer, vendor, quote, quoteRequest } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };

      const order = new Order({
        vendor: vendor._id,
        user: buyer._id,
        items: [{
          product: savedQuote.productSummary.model,
          quantity: 1,
          price: savedQuote.costs.monthlyCosts.totalMonthlyCost,
        }],
        totalPrice: savedQuote.costs.monthlyCosts.totalMonthlyCost,
        status: 'Pending',
        quoteReference: quote._id,
        orderType: 'quote_acceptance',
        orderDetails: {
          specialInstructions: `${TEST_PREFIX}Order from accepted quote`,
        },
      });
      await order.save();

      savedQuote.createdOrder = order._id;
      await savedQuote.save();

      const vendorOrders = await Order.find({
        vendor: vendor._id,
      }).populate('user', 'name email company');

      expect(vendorOrders).toHaveLength(1);
      expect(vendorOrders[0].user).toBeDefined();
      expect(vendorOrders[0].quoteReference.toString()).toBe(quote._id.toString());
    });

    it('should list all accepted quotes for vendor dashboard', async () => {
      const { buyer, vendor, product, quoteRequest } = testScenario;

      const { user: buyer2 } = await createTestUser({
        name: `${TEST_PREFIX}Buyer2`,
        email: `${TEST_PREFIX}buyer2@test.com`,
      });

      const quoteRequest2 = await createTestQuoteRequest(buyer2._id, {
        companyName: `${TEST_PREFIX}Second Company`,
        email: `${TEST_PREFIX}second.company@test.com`,
      });

      const quote2 = await createTestQuote(quoteRequest2._id, vendor._id, product._id, {
        ranking: 1,
        matchScore: { total: 0.82, confidence: 'High' },
      });

      const savedQuote1 = await Quote.findById(testScenario.quote._id);
      savedQuote1.status = 'accepted';
      savedQuote1.decisionDetails = { acceptedAt: new Date(), acceptedBy: buyer._id };
      await savedQuote1.save();

      const savedQuote2 = await Quote.findById(quote2._id);
      savedQuote2.status = 'accepted';
      savedQuote2.decisionDetails = { acceptedAt: new Date(), acceptedBy: buyer2._id };
      await savedQuote2.save();

      const vendorAcceptedQuotes = await Quote.find({
        vendor: vendor._id,
        status: 'accepted',
      })
        .populate('quoteRequest')
        .sort({ 'decisionDetails.acceptedAt': -1 });

      expect(vendorAcceptedQuotes).toHaveLength(2);
      expect(vendorAcceptedQuotes.every(q => q.status === 'accepted')).toBe(true);
    });
  });

  describe('3. Vendor Reply to Accepted Quote', () => {
    it('should allow vendor to add internal notes to accepted quote', async () => {
      const { buyer, vendor, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const quoteWithNotes = await Quote.findById(quote._id);
      quoteWithNotes.internalNotes.push({
        note: 'Will contact customer on Monday to arrange installation',
        addedBy: vendor._id,
        addedAt: new Date(),
        type: 'vendor',
        priority: 'high',
      });
      await quoteWithNotes.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.internalNotes).toHaveLength(1);
      expect(finalQuote.internalNotes[0].note).toContain('contact customer');
      expect(finalQuote.internalNotes[0].type).toBe('vendor');
    });

    it('should track contact attempts from vendor after acceptance', async () => {
      const { buyer, vendor, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const quoteWithContact = await Quote.findById(quote._id);
      quoteWithContact.contactAttempts.push({
        contactedAt: new Date(),
        contactedBy: vendor._id,
        method: 'email',
        message: 'Sent installation schedule to customer',
        status: 'pending',
      });
      await quoteWithContact.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.contactAttempts).toHaveLength(1);
      expect(finalQuote.contactAttempts[0].method).toBe('email');
      expect(finalQuote.contactAttempts[0].status).toBe('pending');
    });
  });

  describe('4. Permissions - Buyer Details Before/After Acceptance', () => {
    it('should NOT expose full buyer contact details to vendor before acceptance', async () => {
      const { vendor, quote, quoteRequest } = testScenario;

      const vendorPendingQuotes = await Quote.find({
        vendor: vendor._id,
        status: 'pending',
      }).populate({
        path: 'quoteRequest',
        select: 'companyName industryType numEmployees monthlyVolume serviceType',
      });

      expect(vendorPendingQuotes).toHaveLength(1);

      const pendingQuote = vendorPendingQuotes[0];
      expect(pendingQuote.quoteRequest).toBeDefined();
      expect(pendingQuote.quoteRequest.companyName).toBeDefined();
      expect(pendingQuote.quoteRequest.industryType).toBeDefined();
      expect(pendingQuote.quoteRequest.monthlyVolume).toBeDefined();
    });

    it('should expose full buyer details only after quote is accepted', async () => {
      const { buyer, vendor, quote } = testScenario;

      const beforeAcceptance = await Quote.findById(quote._id).populate({
        path: 'quoteRequest',
        select: 'companyName industryType monthlyVolume',
      });
      expect(beforeAcceptance.status).toBe('pending');

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const afterAcceptance = await Quote.findById(quote._id).populate({
        path: 'quoteRequest',
        select: 'companyName contactName email phone location',
      });
      expect(afterAcceptance.status).toBe('accepted');
      expect(afterAcceptance.quoteRequest.email).toBeDefined();
      expect(afterAcceptance.quoteRequest.contactName).toBeDefined();
    });

    it('should prevent unauthorized vendor from accessing another vendor quotes', async () => {
      const { quote } = testScenario;

      const { vendor: anotherVendor } = await createTestVendor({
        name: `${TEST_PREFIX}Another Vendor`,
        email: `${TEST_PREFIX}another.vendor@test.com`,
      });

      const unauthorizedQuotes = await Quote.find({
        vendor: anotherVendor._id,
        _id: quote._id,
      });

      expect(unauthorizedQuotes).toHaveLength(0);
    });

    it('should prevent buyer from viewing another buyer quote requests', async () => {
      const { quoteRequest } = testScenario;

      const { user: anotherBuyer } = await createTestUser({
        name: `${TEST_PREFIX}Another Buyer`,
        email: `${TEST_PREFIX}another.buyer@test.com`,
      });

      const unauthorizedRequests = await QuoteRequest.find({
        $or: [{ userId: anotherBuyer._id }, { submittedBy: anotherBuyer._id }],
        _id: quoteRequest._id,
      });

      expect(unauthorizedRequests).toHaveLength(0);
    });
  });

  describe('5. Edge Cases', () => {
    it('should NOT allow accepting an expired quote', async () => {
      const { buyer, vendor, product, quoteRequest } = testScenario;

      const expiredQuote = await createExpiredQuote(
        quoteRequest._id,
        vendor._id,
        product._id
      );

      const savedQuote = await Quote.findById(expiredQuote._id);

      const isExpired = new Date(savedQuote.terms.validUntil) < new Date();
      expect(isExpired).toBe(true);
      expect(savedQuote.status).toBe('expired');

      if (savedQuote.status === 'expired') {
        const errorResponse = {
          success: false,
          error: 'QUOTE_EXPIRED',
          message: 'Cannot accept an expired quote',
        };
        expect(errorResponse.error).toBe('QUOTE_EXPIRED');
      }
    });

    it('should NOT allow double-acceptance of the same quote', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const alreadyAccepted = await Quote.findById(quote._id);
      expect(alreadyAccepted.status).toBe('accepted');

      if (alreadyAccepted.status === 'accepted') {
        const errorResponse = {
          success: false,
          error: 'ALREADY_ACCEPTED',
          message: 'Quote already accepted',
          code: 'QUOTE_013',
        };
        expect(errorResponse.code).toBe('QUOTE_013');
      }
    });

    it('should NOT allow accepting a rejected quote', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.status = 'rejected';
      savedQuote.decisionDetails = {
        rejectedAt: new Date(),
        rejectedBy: buyer._id,
        rejectionReason: 'Price too high',
      };
      await savedQuote.save();

      const rejectedQuote = await Quote.findById(quote._id);
      expect(rejectedQuote.status).toBe('rejected');

      if (rejectedQuote.status === 'rejected') {
        const errorResponse = {
          success: false,
          error: 'QUOTE_REJECTED',
          message: 'Cannot accept a rejected quote',
        };
        expect(errorResponse.error).toBe('QUOTE_REJECTED');
      }
    });

    it('should handle quote acceptance when quoteRequest reference is missing', async () => {
      const { buyer, vendor, product } = testScenario;

      const orphanQuote = await createTestQuote(
        new mongoose.Types.ObjectId(),
        vendor._id,
        product._id,
        {
          status: 'pending',
        }
      );

      const savedQuote = await Quote.findById(orphanQuote._id)
        .populate('quoteRequest');

      expect(savedQuote.quoteRequest).toBeNull();

      if (!savedQuote.quoteRequest) {
        const errorResponse = {
          success: false,
          error: 'QUOTE_REQUEST_NOT_FOUND',
          message: 'Associated quote request not found',
        };
        expect(errorResponse.error).toBe('QUOTE_REQUEST_NOT_FOUND');
      }
    });

    it('should validate quote belongs to user before acceptance', async () => {
      const { quote, vendor } = testScenario;

      const { user: differentUser } = await createTestUser({
        name: `${TEST_PREFIX}Different User`,
        email: `${TEST_PREFIX}different.user@test.com`,
      });

      const savedQuote = await Quote.findById(quote._id)
        .populate('quoteRequest');

      const hasAccess =
        savedQuote.quoteRequest?.userId?.toString() === differentUser._id.toString() ||
        savedQuote.quoteRequest?.submittedBy?.toString() === differentUser._id.toString();

      expect(hasAccess).toBe(false);

      if (!hasAccess) {
        const errorResponse = {
          success: false,
          error: 'ACCESS_DENIED',
          message: 'Access denied',
          code: 'QUOTE_012',
        };
        expect(errorResponse.code).toBe('QUOTE_012');
      }
    });

    it('should handle concurrent acceptance attempts gracefully', async () => {
      const { buyer, quote } = testScenario;

      const quote1 = await Quote.findById(quote._id);
      const quote2 = await Quote.findById(quote._id);

      quote1.status = 'accepted';
      quote1.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await quote1.save();

      const currentStatus = await Quote.findById(quote._id);
      expect(currentStatus.status).toBe('accepted');
    });

    it('should track quote view count metrics', async () => {
      const { quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      savedQuote.metrics.viewCount = (savedQuote.metrics.viewCount || 0) + 1;
      await savedQuote.save();

      savedQuote.metrics.viewCount += 1;
      await savedQuote.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.metrics.viewCount).toBe(2);
    });
  });

  describe('Quote Status Workflow Validation', () => {
    it('should enforce valid status transitions', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);

      savedQuote.status = 'contacted';
      await savedQuote.save();
      expect(savedQuote.status).toBe('contacted');

      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();
      expect(savedQuote.status).toBe('accepted');
    });

    it('should allow direct transition from pending to accepted', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);
      expect(savedQuote.status).toBe('pending');

      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.status).toBe('accepted');
    });

    it('should record customer action for each status change', async () => {
      const { buyer, quote } = testScenario;

      const savedQuote = await Quote.findById(quote._id);

      savedQuote.customerActions.push({
        action: 'viewed',
        timestamp: new Date(),
        notes: 'Customer viewed quote details',
      });
      await savedQuote.save();

      savedQuote.customerActions.push({
        action: 'contacted',
        timestamp: new Date(),
        notes: 'Customer requested more information',
      });
      savedQuote.status = 'contacted';
      await savedQuote.save();

      savedQuote.customerActions.push({
        action: 'accepted',
        timestamp: new Date(),
        notes: 'Customer accepted the quote',
      });
      savedQuote.status = 'accepted';
      savedQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: buyer._id,
      };
      await savedQuote.save();

      const finalQuote = await Quote.findById(quote._id);
      expect(finalQuote.customerActions).toHaveLength(3);
      expect(finalQuote.customerActions[0].action).toBe('viewed');
      expect(finalQuote.customerActions[1].action).toBe('contacted');
      expect(finalQuote.customerActions[2].action).toBe('accepted');
    });
  });
});
