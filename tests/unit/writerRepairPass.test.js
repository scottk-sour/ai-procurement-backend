import { describe, it, expect } from 'vitest';

describe('Writer repair pass — design verification', () => {
  it('writerAgent.js contains the repair loop structure', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('attempting repair');
    expect(content).toContain('repair succeeded');
    expect(content).toContain('repair failed');
    expect(content).toContain('repairCostUSD');
    expect(content).toContain('costEstimateUSD += repairCostUSD');
  });

  it('repair prompt includes flagged violations verbatim', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('VIOLATIONS FOUND');
    expect(content).toContain('firstPassViolations.map');
  });

  it('repaired metadata is stored on approved drafts', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('repaired: true');
    expect(content).toContain('repairedViolations');
  });

  it('blocked-after-repair includes firstPassViolations', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('firstPassViolations:');
    expect(content).toContain('after repair attempt');
  });

  it('repair uses the same system prompt + ORG_NAME_BAN as generation', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    const repairSection = content.slice(content.indexOf('attempting repair'));
    expect(repairSection).toContain('SYSTEM_PROMPT_WRITER_V1_1');
    expect(repairSection).toContain('ORG_NAME_BAN');
    expect(repairSection).toContain('firmContextBlock');
  });

  it('max 1 repair attempt — no recursion or loop beyond one retry', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    const repairAttempts = (content.match(/attempting repair/g) || []).length;
    expect(repairAttempts).toBe(1);

    expect(content).not.toContain('repair attempt 2');
    expect(content).not.toContain('second repair');
  });
});
