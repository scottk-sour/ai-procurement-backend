/**
 * Vendor services CRUD — schema-first, vertical-aware.
 *
 * Endpoints mounted by the caller at /api/vendor-services:
 *   POST   /                create
 *   GET    /                list (scoped to authed vendor)
 *   GET    /:id             read
 *   PUT    /:id             update (also used for restore via active=true)
 *   DELETE /:id             soft-delete (active=false)
 *
 * All endpoints require a vendor JWT via vendorAuth. A vendor can only
 * operate on services they own. Both "not found" and "not owned" return
 * 404 (not 403) so service IDs can't be enumerated across vendors.
 *
 * POST and PUT are rate-limited to 30 writes per hour per vendor so a
 * runaway script loop can't silt the DB. Reads and soft-deletes are not
 * rate-limited at this layer (deletes are reversible via PUT).
 *
 * Payloads are whitelisted: any top-level or sub-doc key outside the
 * VendorService schema rejects with 400 and the offending field path.
 *
 * POST/PUT attach the authed vendor to doc._vendor before save, so the
 * pre-save hook's schema-generation step skips its findById round-trip.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import VendorService, {
  VENDOR_TYPE_TO_DATA_FIELD,
} from '../models/VendorService.js';

const router = express.Router();

// ─── Whitelists ───────────────────────────────────────────────────────
// Sub-doc keys derived from the model so schema additions flow through
// without a route-file edit.

const TOP_LEVEL_WRITABLE = Object.freeze([
  'name', 'description', 'active', 'faqs',
  'solicitorData', 'accountantData',
  'mortgageAdvisorData', 'estateAgentData',
]);

const SUBDOC_FIELDS = Object.freeze({
  solicitorData: Object.keys(VendorService.schema.path('solicitorData').schema.paths),
  accountantData: Object.keys(VendorService.schema.path('accountantData').schema.paths),
  mortgageAdvisorData: Object.keys(VendorService.schema.path('mortgageAdvisorData').schema.paths),
  estateAgentData: Object.keys(VendorService.schema.path('estateAgentData').schema.paths),
});

const FAQ_FIELDS = Object.freeze(['question', 'answer']);

// DoS-shape guards. Caps are generous relative to any legitimate service
// listing — intent is to bounce payloads that are clearly abuse (a
// 10,000-entry FAQ array, a pasted novel as a description) rather than
// to enforce editorial quality, which lives in completeness scoring.
const MAX_FAQS = 50;
const MAX_DESCRIPTION_CHARS = 10_000;
const MAX_NAME_CHARS = 500;

// ─── Validation helpers ───────────────────────────────────────────────

function validatePayload(body, expectedDataField) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object.', 400);
  }

  const unknownTop = Object.keys(body).filter((k) => !TOP_LEVEL_WRITABLE.includes(k));
  if (unknownTop.length > 0) {
    throw new AppError(
      `Unknown field(s): ${unknownTop.join(', ')}. Allowed: ${TOP_LEVEL_WRITABLE.join(', ')}.`,
      400,
    );
  }

  for (const dataField of Object.keys(SUBDOC_FIELDS)) {
    if (dataField === expectedDataField) continue;
    if (body[dataField] !== undefined) {
      throw new AppError(
        `Field '${dataField}' is not allowed for this vendor type. Expected sub-document: '${expectedDataField}'.`,
        400,
      );
    }
  }

  const sub = body[expectedDataField];
  if (sub !== undefined) {
    if (sub === null || typeof sub !== 'object' || Array.isArray(sub)) {
      throw new AppError(`'${expectedDataField}' must be an object.`, 400);
    }
    const allowed = SUBDOC_FIELDS[expectedDataField];
    const unknownSub = Object.keys(sub).filter((k) => !allowed.includes(k));
    if (unknownSub.length > 0) {
      throw new AppError(
        `Unknown field(s) in ${expectedDataField}: ${unknownSub.join(', ')}. Allowed: ${allowed.join(', ')}.`,
        400,
      );
    }
  }

  if (body.faqs !== undefined) {
    if (!Array.isArray(body.faqs)) {
      throw new AppError('faqs must be an array.', 400);
    }
    if (body.faqs.length > MAX_FAQS) {
      throw new AppError(`faqs may contain at most ${MAX_FAQS} entries; received ${body.faqs.length}.`, 400);
    }
    body.faqs.forEach((faq, i) => {
      if (!faq || typeof faq !== 'object' || Array.isArray(faq)) {
        throw new AppError(`faqs[${i}] must be an object.`, 400);
      }
      const unk = Object.keys(faq).filter((k) => !FAQ_FIELDS.includes(k));
      if (unk.length > 0) {
        throw new AppError(`Unknown field(s) in faqs[${i}]: ${unk.join(', ')}. Allowed: question, answer.`, 400);
      }
    });
  }

  if (body.active !== undefined && typeof body.active !== 'boolean') {
    throw new AppError("'active' must be a boolean.", 400);
  }
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      throw new AppError("'name' must be a string.", 400);
    }
    if (body.name.length > MAX_NAME_CHARS) {
      throw new AppError(`'name' may not exceed ${MAX_NAME_CHARS} characters; received ${body.name.length}.`, 400);
    }
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      throw new AppError("'description' must be a string.", 400);
    }
    if (body.description.length > MAX_DESCRIPTION_CHARS) {
      throw new AppError(`'description' may not exceed ${MAX_DESCRIPTION_CHARS} characters; received ${body.description.length}.`, 400);
    }
  }
}

async function loadAuthedVendorFull(req) {
  if (!req.vendor?.id) {
    throw new AppError('Authenticated vendor context missing.', 401);
  }
  const vendor = await Vendor.findById(req.vendor.id).lean();
  if (!vendor) {
    throw new AppError('Vendor account no longer exists.', 401);
  }
  const expectedField = VENDOR_TYPE_TO_DATA_FIELD[vendor.vendorType];
  if (!expectedField) {
    throw new AppError(
      `Vendor type '${vendor.vendorType || '(unset)'}' is not supported by /api/vendor-services. ` +
      `Supported types: ${Object.keys(VENDOR_TYPE_TO_DATA_FIELD).join(', ')}. ` +
      `Use the legacy /api/vendors/products endpoint for other verticals.`,
      400,
    );
  }
  return { vendor, expectedField };
}

function assertValidObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid service id.', 400);
  }
}

// Ownership failure is reported as 404 (not 403) so a caller can't use
// our error code to confirm that an opaque service ID exists.
function assertOwnership(doc, vendor) {
  if (String(doc.vendorId) !== String(vendor._id)) {
    throw new AppError('Service not found.', 404);
  }
}

// Translate Mongoose's own validation errors into the AppError shape
// so the global error handler returns a 400 (not a 500). Duplicate-key
// races (e.g. a unique index, should we add one) surface as 409.
async function saveTranslating(doc) {
  try {
    await doc.save();
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const fields = Object.keys(err.errors || {}).join(', ');
      const msg = fields
        ? `Validation failed on field(s): ${fields}. ${err.message}`
        : `Validation failed: ${err.message}`;
      throw new AppError(msg, 400);
    }
    if (err?.name === 'MongoServerError' && err.code === 11000) {
      throw new AppError('Duplicate service.', 409);
    }
    throw err;
  }
}

// ─── Rate limiter: 30 mutations/hour per vendor ───────────────────────

const mutateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req.vendor?.id ? String(req.vendor.id) : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many service write operations. Limit is 30 per hour per vendor.',
    });
  },
});

// ─── Handlers ─────────────────────────────────────────────────────────

// POST /api/vendor-services
router.post(
  '/',
  vendorAuth,
  mutateLimiter,
  catchAsync(async (req, res) => {
    const { vendor, expectedField } = await loadAuthedVendorFull(req);
    validatePayload(req.body, expectedField);

    const doc = new VendorService({
      ...req.body,
      vendorId: vendor._id,
      vendorType: vendor.vendorType,
    });
    doc._vendor = vendor;
    await saveTranslating(doc);

    res.status(201).json({
      success: true,
      data: doc.toObject(),
    });
  }),
);

// GET /api/vendor-services — list services for the authed vendor.
// Excludes the full schemaJsonLd cache to keep list payloads lean; the
// completeness score and aeoSignals are cheap and returned.
router.get(
  '/',
  vendorAuth,
  catchAsync(async (req, res) => {
    const services = await VendorService
      .find({ vendorId: req.vendor.id })
      .select('-schemaJsonLd')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      count: services.length,
      data: services,
    });
  }),
);

// GET /api/vendor-services/:id
router.get(
  '/:id',
  vendorAuth,
  catchAsync(async (req, res) => {
    assertValidObjectId(req.params.id);
    const doc = await VendorService.findById(req.params.id).lean();
    // Unified not-found / not-owned response — both surface as 404 so
    // service IDs cannot be enumerated across vendors.
    if (!doc || String(doc.vendorId) !== String(req.vendor.id)) {
      throw new AppError('Service not found.', 404);
    }
    res.json({ success: true, data: doc });
  }),
);

// PUT /api/vendor-services/:id — update; also used to restore a
// soft-deleted service via { active: true }.
router.put(
  '/:id',
  vendorAuth,
  mutateLimiter,
  catchAsync(async (req, res) => {
    assertValidObjectId(req.params.id);
    const { vendor, expectedField } = await loadAuthedVendorFull(req);
    validatePayload(req.body, expectedField);

    const doc = await VendorService.findById(req.params.id);
    if (!doc) throw new AppError('Service not found.', 404);
    assertOwnership(doc, vendor);

    for (const field of TOP_LEVEL_WRITABLE) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        doc[field] = req.body[field];
      }
    }
    doc._vendor = vendor;
    await saveTranslating(doc);

    res.json({
      success: true,
      data: doc.toObject(),
    });
  }),
);

// DELETE /api/vendor-services/:id — soft delete.
router.delete(
  '/:id',
  vendorAuth,
  catchAsync(async (req, res) => {
    assertValidObjectId(req.params.id);
    const { vendor } = await loadAuthedVendorFull(req);

    const doc = await VendorService.findById(req.params.id);
    if (!doc) throw new AppError('Service not found.', 404);
    assertOwnership(doc, vendor);

    if (doc.active === false) {
      return res.json({
        success: true,
        message: 'Service was already inactive.',
        data: doc.toObject(),
      });
    }

    doc.active = false;
    doc._vendor = vendor;
    await saveTranslating(doc);

    res.json({
      success: true,
      message: 'Service soft-deleted. Restore with PUT { active: true }.',
      data: doc.toObject(),
    });
  }),
);

export default router;
