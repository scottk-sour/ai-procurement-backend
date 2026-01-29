// routes/stripeRoutes.js
// TendorAI Stripe Payment Routes

import express from 'express';
import Stripe from 'stripe';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import { logger } from '../logger.js';
import { sendSubscriptionConfirmation } from '../utils/emailService.js';

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

// Subscription plan configurations
const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Basic',
    priceId: process.env.STRIPE_BASIC_PRICE_ID,
    price: 49,
    features: [
      'Up to 20 leads per month',
      'Basic profile listing',
      'Email notifications',
      'Standard support',
    ],
  },
  managed: {
    name: 'Managed',
    priceId: process.env.STRIPE_MANAGED_PRICE_ID,
    price: 149,
    features: [
      'Up to 50 leads per month',
      'Featured profile listing',
      'Priority lead matching',
      'Analytics dashboard',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    price: 299,
    features: [
      'Unlimited leads',
      'Premium profile placement',
      'Exclusive lead access',
      'Advanced analytics',
      'Dedicated account manager',
      'API access',
      '24/7 support',
    ],
  },
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
router.post('/create-checkout-session', vendorAuth, async (req, res) => {
  try {
    const { planId } = req.body;
    const vendor = await Vendor.findById(req.vendor.id);

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    // Create or retrieve Stripe customer
    let customerId = vendor.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: vendor.email,
        name: vendor.businessName,
        metadata: {
          vendorId: vendor._id.toString(),
        },
      });
      customerId = customer.id;

      // Save customer ID to vendor
      vendor.stripeCustomerId = customerId;
      await vendor.save();
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
      success_url: `${process.env.FRONTEND_URL}/vendor-dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/vendor-dashboard?subscription=cancelled`,
      metadata: {
        vendorId: vendor._id.toString(),
        planId,
      },
      subscription_data: {
        metadata: {
          vendorId: vendor._id.toString(),
          planId,
        },
      },
    });

    logger.info(`Checkout session created for vendor ${vendor._id}`, { sessionId: session.id, planId });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// Create customer portal session (for managing subscriptions)
router.post('/create-portal-session', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id);

    if (!vendor || !vendor.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: vendor.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/vendor-dashboard`,
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    logger.error('Error creating portal session:', error);
    res.status(500).json({ success: false, message: 'Failed to create portal session' });
  }
});

// Get current subscription status
router.get('/subscription-status', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id);

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (!vendor.stripeCustomerId) {
      return res.json({
        success: true,
        subscription: null,
        plan: 'free',
      });
    }

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: vendor.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.json({
        success: true,
        subscription: null,
        plan: 'free',
      });
    }

    const subscription = subscriptions.data[0];
    const planId = subscription.metadata.planId || 'basic';
    const plan = SUBSCRIPTION_PLANS[planId];

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      plan: planId,
      planDetails: plan,
    });
  } catch (error) {
    logger.error('Error fetching subscription status:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription status' });
  }
});

// Stripe webhook handler
// Note: raw body parsing is handled in index.js before JSON middleware
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
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
      logger.info('Payment succeeded for invoice:', invoice.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await handlePaymentFailed(invoice);
      break;
    }

    default:
      logger.info(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Handler functions
async function handleCheckoutComplete(session) {
  const { vendorId, planId } = session.metadata;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      logger.error('Vendor not found for checkout completion:', vendorId);
      return;
    }

    // Update vendor tier
    vendor.tier = planId;
    vendor.subscriptionStatus = 'active';
    await vendor.save();

    // Send confirmation email
    const plan = SUBSCRIPTION_PLANS[planId];
    await sendSubscriptionConfirmation(vendor, {
      planName: plan.name,
      price: plan.price,
      features: plan.features,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    logger.info(`Subscription activated for vendor ${vendorId}`, { planId });
  } catch (error) {
    logger.error('Error handling checkout completion:', error);
  }
}

async function handleSubscriptionUpdate(subscription) {
  const { vendorId, planId } = subscription.metadata;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      logger.error('Vendor not found for subscription update:', vendorId);
      return;
    }

    vendor.tier = planId || 'basic';
    vendor.subscriptionStatus = subscription.status;
    vendor.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
    await vendor.save();

    logger.info(`Subscription updated for vendor ${vendorId}`, {
      status: subscription.status,
      planId,
    });
  } catch (error) {
    logger.error('Error handling subscription update:', error);
  }
}

async function handleSubscriptionCancelled(subscription) {
  const { vendorId } = subscription.metadata;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      logger.error('Vendor not found for subscription cancellation:', vendorId);
      return;
    }

    vendor.tier = 'free';
    vendor.subscriptionStatus = 'cancelled';
    await vendor.save();

    logger.info(`Subscription cancelled for vendor ${vendorId}`);
  } catch (error) {
    logger.error('Error handling subscription cancellation:', error);
  }
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  try {
    const vendor = await Vendor.findOne({ stripeCustomerId: customerId });
    if (!vendor) {
      logger.error('Vendor not found for failed payment:', customerId);
      return;
    }

    vendor.subscriptionStatus = 'past_due';
    await vendor.save();

    // TODO: Send payment failed notification email
    logger.warn(`Payment failed for vendor ${vendor._id}`, { invoiceId: invoice.id });
  } catch (error) {
    logger.error('Error handling payment failure:', error);
  }
}

export default router;
