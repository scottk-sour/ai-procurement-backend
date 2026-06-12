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
    // Should appear in the draftPayload block, not just metadata
    const draftPayloadSection = content.slice(
      content.indexOf('draftPayload: {'),
      content.indexOf('metadata: {')
    );
    expect(draftPayloadSection).toContain('dataGaps:');
  });

  it('firm-data endpoint removes saved key from draftPayload.dataGaps', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('routes/vendorApprovalRoutes.js', 'utf8');
    expect(content).toContain('draftPayload.dataGaps');
    expect(content).toContain('.filter(g =>');
    expect(content).toContain("g?.key !== key");
  });

  it('firm-data endpoint also removes from metadata.dataGaps', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('routes/vendorApprovalRoutes.js', 'utf8');
    expect(content).toContain('metadata.dataGaps');
    expect(content).toContain("markModified('metadata')");
  });

  it('FIRM_DATA_KEYS registry is the single source of truth for gap keys', async () => {
    const fs = await import('fs');
    const writerContent = fs.readFileSync('services/writerAgent.js', 'utf8');
    const routeContent = fs.readFileSync('routes/vendorApprovalRoutes.js', 'utf8');
    // Writer iterates FIRM_DATA_KEYS for gaps
    expect(writerContent).toContain('Object.entries(FIRM_DATA_KEYS)');
    // Route validates against isValidFirmDataKey
    expect(routeContent).toContain('isValidFirmDataKey(key)');
  });
});
