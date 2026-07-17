import { describe, it, expect } from 'vitest';

describe('Writer repair pass — deterministic deletion', () => {
  it('writerAgent.js uses deterministic deletion, not LLM repair', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('deterministic repair');
    expect(content).toContain('deletedSentences');
    expect(content).not.toContain('repairPrompt');
    expect(content).not.toContain('repairResponse');
  });

  it('costEstimateUSD is declared with let (not const)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('let costEstimateUSD');
    expect(content).not.toMatch(/const costEstimateUSD\b/);
  });

  it('repair extracts excerpts from violation strings and deletes sentences', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('excerpt.substring(0,');
    expect(content).toContain('deletedSentences.push');
  });

  it('unmatched excerpt is logged and tolerated', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('Could not locate excerpt for deletion');
  });

  it('tidy function collapses blank lines and empty headings', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('\\n{3,}');
    expect(content).toContain('^#{1,6}\\s*\\n');
    expect(content).toContain('^[-*]\\s*\\n');
  });

  it('repaired metadata includes deletedSentences', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).toContain('repaired: true, repairedViolations, deletedSentences');
  });

  it('blocked paths after repair are reachable (no const crash)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    // The still-blocked path should reference "after repair attempt"
    expect(content).toContain('after repair attempt');
    // And should call completeRun + return
    const afterRepairSection = content.slice(content.indexOf('Final decision'));
    expect(afterRepairSection).toContain('completeRun');
    expect(afterRepairSection).toContain('return { success: false');
  });

  it('no repairCostUSD accumulation (zero cost repair)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('services/writerAgent.js', 'utf8');

    expect(content).not.toContain('costEstimateUSD += repairCostUSD');
    expect(content).toContain('No repair cost');
  });
});
