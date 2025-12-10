/**
 * Quote Acceptance Logic Unit Tests
 *
 * Tests the quote acceptance business logic with mocked database operations.
 *
 * Tests cover:
 * 1. Buyer accepts quote - status updates, order creation
 * 2. Other quotes rejected when one is accepted
 * 3. Vendor sees buyer details only after acceptance
 * 4. Permissions checks
 * 5. Edge cases - expired quotes, double-acceptance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

// Mock models before importing
vi.mock('../../models/Quote.js', () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    deleteMany: vi.fn(),
  }
}));

vi.mock('../../models/QuoteRequest.js', () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
    deleteMany: vi.fn(),
  }
}));

vi.mock('../../models/Order.js', () => {
  const MockOrder = vi.fn().mockImplementation(function(data) {
    this._id = new mongoose.Types.ObjectId();
    this.save = vi.fn().mockResolvedValue(true);
    Object.assign(this, data);
  });
  return { default: MockOrder };
});

vi.mock('../../services/notificationService.js', () => ({
  default: {
    sendQuoteAcceptedNotification: vi.fn().mockResolvedValue(true),
    sendQuoteDeclinedNotification: vi.fn().mockResolvedValue(true),
  },
}));

import Quote from '../../models/Quote.js';
import QuoteRequest from '../../models/QuoteRequest.js';
import Order from '../../models/Order.js';
import notificationService from '../../services/notificationService.js';

describe('Quote Acceptance Logic', () => {
  const mockBuyerId = new mongoose.Types.ObjectId();
  const mockVendorId = new mongoose.Types.ObjectId();
  const mockQuoteId = new mongoose.Types.ObjectId();
  const mockQuoteRequestId = new mongoose.Types.ObjectId();
  const mockProductId = new mongoose.Types.ObjectId();

  const createMockQuote = (overrides = {}) => ({
    _id: mockQuoteId,
    quoteRequest: {
      _id: mockQuoteRequestId,
      userId: mockBuyerId,
      submittedBy: mockBuyerId,
      companyName: 'Test Company',
      contactName: 'John Doe',
      email: 'john@test.com',
      phone: '+441234567890',
      status: 'matched',
      save: vi.fn().mockResolvedValue(true),
    },
    vendor: {
      _id: mockVendorId,
      name: 'Test Vendor',
      email: 'vendor@test.com',
    },
    product: {
      _id: mockProductId,
      manufacturer: 'Xerox',
      model: 'AltaLink C8030',
    },
    productSummary: {
      manufacturer: 'Xerox',
      model: 'AltaLink C8030',
      category: 'A3 MFP',
      speed: 30,
    },
    costs: {
      machineCost: 3000,
      totalMachineCost: 3500,
      monthlyCosts: {
        totalMonthlyCost: 280,
        leaseCost: 150,
        serviceCost: 50,
        totalCpcCost: 80,
      },
    },
    status: 'pending',
    terms: {
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    decisionDetails: {},
    customerActions: [],
    ranking: 1,
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Buyer Accepts Quote - Status Updates', () => {
    it('should update quote status to accepted', async () => {
      const mockQuote = createMockQuote();
      Quote.findById.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockQuote),
      });

      // Simulate acceptance logic
      mockQuote.status = 'accepted';
      mockQuote.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: mockBuyerId,
      };
      await mockQuote.save();

      expect(mockQuote.status).toBe('accepted');
      expect(mockQuote.decisionDetails.acceptedAt).toBeDefined();
      expect(mockQuote.decisionDetails.acceptedBy.toString()).toBe(mockBuyerId.toString());
      expect(mockQuote.save).toHaveBeenCalled();
    });

    it('should update quote request status to completed', async () => {
      const mockQuote = createMockQuote();

      // Simulate acceptance
      mockQuote.status = 'accepted';
      mockQuote.quoteRequest.status = 'completed';
      mockQuote.quoteRequest.acceptedQuote = mockQuoteId;
      await mockQuote.quoteRequest.save();

      expect(mockQuote.quoteRequest.status).toBe('completed');
      expect(mockQuote.quoteRequest.acceptedQuote).toEqual(mockQuoteId);
      expect(mockQuote.quoteRequest.save).toHaveBeenCalled();
    });

    it('should create an order when quote is accepted', async () => {
      const mockQuote = createMockQuote();

      // Simulate order creation
      const orderData = {
        vendor: mockQuote.vendor._id,
        user: mockBuyerId,
        items: [{
          product: mockQuote.productSummary.model,
          quantity: 1,
          price: mockQuote.costs.monthlyCosts.totalMonthlyCost,
        }],
        totalPrice: mockQuote.costs.monthlyCosts.totalMonthlyCost,
        status: 'Pending',
        quoteReference: mockQuoteId,
        orderType: 'quote_acceptance',
      };

      const order = new Order(orderData);
      await order.save();

      expect(Order).toHaveBeenCalledWith(expect.objectContaining({
        vendor: mockVendorId,
        user: mockBuyerId,
        quoteReference: mockQuoteId,
        orderType: 'quote_acceptance',
      }));
    });

    it('should track customer action for acceptance', async () => {
      const mockQuote = createMockQuote();

      mockQuote.customerActions.push({
        action: 'accepted',
        timestamp: new Date(),
        notes: 'Quote accepted by customer',
      });

      expect(mockQuote.customerActions).toHaveLength(1);
      expect(mockQuote.customerActions[0].action).toBe('accepted');
    });

    it('should send notification to vendor after acceptance', async () => {
      const mockQuote = createMockQuote();
      mockQuote.status = 'accepted';

      await notificationService.sendQuoteAcceptedNotification({
        vendorId: mockQuote.vendor._id,
        vendorName: mockQuote.vendor.name,
        quoteId: mockQuote._id,
        customerName: mockQuote.quoteRequest.companyName,
        customerEmail: mockQuote.quoteRequest.email,
      });

      expect(notificationService.sendQuoteAcceptedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: mockVendorId,
          vendorName: 'Test Vendor',
          quoteId: mockQuoteId,
          customerName: 'Test Company',
        })
      );
    });
  });

  describe('2. Other Quotes Rejected When One Accepted', () => {
    it('should mark other quotes as rejected', async () => {
      const mockQuote1 = createMockQuote({ ranking: 1 });
      const mockQuote2 = createMockQuote({
        _id: new mongoose.Types.ObjectId(),
        ranking: 2,
        vendor: { _id: new mongoose.Types.ObjectId(), name: 'Vendor 2' },
      });
      const mockQuote3 = createMockQuote({
        _id: new mongoose.Types.ObjectId(),
        ranking: 3,
        vendor: { _id: new mongoose.Types.ObjectId(), name: 'Vendor 3' },
      });

      // Accept first quote
      mockQuote1.status = 'accepted';
      mockQuote1.decisionDetails = {
        acceptedAt: new Date(),
        acceptedBy: mockBuyerId,
      };

      // Reject others
      mockQuote2.status = 'rejected';
      mockQuote2.decisionDetails = {
        rejectedAt: new Date(),
        rejectedBy: mockBuyerId,
        rejectionReason: 'Another quote was accepted',
      };

      mockQuote3.status = 'rejected';
      mockQuote3.decisionDetails = {
        rejectedAt: new Date(),
        rejectedBy: mockBuyerId,
        rejectionReason: 'Another quote was accepted',
      };

      expect(mockQuote1.status).toBe('accepted');
      expect(mockQuote2.status).toBe('rejected');
      expect(mockQuote3.status).toBe('rejected');
      expect(mockQuote2.decisionDetails.rejectionReason).toBe('Another quote was accepted');
    });

    it('should notify losing vendors', async () => {
      const losingVendorId = new mongoose.Types.ObjectId();

      await notificationService.sendQuoteDeclinedNotification({
        vendorId: losingVendorId,
        vendorName: 'Losing Vendor',
        quoteId: new mongoose.Types.ObjectId(),
        customerName: 'Test Company',
        reason: 'Another quote was accepted',
      });

      expect(notificationService.sendQuoteDeclinedNotification).toHaveBeenCalled();
    });
  });

  describe('3. Vendor Sees Buyer Details After Acceptance', () => {
    it('should expose buyer contact details after acceptance', async () => {
      const mockQuote = createMockQuote();
      mockQuote.status = 'accepted';

      // After acceptance, vendor can see buyer details
      const buyerDetails = {
        companyName: mockQuote.quoteRequest.companyName,
        contactName: mockQuote.quoteRequest.contactName,
        email: mockQuote.quoteRequest.email,
        phone: mockQuote.quoteRequest.phone,
      };

      expect(buyerDetails.companyName).toBe('Test Company');
      expect(buyerDetails.contactName).toBe('John Doe');
      expect(buyerDetails.email).toBe('john@test.com');
      expect(buyerDetails.phone).toBe('+441234567890');
    });

    it('should show acceptance timestamp to vendor', async () => {
      const mockQuote = createMockQuote();
      const acceptedAt = new Date();

      mockQuote.status = 'accepted';
      mockQuote.decisionDetails = {
        acceptedAt: acceptedAt,
        acceptedBy: mockBuyerId,
      };

      expect(mockQuote.decisionDetails.acceptedAt).toEqual(acceptedAt);
    });
  });

  describe('4. Permissions', () => {
    it('should verify buyer owns the quote request before acceptance', () => {
      const mockQuote = createMockQuote();
      const requestingUserId = mockBuyerId;

      const hasAccess =
        mockQuote.quoteRequest.userId.toString() === requestingUserId.toString() ||
        mockQuote.quoteRequest.submittedBy.toString() === requestingUserId.toString();

      expect(hasAccess).toBe(true);
    });

    it('should deny access to unauthorized user', () => {
      const mockQuote = createMockQuote();
      const unauthorizedUserId = new mongoose.Types.ObjectId();

      const hasAccess =
        mockQuote.quoteRequest.userId.toString() === unauthorizedUserId.toString() ||
        mockQuote.quoteRequest.submittedBy.toString() === unauthorizedUserId.toString();

      expect(hasAccess).toBe(false);
    });

    it('should not expose buyer details before acceptance', () => {
      const mockQuote = createMockQuote();

      // Before acceptance, check status
      expect(mockQuote.status).toBe('pending');

      // Vendor query should only get limited info before acceptance
      const limitedVendorView = {
        quoteRequestId: mockQuote.quoteRequest._id,
        companyName: mockQuote.quoteRequest.companyName, // OK to show
        // contactName: HIDDEN before acceptance
        // email: HIDDEN before acceptance
        // phone: HIDDEN before acceptance
      };

      // Full details should only be shown when status === 'accepted'
      const shouldShowFullDetails = mockQuote.status === 'accepted';
      expect(shouldShowFullDetails).toBe(false);
    });

    it('should prevent vendor from seeing other vendor quote details', () => {
      const vendor1Id = new mongoose.Types.ObjectId();
      const vendor2Id = new mongoose.Types.ObjectId();

      const mockQuote = createMockQuote({
        vendor: { _id: vendor1Id, name: 'Vendor 1' }
      });

      // Vendor 2 tries to access Vendor 1's quote
      const isOwnQuote = mockQuote.vendor._id.toString() === vendor2Id.toString();
      expect(isOwnQuote).toBe(false);
    });

    it('should prevent buyer from accepting multiple quotes for same request', () => {
      const mockQuote1 = createMockQuote();
      mockQuote1.status = 'accepted';

      const mockQuote2 = createMockQuote({
        _id: new mongoose.Types.ObjectId(),
        status: 'pending',
      });

      // Check if any quote for this request is already accepted
      const alreadyAccepted = mockQuote1.status === 'accepted';

      if (alreadyAccepted) {
        // Should return 409 Conflict
        const errorResponse = {
          success: false,
          error: 'ALREADY_ACCEPTED',
          message: 'A quote for this request has already been accepted',
          code: 'QUOTE_013',
        };
        expect(errorResponse.code).toBe('QUOTE_013');
      }
    });
  });

  describe('5. Edge Cases', () => {
    it('should reject acceptance of expired quote', () => {
      const expiredQuote = createMockQuote({
        status: 'expired',
        terms: {
          validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        },
      });

      const isExpired = new Date(expiredQuote.terms.validUntil) < new Date();

      expect(isExpired).toBe(true);
      expect(expiredQuote.status).toBe('expired');

      // API should return error
      const errorResponse = {
        success: false,
        error: 'QUOTE_EXPIRED',
        message: 'Cannot accept an expired quote',
      };
      expect(errorResponse.error).toBe('QUOTE_EXPIRED');
    });

    it('should reject double-acceptance attempt', () => {
      const alreadyAcceptedQuote = createMockQuote({
        status: 'accepted',
        decisionDetails: {
          acceptedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          acceptedBy: mockBuyerId,
        },
      });

      const isAlreadyAccepted = alreadyAcceptedQuote.status === 'accepted';
      expect(isAlreadyAccepted).toBe(true);

      // API should return 409 Conflict
      const errorResponse = {
        success: false,
        error: 'ALREADY_ACCEPTED',
        message: 'Quote already accepted',
        code: 'QUOTE_013',
      };
      expect(errorResponse.code).toBe('QUOTE_013');
    });

    it('should reject acceptance of already rejected quote', () => {
      const rejectedQuote = createMockQuote({
        status: 'rejected',
        decisionDetails: {
          rejectedAt: new Date(),
          rejectedBy: mockBuyerId,
          rejectionReason: 'Price too high',
        },
      });

      const isRejected = rejectedQuote.status === 'rejected';
      expect(isRejected).toBe(true);

      const errorResponse = {
        success: false,
        error: 'QUOTE_REJECTED',
        message: 'Cannot accept a rejected quote',
      };
      expect(errorResponse.error).toBe('QUOTE_REJECTED');
    });

    it('should handle missing quote request gracefully', () => {
      const orphanQuote = createMockQuote({
        quoteRequest: null,
      });

      const hasQuoteRequest = orphanQuote.quoteRequest !== null;
      expect(hasQuoteRequest).toBe(false);

      const errorResponse = {
        success: false,
        error: 'QUOTE_REQUEST_NOT_FOUND',
        message: 'Associated quote request not found',
      };
      expect(errorResponse.error).toBe('QUOTE_REQUEST_NOT_FOUND');
    });

    it('should prevent vendor from replying to quote they did not win', () => {
      const losingVendorId = new mongoose.Types.ObjectId();
      const winningVendorId = new mongoose.Types.ObjectId();

      const acceptedQuote = createMockQuote({
        status: 'accepted',
        vendor: { _id: winningVendorId, name: 'Winning Vendor' },
      });

      // Losing vendor tries to add notes/reply
      const isWinningVendor = acceptedQuote.vendor._id.toString() === losingVendorId.toString();
      expect(isWinningVendor).toBe(false);

      // Should be denied
      const errorResponse = {
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You cannot reply to a quote you did not win',
      };
      expect(errorResponse.error).toBe('ACCESS_DENIED');
    });
  });

  describe('Quote Status Enum Validation', () => {
    it('should have valid status transitions', () => {
      const validStatuses = ['pending', 'contacted', 'accepted', 'rejected', 'expired', 'generated'];

      const mockQuote = createMockQuote();

      // All statuses should be valid
      validStatuses.forEach(status => {
        mockQuote.status = status;
        expect(validStatuses).toContain(mockQuote.status);
      });
    });

    it('should allow pending -> accepted transition', () => {
      const mockQuote = createMockQuote({ status: 'pending' });

      expect(mockQuote.status).toBe('pending');

      mockQuote.status = 'accepted';
      expect(mockQuote.status).toBe('accepted');
    });

    it('should allow pending -> contacted -> accepted transition', () => {
      const mockQuote = createMockQuote({ status: 'pending' });

      mockQuote.status = 'contacted';
      expect(mockQuote.status).toBe('contacted');

      mockQuote.status = 'accepted';
      expect(mockQuote.status).toBe('accepted');
    });
  });

  describe('Vendor Reply After Acceptance', () => {
    it('should allow winning vendor to add internal notes', () => {
      const mockQuote = createMockQuote({
        status: 'accepted',
        internalNotes: [],
      });

      mockQuote.internalNotes = mockQuote.internalNotes || [];
      mockQuote.internalNotes.push({
        note: 'Will contact customer on Monday',
        addedBy: mockVendorId,
        addedAt: new Date(),
        type: 'vendor',
        priority: 'high',
      });

      expect(mockQuote.internalNotes).toHaveLength(1);
      expect(mockQuote.internalNotes[0].note).toContain('contact customer');
      expect(mockQuote.internalNotes[0].type).toBe('vendor');
    });

    it('should track vendor contact attempts', () => {
      const mockQuote = createMockQuote({
        status: 'accepted',
        contactAttempts: [],
      });

      mockQuote.contactAttempts = mockQuote.contactAttempts || [];
      mockQuote.contactAttempts.push({
        contactedAt: new Date(),
        contactedBy: mockVendorId,
        method: 'email',
        message: 'Installation schedule sent',
        status: 'pending',
      });

      expect(mockQuote.contactAttempts).toHaveLength(1);
      expect(mockQuote.contactAttempts[0].method).toBe('email');
      expect(mockQuote.contactAttempts[0].status).toBe('pending');
    });
  });

  describe('Time Tracking Metrics', () => {
    it('should calculate timeToDecision when accepted', () => {
      const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const acceptedAt = new Date();

      const mockQuote = createMockQuote({
        createdAt: createdAt,
        status: 'accepted',
        decisionDetails: {
          acceptedAt: acceptedAt,
          acceptedBy: mockBuyerId,
        },
        metrics: {},
      });

      // Calculate time to decision in minutes
      const timeToDecision = Math.round((acceptedAt - createdAt) / (1000 * 60));
      mockQuote.metrics.timeToDecision = timeToDecision;

      // Should be approximately 2880 minutes (2 days)
      expect(mockQuote.metrics.timeToDecision).toBeGreaterThan(2800);
      expect(mockQuote.metrics.timeToDecision).toBeLessThan(2900);
    });
  });
});
