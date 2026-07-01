import { describe, it, expect } from 'vitest';

// Extract applyRepairs and helpers by importing the module's internals
// Since they're not exported, we test via a wrapper that evals them
import fs from 'fs';
const src = fs.readFileSync('services/writerAgent.js', 'utf8');
const fnBlock = src.match(/function normaliseForMatch[\s\S]*?return \{ repaired, unresolved \};\n\}/)?.[0];
if (!fnBlock) throw new Error('Could not extract applyRepairs from writerAgent.js');
const mod = {};
const wrapped = `(function(exports) { ${fnBlock}\n exports.applyRepairs = applyRepairs; })`;
eval(wrapped)(mod);
const { applyRepairs } = mod;

describe('applyRepairs — robust sentence matching', () => {

  it('Case A: NTSELAT → NTSEAT (checker rewords sentence)', () => {
    const draft = 'The National Trading Standards Estate and Letting Agent Team (NTSELAT) has the power to issue prohibition orders against agents who breach their legal obligations. This protects consumers from rogue operators. Contact us for more information.';

    const issue = {
      sentence: 'NTSELAT has the power to issue prohibition orders against agents who breach legal obligations.',
      repair: 'The National Trading Standards Estate and Letting Agent Team (NTSEAT) can apply to the court for prohibition orders against agents who breach their legal obligations.',
      verdict: 'contradicted',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);

    expect(unresolved).toHaveLength(0);
    expect(repaired).toContain('NTSEAT');
    expect(repaired).not.toContain('NTSELAT');
    expect(repaired).toContain('Contact us for more information');

    console.log('CASE A BEFORE:', draft);
    console.log('CASE A AFTER: ', repaired);
  });

  it('Case B: "applies in England" → "previously applied in Wales" (partial rewording)', () => {
    const draft = 'In Wales, the Renting Homes (Wales) Act 2016 replaced the assured shorthold tenancy framework that applies in England. Contract-holders now sign occupation contracts instead.';

    const issue = {
      sentence: 'The Renting Homes Act 2016 replaced the assured shorthold tenancy framework that applies in England.',
      repair: 'The Renting Homes (Wales) Act 2016 replaced the assured shorthold tenancy framework that previously applied in Wales.',
      verdict: 'contradicted',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);

    expect(unresolved).toHaveLength(0);
    expect(repaired).toContain('previously applied in Wales');
    expect(repaired).not.toContain('applies in England');
    expect(repaired).toContain('Contract-holders now sign occupation contracts instead');
  });

  it('Case C (regression): sentence genuinely not in draft → unresolved', () => {
    const draft = 'Estate agents in Cardiff provide excellent service. Our fees are competitive.';

    const issue = {
      sentence: 'Mortgage advisers must check the FCA register before recommending products.',
      repair: 'Mortgage advisers must verify their FCA authorisation status.',
      verdict: 'contradicted',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);

    expect(unresolved).toHaveLength(1);
    expect(repaired).toBe(draft);
  });

  it('firm-unverified removal with fuzzy match', () => {
    const draft = 'We are proud of our service. Our NAEA-qualified staff provide expert valuations for every property. Contact us today.';

    const issue = {
      sentence: 'Our NAEA-qualified staff provide expert valuations for every property.',
      repair: null,
      verdict: 'firm-unverified',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);

    expect(unresolved).toHaveLength(0);
    expect(repaired).not.toContain('NAEA');
    expect(repaired).toContain('We are proud of our service');
    expect(repaired).toContain('Contact us today');
  });
});
