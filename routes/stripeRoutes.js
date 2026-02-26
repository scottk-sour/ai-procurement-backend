// routes/stripeRoutes.js
// TendorAI Stripe Payment Routes - AI Visibility Plans

import express from 'express';
import Stripe from 'stripe';
import Vendor from '../models/Vendor.js';
import logger from '../services/logger.js';

const router = express.Router();

// Initialize Stripe (with graceful handling for missing API key)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-11-20.acacia',
  });
  logger.info('Stripe initialized successfully');
} else {
  logger.warn('STRIPE_SECRET_KEY not configured - Stripe routes will return errors');
}

// Middleware to check if Stripe is configured
const requireStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      message: 'Stripe is not configured. Please contact support.'
    });
  }
  next();
};

// Price IDs from environment variables
// Env vars still use old names (STRIPE_VISIBLE_PRICE_ID / STRIPE_VERIFIED_PRICE_ID)
const PRICE_IDS = {
  starter: process.env.STRIPE_VISIBLE_PRICE_ID,   // Starter — £149/mo
  pro: process.env.STRIPE_VERIFIED_PRICE_ID,       // Pro — £299/mo
};

// Subscription plan configurations
const SUBSCRIPTION_PLANS = {
  starter: {
    name: 'Starter',
    priceId: PRICE_IDS.starter,
    price: 149,
    internalTier: 'basic',
    features: [
      'Pricing visible to AI',
      'Ranked above free profiles',
      'AI Visibility Score + breakdown',
      'AI Mention Tracking',
      'Unlimited products/services',
      'Monthly AI Visibility (AEO) report',
      'Full analytics dashboard',
    ],
  },
  pro: {
    name: 'Pro',
    priceId: PRICE_IDS.pro,
    price: 299,
    internalTier: 'managed',
    features: [
      'Everything in Starter',
      'We install AI visibility code on your website',
      'Weekly AI Visibility (AEO) reports',
      'TendorAI Verified badge',
      'AI Visibility (AEO) audit of your website',
      'Google Business Profile optimisation checklist',
      'Priority support',
    ],
  },
};

// Map price IDs to tiers
const PRICE_TO_TIER = {};
Object.entries(SUBSCRIPTION_PLANS).forEach(([planId, plan]) => {
  if (plan.priceId) {
    PRICE_TO_TIER[plan.priceId] = plan.internalTier;
  }
});

// Auth middleware - extracts vendor from JWT
const authenticateVendor = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Decode JWT
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    // Support multiple ID field names (vendorId from vendor login, userId/id from other sources)
    const vendorId = decoded.vendorId || decoded.userId || decoded.id;
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Invalid token structure' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    req.vendor = vendor;
    next();
  } catch (error) {
    logger.error('Auth error in stripe routes:', { error: error.message });
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Get available subscription plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    price: plan.price,
    features: plan.features,
  }));

  res.json({ success: true, plans });
});

// Create checkout session for subscription
router.post('/create-checkout-session', requireStripe, authenticateVendor, async (req, res) => {
  try {
    const { planId } = req.body;
    const vendor = req.vendor;

    // Map old/alias plan names to current keys
    const planMapping = {
      starter: 'starter',
      basic: 'starter',
      visible: 'starter',
      pro: 'pro',
      managed: 'pro',
      verified: 'pro',
    };

    const normalizedPlanId = planMapping[planId] || planId;
    const plan = SUBSCRIPTION_PLANS[normalizedPlanId];

    if (!plan) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan: ${planId}. Available plans: starter, pro`
      });
    }

    if (!plan.priceId) {
      return res.status(500).json({
        success: false,
        message: 'Price ID not configured for this plan. Please contact support.'
      });
    }

    // Create or retrieve Stripe customer
    let customerId = vendor.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: vendor.email,
        name: vendor.company || vendor.name,
        metadata: {
          vendorId: vendor._id.toString(),
        },
      });
      customerId = customer.id;

      // Save customer ID to vendor
      vendor.stripeCustomerId = customerId;
      await vendor.save();
    }

    // Check for existing active subscription
    if (vendor.stripeSubscriptionId && vendor.subscriptionStatus === 'active') {
      // Redirect to billing portal instead
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard/upgrade`
      });

      return res.json({
        success: true,
        url: portalSession.url,
        message: 'Redirecting to billing portal to manage existing subscription'
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard/upgrade?subscription=cancelled`,
      metadata: {
        vendorId: vendor._id.toString(),
        planId: normalizedPlanId,
        internalTier: plan.internalTier,
      },
      subscription_data: {
        metadata: {
          vendorId: vendor._id.toString(),
          planId: normalizedPlanId,
          internalTier: plan.internalTier,
        },
      },
      allow_promotion_codes: true,
    });

    logger.info('Checkout session created', {
      vendorId: vendor._id,
      sessionId: session.id,
      planId: normalizedPlanId
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating checkout session:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// Create customer portal session (for managing subscriptions)
router.post('/create-portal-session', requireStripe, authenticateVendor, async (req, res) => {
  try {
    const vendor = req.vendor;

    if (!vendor.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'No subscription found. Please subscribe first.',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: vendor.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard/upgrade`,
    });

    logger.info('Portal session created', { vendorId: vendor._id });

    res.json({ success: true, url: session.url });
  } catch (error) {
    logger.error('Error creating portal session:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create portal session' });
  }
});

// Get current subscription status
router.get('/subscription-status', requireStripe, authenticateVendor, async (req, res) => {
  try {
    const vendor = req.vendor;

    // Map internal tiers to display plan names
    const tierDisplayNames = {
      free: 'free',
      listed: 'free',
      standard: 'free',
      basic: 'starter',
      visible: 'starter',
      starter: 'starter',
      silver: 'starter',
      managed: 'pro',
      verified: 'pro',
      pro: 'pro',
      gold: 'pro',
      enterprise: 'pro',
    };

    if (!vendor.stripeCustomerId || vendor.subscriptionStatus !== 'active') {
      return res.json({
        success: true,
        subscription: null,
        plan: tierDisplayNames[vendor.tier] || 'free',
        internalTier: vendor.tier || 'free',
      });
    }

    // Get active subscriptions from Stripe
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: vendor.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return res.json({
          success: true,
          subscription: null,
          plan: tierDisplayNames[vendor.tier] || 'free',
          internalTier: vendor.tier || 'free',
        });
      }

      const subscription = subscriptions.data[0];
      const planId = subscription.metadata.planId || 'starter';

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        plan: planId,
        internalTier: vendor.tier,
        planDetails: SUBSCRIPTION_PLANS[planId],
      });
    } catch (stripeError) {
      logger.warn('Could not fetch subscription from Stripe', {
        vendorId: vendor._id,
        error: stripeError.message
      });

      // Return local data if Stripe call fails
      return res.json({
        success: true,
        subscription: vendor.stripeSubscriptionId ? {
          id: vendor.stripeSubscriptionId,
          status: vendor.subscriptionStatus
        } : null,
        plan: tierDisplayNames[vendor.tier] || 'free',
        internalTier: vendor.tier || 'free',
      });
    }
  } catch (error) {
    logger.error('Error fetching subscription status:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch subscription status' });
  }
});

// Stripe webhook handler
// Note: This route expects raw body - configured in index.js
router.post('/webhook', requireStripe, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info('Stripe webhook received', { type: event.type });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCancelled(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        logger.info('Unhandled Stripe event type', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error:', { error: error.message, type: event.type });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handler functions

async function handleCheckoutComplete(session) {
  const vendorId = session.metadata?.vendorId;
  const planId = session.metadata?.planId;
  const internalTier = session.metadata?.internalTier;

  if (!vendorId) {
    logger.warn('Checkout completed without vendorId in metadata');
    return;
  }

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      logger.error('Vendor not found for checkout completion:', { vendorId });
      return;
    }

    // Update vendor with subscription info
    vendor.tier = internalTier || (planId === 'pro' || planId === 'verified' ? 'managed' : 'basic');
    vendor.subscriptionStatus = 'active';
    vendor.stripeSubscriptionId = session.subscription;

    // Update account tier for backwards compatibility
    if (vendor.account) {
      vendor.account.tier = vendor.tier === 'managed' ? 'gold' : 'silver';
    }

    await vendor.save();

    logger.info('Subscription activated via checkout', {
      vendorId,
      tier: vendor.tier,
      planId,
      subscriptionId: session.subscription
    });

    // TODO: Send confirmation email
  } catch (error) {
    logger.error('Error handling checkout completion:', { error: error.message, vendorId });
  }
}

async function handleSubscriptionUpdate(subscription) {
  const vendorId = subscription.metadata?.vendorId;
  const customerId = subscription.customer;

  try {
    // Try to find vendor by vendorId in metadata first, then by customerId
    let vendor;
    if (vendorId) {
      vendor = await Vendor.findById(vendorId);
    }
    if (!vendor && customerId) {
      vendor = await Vendor.findOne({ stripeCustomerId: customerId });
    }

    if (!vendor) {
      logger.warn('Vendor not found for subscription update', { vendorId, customerId });
      return;
    }

    // Get tier from price ID
    const priceId = subscription.items.data[0]?.price?.id;
    const tier = PRICE_TO_TIER[priceId] || subscription.metadata?.internalTier || vendor.tier;

    vendor.tier = tier;
    vendor.subscriptionStatus = subscription.status;
    vendor.stripeSubscriptionId = subscription.id;
    vendor.subscriptionCurrentPeriodEnd = new Date(subscription.current_period_end * 1000);

    if (subscription.cancel_at_period_end) {
      vendor.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
    } else {
      vendor.subscriptionEndDate = null;
    }

    await vendor.save();

    logger.info('Subscription updated', {
      vendorId: vendor._id,
      status: subscription.status,
      tier
    });
  } catch (error) {
    logger.error('Error handling subscription update:', { error: error.message });
  }
}

async function handleSubscriptionCancelled(subscription) {
  const vendorId = subscription.metadata?.vendorId;
  const customerId = subscription.customer;

  try {
    let vendor;
    if (vendorId) {
      vendor = await Vendor.findById(vendorId);
    }
    if (!vendor && customerId) {
      vendor = await Vendor.findOne({ stripeCustomerId: customerId });
    }

    if (!vendor) {
      logger.warn('Vendor not found for subscription cancellation', { vendorId, customerId });
      return;
    }

    // Downgrade to free tier
    vendor.tier = 'free';
    vendor.subscriptionStatus = 'cancelled';
    vendor.stripeSubscriptionId = null;

    // Update account tier for backwards compatibility
    if (vendor.account) {
      vendor.account.tier = 'standard';
    }

    await vendor.save();

    logger.info('Subscription cancelled - vendor downgraded', { vendorId: vendor._id });
  } catch (error) {
    logger.error('Error handling subscription cancellation:', { error: error.message });
  }
}

async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;

  try {
    const vendor = await Vendor.findOne({ stripeCustomerId: customerId });
    if (!vendor) return;

    // If was past_due, restore to active
    if (vendor.subscriptionStatus === 'past_due') {
      vendor.subscriptionStatus = 'active';
      await vendor.save();
      logger.info('Payment recovered - subscription reactivated', { vendorId: vendor._id });
    }
  } catch (error) {
    logger.error('Error handling payment success:', { error: error.message });
  }
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  try {
    const vendor = await Vendor.findOne({ stripeCustomerId: customerId });
    if (!vendor) {
      logger.warn('Vendor not found for failed payment', { customerId });
      return;
    }

    vendor.subscriptionStatus = 'past_due';
    await vendor.save();

    logger.warn('Payment failed - subscription marked past_due', {
      vendorId: vendor._id,
      invoiceId: invoice.id
    });

    // TODO: Send payment failed notification email
  } catch (error) {
    logger.error('Error handling payment failure:', { error: error.message });
  }
}

export default router;
