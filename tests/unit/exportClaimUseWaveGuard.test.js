import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/experiments/exportClaimUseSheet.js');

// Run the real script with a DUMMY MONGODB_URI so the guardrails (wave check, D2
// frozen check) are reached — both fire BEFORE any mongoose.connect, so no DB is
// touched. execFileSync throws on a non-zero exit; we assert on that + stderr.
function run(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], {
      env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:0/none' },
      encoding: 'utf8', stdio: 'pipe',
    });
    return { code: 0, stderr: '' };
  } catch (err) {
    return { code: err.status ?? 1, stderr: (err.stderr || '').toString() };
  }
}

describe('exportClaimUseSheet — wave/registry guardrails (no DB touched)', () => {
  it('refuses wave 1 (claim-use is wave >= 2 only; wave 1 is immutable)', () => {
    const { code, stderr } = run(['--study', 'study_2026_09_ai_visibility_content', '--wave', '1']);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/wave >= 2 only/i);
  });

  it('refuses a wave >= 2 export while the committed registry is unfrozen (D2)', () => {
    const { code, stderr } = run(['--study', 'study_2026_09_ai_visibility_content', '--wave', '2']);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/not frozen/i);
  });
});
