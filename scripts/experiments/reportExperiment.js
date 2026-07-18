#!/usr/bin/env node

/**
 * Experiment Report Generator
 *
 * Prints per-group citation/mention rates, per-target breakdown,
 * difference-in-differences for multi-wave studies, and a two-proportion z-test.
 *
 * Usage:
 *   node scripts/experiments/reportExperiment.js --study study_2026_07_exp001
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ExperimentRun from '../../models/ExperimentRun.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

function zTestTwoProportions(x1, n1, x2, n2) {
  if (n1 === 0 || n2 === 0) return { z: null, p: null };
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1 };
  const z = (p1 - p2) / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { z: +z.toFixed(4), p: +p.toFixed(6) };
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

async function main() {
  const args = process.argv.slice(2);
  const studyIdx = args.indexOf('--study');
  if (studyIdx === -1) { console.error('Usage: --study <tag>'); process.exit(1); }
  const study = args[studyIdx + 1];

  await mongoose.connect(MONGODB_URI);

  const runs = await ExperimentRun.find({ study, status: 'ok' }).lean();
  if (runs.length === 0) { console.log(`No runs found for study "${study}"`); await mongoose.disconnect(); return; }

  const waves = [...new Set(runs.map(r => r.wave))].sort((a, b) => a - b);
  const platforms = [...new Set(runs.map(r => r.platform))].sort();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`EXPERIMENT REPORT: ${study}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Total clean runs: ${runs.length} | Waves: ${waves.join(', ')} | Platforms: ${platforms.join(', ')}`);

  for (const wave of waves) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`WAVE ${wave}`);
    console.log(`${'─'.repeat(70)}`);

    const waveRuns = runs.filter(r => r.wave === wave);

    for (const group of ['treatment', 'control']) {
      let totalTargets = 0, totalCited = 0, totalMentioned = 0;
      const perTarget = {};

      for (const run of waveRuns) {
        for (const t of (run.targets || [])) {
          if (t.group !== group) continue;
          totalTargets++;
          if (t.cited) totalCited++;
          if (t.mentioned) totalMentioned++;

          if (!perTarget[t.url]) perTarget[t.url] = { cited: 0, mentioned: 0, total: 0, entity: t.entityName };
          perTarget[t.url].total++;
          if (t.cited) perTarget[t.url].cited++;
          if (t.mentioned) perTarget[t.url].mentioned++;
        }
      }

      const citRate = totalTargets > 0 ? (totalCited / totalTargets * 100).toFixed(1) : '0.0';
      const menRate = totalTargets > 0 ? (totalMentioned / totalTargets * 100).toFixed(1) : '0.0';

      console.log(`\n  ${group.toUpperCase()} (n=${totalTargets} target-observations)`);
      console.log(`    Citation rate: ${citRate}% (${totalCited}/${totalTargets})`);
      console.log(`    Mention rate:  ${menRate}% (${totalMentioned}/${totalTargets})`);

      const targetUrls = Object.keys(perTarget).sort();
      if (targetUrls.length > 0 && targetUrls.length <= 50) {
        console.log(`    Per-target breakdown:`);
        for (const url of targetUrls) {
          const t = perTarget[url];
          const label = t.entity || url.split('/').pop();
          console.log(`      ${label}: cited ${t.cited}/${t.total} (${(t.cited/t.total*100).toFixed(0)}%), mentioned ${t.mentioned}/${t.total} (${(t.mentioned/t.total*100).toFixed(0)}%)`);
        }
      }
    }

    // Z-test on citation rates
    let treatCited = 0, treatTotal = 0, ctrlCited = 0, ctrlTotal = 0;
    for (const run of waveRuns) {
      for (const t of (run.targets || [])) {
        if (t.group === 'treatment') { treatTotal++; if (t.cited) treatCited++; }
        if (t.group === 'control') { ctrlTotal++; if (t.cited) ctrlCited++; }
      }
    }
    const { z, p } = zTestTwoProportions(treatCited, treatTotal, ctrlCited, ctrlTotal);
    console.log(`\n  Z-TEST (treatment vs control citation rates):`);
    console.log(`    Treatment: ${treatTotal > 0 ? (treatCited/treatTotal*100).toFixed(1) : '?'}%  Control: ${ctrlTotal > 0 ? (ctrlCited/ctrlTotal*100).toFixed(1) : '?'}%`);
    console.log(`    z = ${z ?? 'N/A'}  p = ${p ?? 'N/A'}${p !== null && p < 0.05 ? '  *SIGNIFICANT*' : ''}`);
  }

  // Difference-in-differences for multi-wave
  if (waves.length >= 2) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log('DIFFERENCE-IN-DIFFERENCES');
    console.log(`${'─'.repeat(70)}`);

    const firstWave = waves[0];
    const lastWave = waves[waves.length - 1];

    function waveGroupRate(w, group) {
      let cited = 0, total = 0;
      for (const run of runs.filter(r => r.wave === w)) {
        for (const t of (run.targets || [])) {
          if (t.group === group) { total++; if (t.cited) cited++; }
        }
      }
      return total > 0 ? cited / total : 0;
    }

    const treatPre = waveGroupRate(firstWave, 'treatment');
    const treatPost = waveGroupRate(lastWave, 'treatment');
    const ctrlPre = waveGroupRate(firstWave, 'control');
    const ctrlPost = waveGroupRate(lastWave, 'control');

    const treatDiff = treatPost - treatPre;
    const ctrlDiff = ctrlPost - ctrlPre;
    const did = treatDiff - ctrlDiff;

    console.log(`  Treatment: ${(treatPre*100).toFixed(1)}% → ${(treatPost*100).toFixed(1)}% (Δ ${(treatDiff*100).toFixed(1)}pp)`);
    console.log(`  Control:   ${(ctrlPre*100).toFixed(1)}% → ${(ctrlPost*100).toFixed(1)}% (Δ ${(ctrlDiff*100).toFixed(1)}pp)`);
    console.log(`  DiD:       ${(did*100).toFixed(1)}pp${Math.abs(did) > 0.05 ? ' *' : ''}`);
  }

  console.log(`\n${'='.repeat(70)}\n`);
  await mongoose.disconnect();
}

main().catch(err => { console.error('FATAL:', err); mongoose.disconnect().catch(() => {}); process.exit(1); });
