import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractAnswerText,
  extractCitations,
  checkIdIndexAlignment,
  summariseStructure,
  summariseArm,
  markerNumbers,
  hasInlineMarkers,
  hostOf,
  jaccard,
} from '../../scripts/experiments/lib/parityProbeLib.js';
import { isFirmMentioned } from '../../scripts/experiments/lib/mentionMatcher.js';

// A recorded Sonar wire body, matching the one already pinned in
// tests/unit/rawResponseSerialisable.test.js — same shape, EXP-001 content.
const SONAR_BODY = {
  id: 'chatcmpl-probe',
  object: 'chat.completion',
  model: 'sonar',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: {
      role: 'assistant',
      content: 'For conveyancing in Bolton, consider KBL SOLICITORS LLP [1] and AGH SOLICITORS [2].',
    },
  }],
  citations: ['https://www.kbl.co.uk/', 'https://www.aghsolicitors.com/x'],
  usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
};

// A CANDIDATE Agent API body. Field names are doc-sourced via search and are
// NOT verified first-hand — this fixture exists to prove the extractor handles
// the shape, not to assert that the shape is correct.
const AGENT_BODY = {
  id: 'resp_probe',
  model: 'perplexity/sonar',
  output: [
    {
      type: 'search_results',
      id: 'sr_1',
      results: [
        { id: 0, url: 'https://www.kbl.co.uk/', title: 'KBL', snippet: '…' },
        { id: 1, url: 'https://www.aghsolicitors.com/x', title: 'AGH', snippet: '…' },
      ],
    },
    {
      type: 'message',
      id: 'msg_1',
      status: 'completed',
      content: [{
        type: 'output_text',
        text: 'For conveyancing in Bolton, consider KBL SOLICITORS LLP [1] and AGH SOLICITORS [2].',
        annotations: [
          { type: 'citation', start_index: 40, end_index: 43, url: 'https://www.kbl.co.uk/', title: 'KBL' },
        ],
      }],
    },
  ],
  usage: { input_tokens: 12, output_tokens: 34 },
};

describe('parityProbeLib — answer-text extraction', () => {
  it('reads Sonar answer text from choices[0].message.content', () => {
    const { shape, text } = extractAnswerText(SONAR_BODY);
    expect(shape).toBe('sonar.choices');
    expect(text).toBe(SONAR_BODY.choices[0].message.content);
  });

  it('reads Agent answer text from the output[] message item', () => {
    const { shape, text } = extractAnswerText(AGENT_BODY);
    expect(shape).toBe('agent.output.message');
    expect(text).toContain('KBL SOLICITORS LLP');
  });

  it('prefers a top-level output_text aggregate when present', () => {
    const { shape, text } = extractAnswerText({ output_text: 'aggregated', output: [] });
    expect(shape).toBe('agent.output_text');
    expect(text).toBe('aggregated');
  });

  it('reports shape null for an unrecognised payload instead of returning a bare empty string', () => {
    const { shape, text } = extractAnswerText({ something: 'else' });
    expect(shape).toBeNull();
    expect(text).toBe('');
  });
});

describe('parityProbeLib — citation extraction', () => {
  it('reads Sonar citations from the top-level citations array', () => {
    const { shape, entries } = extractCitations(SONAR_BODY);
    expect(shape).toBe('sonar.citations');
    expect(entries.map((e) => e.url)).toEqual(SONAR_BODY.citations);
  });

  it('PRESERVES ORDER — citationIndex is half of a unique key in claim_use_labels', () => {
    const body = { citations: ['https://c.example/3', 'https://a.example/1', 'https://b.example/2'] };
    const { entries } = extractCitations(body);
    expect(entries.map((e) => e.url)).toEqual(body.citations);
    expect(entries.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it('PRESERVES DUPLICATES — the stored citedUrls[] array is never deduped', () => {
    const dup = 'https://dup.example/a';
    const { entries } = extractCitations({ citations: [dup, 'https://x.example/b', dup] });
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.url)).toEqual([dup, 'https://x.example/b', dup]);
  });

  it('reads Sonar search_results when citations is absent', () => {
    const { shape, entries } = extractCitations({
      search_results: [{ url: 'https://s.example/1', title: 'S1' }],
    });
    expect(shape).toBe('sonar.search_results');
    expect(entries[0].url).toBe('https://s.example/1');
  });

  it('reads Agent citations from the output[] search_results item', () => {
    const { shape, entries } = extractCitations(AGENT_BODY);
    expect(shape).toBe('agent.output.search_results');
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.kbl.co.uk/',
      'https://www.aghsolicitors.com/x',
    ]);
  });

  it('falls back to output_text annotations when no search_results item exists', () => {
    const body = { output: [AGENT_BODY.output[1]] };
    const { shape, entries } = extractCitations(body);
    expect(shape).toBe('agent.annotations');
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://www.kbl.co.uk/');
  });

  it('reports shape null for an unrecognised payload rather than claiming zero citations', () => {
    const { shape, entries } = extractCitations({ output: [{ type: 'reasoning' }] });
    expect(shape).toBeNull();
    expect(entries).toEqual([]);
  });
});

describe('parityProbeLib — id/index alignment (the disqualifying check)', () => {
  it('reports zero-based when result ids equal their array positions', () => {
    const { entries } = extractCitations(AGENT_BODY);
    expect(checkIdIndexAlignment(entries).verdict).toBe('zero-based');
  });

  it('reports one-based when ids start at 1', () => {
    const entries = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(checkIdIndexAlignment(entries).verdict).toBe('one-based');
  });

  it('reports misaligned for opaque or out-of-order ids', () => {
    expect(checkIdIndexAlignment([{ id: 'sr_abc' }, { id: 'sr_def' }]).verdict).toBe('misaligned');
    expect(checkIdIndexAlignment([{ id: 5 }, { id: 2 }]).verdict).toBe('misaligned');
  });

  it('reports absent when no ids are carried (as with Sonar bare URL strings)', () => {
    const { entries } = extractCitations(SONAR_BODY);
    expect(checkIdIndexAlignment(entries).verdict).toBe('absent');
  });
});

describe('parityProbeLib — inline [n] markers', () => {
  it('finds markers in Sonar-style text, in order', () => {
    expect(markerNumbers(SONAR_BODY.choices[0].message.content)).toEqual([1, 2]);
    expect(hasInlineMarkers(SONAR_BODY.choices[0].message.content)).toBe(true);
  });

  it('reports absence when the model was not instructed to cite', () => {
    expect(hasInlineMarkers('Consider KBL Solicitors and AGH Solicitors.')).toBe(false);
    expect(markerNumbers('')).toEqual([]);
  });
});

describe('parityProbeLib — host and overlap helpers', () => {
  it('normalises hosts and drops www', () => {
    expect(hostOf('https://www.KBL.co.uk/about')).toBe('kbl.co.uk');
    expect(hostOf('not a url')).toBeNull();
  });

  it('scores Jaccard overlap, treating two empty sets as agreement', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(['a'], [])).toBe(0);
  });
});

describe('parityProbeLib — structure discovery', () => {
  it('fingerprints an unknown payload so it can be reported, not guessed at', () => {
    const s = summariseStructure(AGENT_BODY);
    expect(s.topLevelKeys).toContain('output');
    expect(s.outputItemTypes).toEqual(['search_results', 'message']);
  });

  it('returns a null outputItemTypes for a chat-completions payload', () => {
    expect(summariseStructure(SONAR_BODY).outputItemTypes).toBeNull();
  });
});

describe('parityProbeLib — arm summary', () => {
  it('computes mention rate per (run x target), matching how EXP-001 counts targets', () => {
    const s = summariseArm([
      { ok: true, text: 'a [1]', entries: [{ url: 'https://a.example/' }], searchRan: true, latencyMs: 100, answerShape: 'sonar.choices', citationShape: 'sonar.citations', mentionedNames: { X: true, Y: false } },
      { ok: true, text: 'b', entries: [], searchRan: false, latencyMs: 200, answerShape: 'sonar.choices', citationShape: 'sonar.citations', mentionedNames: { X: false, Y: false } },
      { ok: false, error: 'boom' },
    ]);
    expect(s.attempted).toBe(3);
    expect(s.ok).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.mention).toEqual({ checks: 4, hits: 1, rate: 0.25 });
    expect(s.markerRate).toBe(0.5);
    expect(s.searchRanRate).toBe(0.5);
    expect(s.distinctHosts).toEqual(['a.example']);
  });
});

describe('parity probe — frozen-asset guarantees', () => {
  const probeSrc = fs.readFileSync(
    path.join(process.cwd(), 'scripts/experiments/parityProbe.js'), 'utf8',
  );

  it('never imports mongoose or any model, so it CANNOT write to experiment_runs', () => {
    expect(probeSrc).not.toMatch(/from\s+['"]mongoose['"]/);
    expect(probeSrc).not.toMatch(/from\s+['"].*models\//);
    expect(probeSrc).not.toMatch(/ExperimentRun/);
    expect(probeSrc).not.toMatch(/mongoose\.connect/);
  });

  it('calls the frozen matcher rather than reimplementing it', () => {
    expect(probeSrc).toMatch(/import\s*\{\s*isFirmMentioned\s*\}\s*from\s*['"]\.\/lib\/mentionMatcher\.js['"]/);
    expect(probeSrc).not.toMatch(/function\s+isFirmMentioned/);
  });

  it('uses a throwaway provenance key, never the real study key', () => {
    expect(probeSrc).toMatch(/study_probe_agent_parity/);
    expect(probeSrc).not.toMatch(/['"]study_2026_07_exp001['"]/);
  });

  it('sends the Sonar arm the byte-identical request the research runner sends', () => {
    const runner = fs.readFileSync(
      path.join(process.cwd(), 'scripts/experiments/runExperimentScan.js'), 'utf8',
    );
    // The runner's Perplexity request, normalised for whitespace.
    expect(runner.replace(/\s+/g, ' ')).toContain(
      "model: 'sonar', messages: [{ role: 'user', content: prompt }], max_tokens: 1024,",
    );
    expect(probeSrc.replace(/\s+/g, ' ')).toContain(
      "return { model: 'sonar', messages: [{ role: 'user', content: promptText }], max_tokens: 1024 };",
    );
  });
});

describe('frozen matcher behaviour on probe fixtures (matcher itself unchanged)', () => {
  it('matches EXP-001 target names inside Sonar-style answer text', () => {
    const text = SONAR_BODY.choices[0].message.content;
    expect(isFirmMentioned(text, 'KBL SOLICITORS LLP')).toBe(true);
    expect(isFirmMentioned(text, 'AGH SOLICITORS')).toBe(true);
    expect(isFirmMentioned(text, 'KEOGHS LLP')).toBe(false);
  });

  it('is unaffected by the presence or absence of [n] markers on these fixtures', () => {
    const withMarkers = 'Consider KBL SOLICITORS LLP [1] and AGH SOLICITORS [2].';
    const without = 'Consider KBL SOLICITORS LLP and AGH SOLICITORS.';
    for (const name of ['KBL SOLICITORS LLP', 'AGH SOLICITORS']) {
      expect(isFirmMentioned(withMarkers, name)).toBe(isFirmMentioned(without, name));
    }
  });
});
