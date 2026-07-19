import { describe, it, expect } from 'vitest';
import { isFirmMentioned } from '../../scripts/experiments/lib/mentionMatcher.js';

/**
 * Simulates the recomputeMentions logic: stored run has entityName: null
 * on all targets (the pre-fix state), but the config file has the correct
 * firm names. The recompute reads from config and re-matches.
 */

const PRE_FIX_STORED_RUN = {
  promptId: 'bradford-spec',
  platform: 'perplexity',
  responseText: `Here are some solicitors in Bradford who specialise in immigration law:

1. **JWP Solicitors** - A well-known Bradford firm handling immigration and asylum cases with offices on Manningham Lane.

2. **Murrays Solicitors** - Based in Bradford city centre, they offer immigration advice and have Punjabi and Urdu speaking staff.

3. **Harris Solicitors** - Specialise in visa applications and appeals for Bradford's diverse community.

4. **Ison Harrison** - A larger firm with a Bradford office providing immigration legal services.

5. **Blacks Solicitors** - They cover a wide range of legal services including immigration from their Bradford branch.`,
  targets: [
    { url: 'https://www.tendorai.com/solicitors/jwp-solicitors-bradford', group: 'treatment', entityName: null, mentioned: false, cited: false },
    { url: 'https://www.tendorai.com/solicitors/murrays-solicitors-bradford', group: 'control', entityName: null, mentioned: false, cited: false },
    { url: 'https://www.tendorai.com/solicitors/harris-solicitors-bradford', group: 'treatment', entityName: null, mentioned: false, cited: false },
    { url: 'https://www.tendorai.com/solicitors/ackland-co-bradford', group: 'control', entityName: null, mentioned: false, cited: false },
  ],
};

const CONFIG_TARGETS = {
  'bradford-spec::https://www.tendorai.com/solicitors/jwp-solicitors-bradford': 'JWP Solicitors',
  'bradford-spec::https://www.tendorai.com/solicitors/murrays-solicitors-bradford': 'Murrays Solicitors',
  'bradford-spec::https://www.tendorai.com/solicitors/harris-solicitors-bradford': 'Harris Solicitors',
  'bradford-spec::https://www.tendorai.com/solicitors/ackland-co-bradford': 'Ackland & Co',
};

describe('recomputeMentions — pre-fix stored run with null entityNames', () => {
  it('detects zero mentions when using stored null entityNames (the bug)', () => {
    const results = PRE_FIX_STORED_RUN.targets.map(t => ({
      ...t,
      mentioned: isFirmMentioned(PRE_FIX_STORED_RUN.responseText, t.entityName),
    }));
    expect(results.every(r => r.mentioned === false)).toBe(true);
  });

  it('detects correct mentions when using config-sourced entityNames (the fix)', () => {
    const results = PRE_FIX_STORED_RUN.targets.map(t => {
      const configName = CONFIG_TARGETS[`${PRE_FIX_STORED_RUN.promptId}::${t.url}`] || null;
      return {
        ...t,
        entityName: configName,
        mentioned: isFirmMentioned(PRE_FIX_STORED_RUN.responseText, configName),
      };
    });

    const jwp = results.find(r => r.url.includes('jwp'));
    expect(jwp.mentioned).toBe(true);
    expect(jwp.entityName).toBe('JWP Solicitors');

    const murrays = results.find(r => r.url.includes('murrays'));
    expect(murrays.mentioned).toBe(true);

    const harris = results.find(r => r.url.includes('harris'));
    expect(harris.mentioned).toBe(true);

    const ackland = results.find(r => r.url.includes('ackland'));
    expect(ackland.mentioned).toBe(false);
  });

  it('flips exactly 3 flags (JWP, Murrays, Harris) — not Ackland', () => {
    let flipped = 0;
    for (const t of PRE_FIX_STORED_RUN.targets) {
      const configName = CONFIG_TARGETS[`${PRE_FIX_STORED_RUN.promptId}::${t.url}`] || null;
      const wasMentioned = t.mentioned;
      const nowMentioned = isFirmMentioned(PRE_FIX_STORED_RUN.responseText, configName);
      if (wasMentioned !== nowMentioned) flipped++;
    }
    expect(flipped).toBe(3);
  });

  it('also updates entityName from null to config value', () => {
    const results = PRE_FIX_STORED_RUN.targets.map(t => {
      const configName = CONFIG_TARGETS[`${PRE_FIX_STORED_RUN.promptId}::${t.url}`] || null;
      return { url: t.url, entityName: configName };
    });
    expect(results[0].entityName).toBe('JWP Solicitors');
    expect(results[3].entityName).toBe('Ackland & Co');
  });
});
