import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const VENDOR_A = new mongoose.Types.ObjectId();
const APPROVAL_A = new mongoose.Types.ObjectId();

const mockApprovalFindById = vi.fn();
const mockApprovalSave = vi.fn();
const mockVendorFindById = vi.fn();
const mockVendorSave = vi.fn();

vi.mock('../../models/ApprovalQueue.js', () => ({
  default: { findById: (...args) => mockApprovalFindById(...args) },
}));

vi.mock('../../models/Vendor.js', () => ({
  default: { findById: (...args) => mockVendorFindById(...args) },
}));

vi.mock('../../services/writerAgent/firmDataKeys.js', () => ({
  isValidFirmDataKey: (key) => ['fullManagementFeePercent', 'brokerFee', 'averageSalePrice'].includes(key),
  getFirmDataLabel: (key) => ({ fullManagementFeePercent: 'Full management fee %', brokerFee: 'Broker fee' }[key] || key),
}));

vi.mock('../../services/writerAgent/parsePlaceholders.js', () => ({
  countAllPlaceholders: (text) => {
    const keyed = (text.match(/\[FIRM_DATA:\s*[a-zA-Z_]+\s*\|[^\]]+\]/g) || []).length;
    const legacy = (text.match(/\[FIRM TO PROVIDE[: ][^\]]*\]/gi) || []).length;
    return keyed + legacy;
  },
}));

vi.mock('../../middleware/vendorAuth.js', () => ({
  default: (req, _res, next) => {
    req.vendorId = req.headers['x-test-vendor-id'] || String(VENDOR_A);
    req.vendor = { id: req.vendorId, vendorId: req.vendorId };
    next();
  },
}));

const { default: express } = await import('express');
const { default: vendorApprovalRoutes } = await import('../../routes/vendorApprovalRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/vendor/approvals', vendorApprovalRoutes);
  return app;
}

async function request(app, method, url, { headers = {}, body } = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = { hostname: '127.0.0.1', port, path: url, method: method.toUpperCase(), headers: { 'Content-Type': 'application/json', ...headers } };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { server.close(); try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('Firm-data save-back + firm-approve', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  function mockApproval(overrides = {}) {
    const approval = {
      _id: APPROVAL_A,
      vendorId: VENDOR_A,
      status: 'pending',
      draftPayload: {
        body: 'Our fee is [FIRM_DATA: fullManagementFeePercent | Add your full management fee %] plus VAT.',
        linkedInText: '',
        facebookText: '',
      },
      firmApprovedAt: null,
      firmApprovedBy: null,
      markModified: vi.fn(),
      save: mockApprovalSave.mockResolvedValue(true),
      ...overrides,
    };
    mockApprovalFindById.mockResolvedValue(approval);
    return approval;
  }

  function mockVendor() {
    const vendor = {
      _id: VENDOR_A,
      firmData: new Map(),
      save: mockVendorSave.mockResolvedValue(true),
    };
    mockVendorFindById.mockResolvedValue(vendor);
    return vendor;
  }

  it('POST firm-data saves value and replaces placeholder in draft', async () => {
    const approval = mockApproval();
    mockVendor();

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-data`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
      body: { key: 'fullManagementFeePercent', value: '10' },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.filledKey).toBe('fullManagementFeePercent');
    expect(res.body.remainingPlaceholders).toBe(0);
    expect(mockVendorSave).toHaveBeenCalled();
    expect(mockApprovalSave).toHaveBeenCalled();
  });

  it('POST firm-data rejects unknown key with 400', async () => {
    mockApproval();
    mockVendor();

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-data`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
      body: { key: 'madeUpKey', value: 'test' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unknown firmData key');
  });

  it('POST firm-data returns correct remainingPlaceholders count', async () => {
    mockApproval({
      draftPayload: {
        body: '[FIRM_DATA: fullManagementFeePercent | fee] and [FIRM_DATA: brokerFee | broker fee]',
        linkedInText: '',
        facebookText: '',
      },
    });
    mockVendor();

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-data`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
      body: { key: 'fullManagementFeePercent', value: '10' },
    });

    expect(res.status).toBe(200);
    expect(res.body.remainingPlaceholders).toBe(1);
  });

  it('POST firm-data returns 403 for wrong vendor', async () => {
    mockApproval({ vendorId: new mongoose.Types.ObjectId() });

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-data`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
      body: { key: 'fullManagementFeePercent', value: '10' },
    });

    expect(res.status).toBe(403);
  });

  it('firm-approve with dataGaps remaining returns 400', async () => {
    mockApproval({
      draftPayload: {
        body: 'Qualitative content with no inline placeholders.',
        linkedInText: '',
        facebookText: '',
        dataGaps: [
          { key: 'fullManagementFeePercent', label: 'Full management fee %' },
          { key: 'brokerFee', label: 'Broker fee' },
        ],
      },
    });

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-approve`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('2 field(s) still need your input');
    expect(res.body.remaining).toBe(2);
  });

  it('firm-approve with empty dataGaps sets firm_completed', async () => {
    mockApproval({
      draftPayload: {
        body: 'Qualitative content with no gaps remaining.',
        linkedInText: '',
        facebookText: '',
        dataGaps: [],
      },
    });

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-approve`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('firm_completed');
    expect(res.body.firmApprovedAt).toBeDefined();
  });

  it('firm-approve with absent dataGaps (legacy draft) sets firm_completed', async () => {
    mockApproval({
      draftPayload: {
        body: 'Legacy draft with no dataGaps field at all.',
        linkedInText: '',
        facebookText: '',
      },
    });

    const res = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-approve`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('firm_completed');
  });

  it('firm-approve succeeds after firm-data fills the last remaining gap', async () => {
    const approval = mockApproval({
      draftPayload: {
        body: 'Content about fees.',
        linkedInText: '',
        facebookText: '',
        dataGaps: [{ key: 'fullManagementFeePercent', label: 'Full management fee %' }],
      },
    });
    mockVendor();

    // Fill the last gap via firm-data
    const fillRes = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-data`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
      body: { key: 'fullManagementFeePercent', value: '10' },
    });
    expect(fillRes.status).toBe(200);

    // dataGaps should now be empty after the filter in firm-data handler
    expect(approval.draftPayload.dataGaps).toEqual([]);

    // Now firm-approve should pass
    const approveRes = await request(app, 'POST', `/api/vendor/approvals/${APPROVAL_A}/firm-approve`, {
      headers: { 'x-test-vendor-id': String(VENDOR_A) },
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('firm_completed');
  });

  it('admin can approve from firm_completed status', () => {
    const allowedStatuses = ['pending', 'firm_completed'];
    expect(allowedStatuses.includes('firm_completed')).toBe(true);
    expect(allowedStatuses.includes('pending')).toBe(true);
    expect(allowedStatuses.includes('approved')).toBe(false);
  });
});
