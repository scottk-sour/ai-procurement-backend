import express from 'express';
import vendorAuth from '../middleware/vendorAuth.js';
import FirmFacts from '../models/FirmFacts.js';

const router = express.Router();

router.use(vendorAuth);

// GET /api/firmfacts/me
router.get('/me', async (req, res) => {
  try {
    const doc = await FirmFacts.findOrCreateForVendor(req.vendorId);
    res.json({ success: true, firmFacts: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/firmfacts/me — partial update (save-as-you-go)
// Accepts TWO formats:
//   1. Flat envelope (frontend): { fieldName: "X", value: Y, source: "self" }
//   2. Nested paths (legacy/batch): { "group.field": { value: Y, source: "self" }, ... }
router.put('/me', async (req, res) => {
  console.log('[firmfacts PUT] received body:', JSON.stringify(req.body));
  try {
    const doc = await FirmFacts.findOrCreateForVendor(req.vendorId);
    const body = req.body;
    const fieldsUpdated = [];
    const fieldsSkipped = [];

    if (body.fieldName && typeof body.fieldName === 'string') {
      // ─── Format 1: flat envelope { fieldName, value, source } ───
      const group = FirmFacts.resolveFieldGroup(body.fieldName);
      if (group && doc[group] && body.fieldName in doc[group]) {
        doc[group][body.fieldName] = {
          value: body.value !== undefined ? body.value : null,
          filledAt: new Date(),
          source: body.source || 'self',
        };
        fieldsUpdated.push(`${group}.${body.fieldName}`);
      } else {
        console.warn(`[FirmFacts PUT] Unknown fieldName: "${body.fieldName}" — no matching group found`);
        fieldsSkipped.push(body.fieldName);
      }
    } else {
      // ─── Format 2: nested paths { "group.field": { value, source }, ... } ───
      for (const [path, val] of Object.entries(body)) {
        const parts = path.split('.');
        if (parts.length !== 2) {
          fieldsSkipped.push(path);
          continue;
        }
        const [group, field] = parts;
        if (!doc[group] || typeof doc[group] !== 'object') {
          fieldsSkipped.push(path);
          continue;
        }
        if (!(field in doc[group])) {
          fieldsSkipped.push(path);
          continue;
        }

        doc[group][field] = {
          value: val.value !== undefined ? val.value : val,
          filledAt: new Date(),
          source: val.source || 'self',
        };
        fieldsUpdated.push(path);
      }
    }

    await doc.save();
    res.json({ success: true, firmFacts: doc, fieldsUpdated, fieldsSkipped });
  } catch (err) {
    console.error('[firmfacts PUT] error:', err);
    console.error('[firmfacts PUT] stack:', err.stack);
    console.error('[firmfacts PUT] vendorId:', req.vendorId);
    console.error('[firmfacts PUT] body:', JSON.stringify(req.body));
    res.status(500).json({ success: false, error: err.message, where: 'firmfacts.put' });
  }
});

// GET /api/firmfacts/me/completion
router.get('/me/completion', async (req, res) => {
  try {
    const doc = await FirmFacts.findOrCreateForVendor(req.vendorId);
    res.json({
      success: true,
      percentage: doc.completionPercentage,
      stage: doc.stage,
      completionByStage: doc.completionByStage,
      stage1Complete: doc.isStage1Complete(),
      missingFields: {
        stage1: doc.getMissingFields('stage1'),
        stage2: doc.getMissingFields('stage2'),
        stage3: doc.getMissingFields('stage3'),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
