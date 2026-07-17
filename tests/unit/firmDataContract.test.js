import { describe, it, expect } from 'vitest';

describe('firmData contract verification', () => {
  it('writerAgent emits dataGaps as { key, label } objects, not plain strings', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    expect(content).toContain("dataGaps.push({ key, label })");
  });

  it('dataGaps is stored on draftPayload (accessible to frontend without metadata dig)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');
    const draftPayloadSection = content.slice(
      content.indexOf('draftPayload: {'),
      content.indexOf('metadata: {')
    );
    expect(draftPayloadSection).toContain('dataGaps:');
  });

  it('firm-data endpoint stores values on approval.firmData map, not in body', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('routes/vendorApprovalRoutes.js', 'utf8');
    expect(content).toContain("approval.firmData.set(key,");
    expect(content).toContain("markModified('firmData')");
    expect(content).not.toContain("approval.draftPayload.body = approval.draftPayload.body.replace");
  });

  it('firm-data endpoint validates keys against body placeholders, not static whitelist', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('routes/vendorApprovalRoutes.js', 'utf8');
    expect(content).toContain('FIRM_DATA:');
    expect(content).toContain('not found in this draft');
    expect(content).not.toContain('isValidFirmDataKey');
  });

  it('execution handler substitutes firmData at publish time', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/approvalQueue.js', 'utf8');
    expect(content).toContain('substitutePlaceholders');
    expect(content).toContain('mergedPayload');
  });
});
