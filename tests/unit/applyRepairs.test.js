import { describe, it, expect } from 'vitest';
import fs from 'fs';

const src = fs.readFileSync('services/writerAgent.js', 'utf8');
const fnBlock = src.match(/function normaliseForMatch[\s\S]*?return \{ repaired, unresolved \};\n\}\n\nfunction locateExcerptInText[\s\S]*?return sent;\n\}/)?.[0];
if (!fnBlock) throw new Error('Could not extract applyRepairs + locateExcerptInText from writerAgent.js');
const mod = {};
const wrapped = `(function(exports) { ${fnBlock}\n exports.applyRepairs = applyRepairs; exports.locateExcerptInText = locateExcerptInText; })`;
eval(wrapped)(mod);
const { applyRepairs, locateExcerptInText } = mod;

describe('applyRepairs — robust sentence matching + all-occurrence fix', () => {

  it('Case A: ambiguous NTSELAT match goes to unresolved (safety over aggression)', () => {
    const draft = 'The National Trading Standards Estate and Letting Agent Team (NTSELAT) enforces estate agency law. Letting agents must comply with all relevant legislation. NTSELAT has the power to issue prohibition orders against agents who breach their legal obligations. Contact us for more information.';

    const issue = {
      sentence: 'NTSELAT has the power to issue prohibition orders against agents who breach legal obligations.',
      repair: 'The National Trading Standards Estate and Letting Agent Team (NTSEAT) can apply to the court for prohibition orders against agents who breach their legal obligations.',
      verdict: 'contradicted',
    };

    const { repaired, unresolved } = applyRepairs(draft, [issue]);

    expect(unresolved).toHaveLength(1);
    expect(repaired).toBe(draft);
  });

  it('Case B: England-AST sentence corrected, rest unchanged', () => {
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

  it('Case C: fabrication repair — locateExcerptInText finds a non-verbatim excerpt', () => {
    const body = 'Landlords can claim up to £25,000 through The Property Ombudsman redress scheme. This provides an important safeguard for tenants.';
    const excerpt = 'claim up to 25000 through The Property Ombudsman redress';

    const located = locateExcerptInText(body, excerpt);
    expect(located).not.toBeNull();
    expect(located).toContain('Property Ombudsman');
  });

  it('Case D (regression): genuinely absent target → unresolved', () => {
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
