import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import OutreachLog from '../models/OutreachLog.js';

const router = express.Router();

const { ADMIN_JWT_SECRET } = process.env;

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Not authorized.' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

router.use(adminAuth);

// GET /today — records with nextActionDate = today, sorted by status priority
router.get('/today', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const records = await OutreachLog.find({
      nextActionDate: { $gte: startOfDay, $lt: endOfDay },
    }).lean();

    // Sort by status priority
    const priority = {
      'call-back': 0,
      'interested': 1,
      'opened': 2,
      'email-sent': 3,
      'new': 4,
      'called': 5,
      'signed-up': 6,
      'not-interested': 7,
    };
    records.sort((a, b) => (priority[a.status] ?? 99) - (priority[b.status] ?? 99));

    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /upcoming — records with nextActionDate within 7 days, grouped by date
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

    const records = await OutreachLog.find({
      nextActionDate: { $gte: startOfDay, $lt: endDate },
    })
      .sort({ nextActionDate: 1 })
      .lean();

    // Group by YYYY-MM-DD
    const grouped = {};
    records.forEach((r) => {
      const key = r.nextActionDate.toISOString().split('T')[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /stats — aggregate status counts + distinct cities
router.get('/stats', async (req, res) => {
  try {
    const [statusCounts, cities] = await Promise.all([
      OutreachLog.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      OutreachLog.distinct('reportCity'),
    ]);

    const counts = {};
    statusCounts.forEach((s) => {
      counts[s._id] = s.count;
    });

    res.json({
      success: true,
      data: {
        counts,
        cities: cities.filter(Boolean).sort(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET / — list with filters, search, pagination
router.get('/', async (req, res) => {
  try {
    const {
      status,
      city,
      category,
      fromDate,
      toDate,
      search,
      page = '1',
      limit = '25',
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (city) filter.reportCity = city;
    if (category) filter.reportCategory = category;
    if (fromDate || toDate) {
      filter.nextActionDate = {};
      if (fromDate) filter.nextActionDate.$gte = new Date(fromDate);
      if (toDate) filter.nextActionDate.$lte = new Date(toDate);
    }
    if (search) {
      filter.firmName = { $regex: search, $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      OutreachLog.find(filter)
        .sort({ nextActionDate: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OutreachLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id — single record with populated vendorId
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const record = await OutreachLog.findById(req.params.id)
      .populate('vendorId', 'company email')
      .lean();
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST / — create new record
router.post('/', async (req, res) => {
  try {
    if (!req.body.firmName) {
      return res.status(400).json({ success: false, error: 'firmName is required' });
    }
    const record = await OutreachLog.create(req.body);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /:id — update record
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/note — add a note
router.post('/:id/note', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }
    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      { $push: { notes: { text, createdAt: new Date() } } },
      { new: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/call — log a call
router.post('/:id/call', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const { notes, outcome, nextActionDate, nextAction } = req.body;

    const update = {
      $push: {
        callHistory: {
          calledAt: new Date(),
          notes: notes || '',
          outcome: outcome || 'called',
          nextActionDate: nextActionDate ? new Date(nextActionDate) : undefined,
        },
      },
      $set: {
        lastCalledAt: new Date(),
        status: outcome || 'called',
      },
    };

    if (nextActionDate) {
      update.$set.nextActionDate = new Date(nextActionDate);
    }
    if (nextAction) {
      update.$set.nextAction = nextAction;
    }

    const record = await OutreachLog.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id — delete record
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }
    const record = await OutreachLog.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
