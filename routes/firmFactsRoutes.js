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
router.put('/me', async (req, res) => {
  try {
    const doc = await FirmFacts.findOrCreateForVendor(req.vendorId);
    const updates = req.body;

    for (const [path, val] of Object.entries(updates)) {
      const parts = path.split('.');
      if (parts.length !== 2) continue;
      const [group, field] = parts;
      if (!doc[group] || typeof doc[group] !== 'object') continue;
      if (!(field in doc[group])) continue;

      doc[group][field] = {
        value: val.value !== undefined ? val.value : val,
        filledAt: new Date(),
        source: val.source || 'self',
      };
    }

    await doc.save();
    res.json({ success: true, firmFacts: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
