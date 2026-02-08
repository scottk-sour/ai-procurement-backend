// AI Intelligence Audit — tests the 3 weaknesses identified in the original 4/10 score
// 1. NLU: Does the query field get parsed into structured params?
// 2. Distance: Is _distance populated (not null) for vendors with coordinates?
// 3. Category coverage: Do Telecoms, CCTV, IT return products with pricing?
//
// Usage: node scripts/aiAudit.js

const BASE = 'https://ai-procurement-backend-q35u.onrender.com/api/ai-query';

async function post(body) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function score(label, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${label}${detail ? ' — ' + detail : ''}`);
  return pass ? 1 : 0;
}

async function runAudit() {
  let total = 0;
  let maxScore = 0;

  console.log('\n========================================');
  console.log('  TendorAI AI Intelligence Audit');
  console.log('========================================\n');

  // ── 1. NLU PARSING (3 tests) ─────────────────────────────
  console.log('1. NLU PARSING — Does free-text query get parsed?\n');

  // 1a. Photocopier free-text
  maxScore += 1;
  try {
    const r1 = await post({ query: 'I need a colour A3 copier for about 8000 pages a month near Newport' });
    const hasColour = r1.filters?.colour === true;
    const hasA3 = r1.filters?.a3 === true;
    const hasVol = r1.filters?.volume === 8000 || r1.metadata?.monthlyVolume === 8000;
    const pass = hasColour && hasA3 && hasVol;
    total += score('NLU extracts colour, a3, volume from copier query', pass,
      `colour=${r1.filters?.colour}, a3=${r1.filters?.a3}, volume=${r1.filters?.volume || r1.metadata?.monthlyVolume}`);
  } catch (e) { score('NLU copier query', false, e.message); }

  // 1b. Telecoms free-text — category + numberOfUsers
  maxScore += 1;
  try {
    const r2 = await post({ query: 'We need VoIP phones for 20 staff in Cardiff' });
    const isTelecoms = r2.followUp?.some(q => q.field === 'systemType' || q.field === 'broadband');
    const hasUsers = r2.answeredFields?.includes('numberOfUsers');
    const pass = isTelecoms && hasUsers;
    total += score('NLU detects Telecoms category + numberOfUsers from free text', pass,
      `telecomsQuestions=${isTelecoms}, answeredFields=${JSON.stringify(r2.answeredFields)}`);
  } catch (e) { score('NLU telecoms query', false, e.message); }

  // 1c. Free-text with no explicit params — should still return results
  maxScore += 1;
  try {
    const r3 = await post({ query: 'I need 8 security cameras for my warehouse in Bristol' });
    const isCCTV = r3.followUp?.some(q => q.field === 'numberOfCameras' || q.field === 'cameraLocation' || q.field === 'monitoring');
    const hasResults = r3.count > 0;
    const pass = isCCTV && hasResults;
    total += score('NLU detects CCTV category from free text', pass,
      `cctvQuestions=${isCCTV}, count=${r3.count}`);
  } catch (e) { score('NLU CCTV query', false, e.message); }

  // ── 2. DISTANCE SCORING (2 tests) ────────────────────────
  console.log('\n2. DISTANCE SCORING — Is distance calculated, not null?\n');

  // 2a. Vendor with coordinates should have _distance populated
  maxScore += 1;
  try {
    const r4 = await post({ category: 'Photocopiers', postcode: 'NP44', requirements: { specificVolume: 5000 } });
    const hasLocationProximity = r4.vendors?.some(v => v.scoreBreakdown?.locationProximity !== 0);
    total += score('locationProximity scoring is non-zero for at least one vendor', hasLocationProximity,
      `vendors: ${r4.vendors?.map(v => `${v.company}: locProx=${v.scoreBreakdown?.locationProximity}`).join(', ')}`);
  } catch (e) { score('Distance scoring', false, e.message); }

  // 2b. Location-based reasons appear
  maxScore += 1;
  try {
    const r5 = await post({ category: 'Telecoms', postcode: 'NP44', requirements: { numberOfUsers: 15 } });
    const hasLocationReason = r5.vendors?.some(v =>
      v.whyRecommended?.includes('nearby') ||
      v.whyRecommended?.includes('Local') ||
      v.whyRecommended?.includes('National') ||
      v.whyRecommended?.includes('local')
    );
    total += score('Location-based reasons in whyRecommended', hasLocationReason,
      `reasons: ${r5.vendors?.slice(0, 3).map(v => `"${v.whyRecommended?.substring(0, 50)}"`).join(', ')}`);
  } catch (e) { score('Location reasons', false, e.message); }

  // ── 3. CATEGORY COVERAGE — Products + Pricing (4 tests) ──
  console.log('\n3. CATEGORY COVERAGE — Do all categories return products with pricing?\n');

  // 3a. Photocopiers
  maxScore += 1;
  try {
    const r6 = await post({ category: 'Photocopiers', postcode: 'NP44', requirements: { specificVolume: 5000, colour: true } });
    const hasProduct = r6.vendors?.some(v => v.product !== null);
    const hasPricing = r6.vendors?.some(v => v.pricing !== null);
    total += score('Photocopiers: product + pricing returned', hasProduct && hasPricing,
      `withProduct=${r6.vendors?.filter(v => v.product).length}, withPricing=${r6.summary?.withPricing}`);
  } catch (e) { score('Photocopiers coverage', false, e.message); }

  // 3b. Telecoms
  maxScore += 1;
  try {
    const r7 = await post({ category: 'Telecoms', postcode: 'NP44', requirements: { numberOfUsers: 15 } });
    const hasProduct = r7.vendors?.some(v => v.product !== null);
    const hasPricing = r7.vendors?.some(v => v.pricing !== null);
    total += score('Telecoms: product + pricing returned', hasProduct && hasPricing,
      `withProduct=${r7.vendors?.filter(v => v.product).length}, withPricing=${r7.summary?.withPricing}`);
  } catch (e) { score('Telecoms coverage', false, e.message); }

  // 3c. CCTV
  maxScore += 1;
  try {
    const r8 = await post({ category: 'CCTV', postcode: 'NP44', requirements: { numberOfCameras: 8 } });
    const hasProduct = r8.vendors?.some(v => v.product !== null);
    const hasPricing = r8.vendors?.some(v => v.pricing !== null);
    total += score('CCTV: product + pricing returned', hasProduct && hasPricing,
      `withProduct=${r8.vendors?.filter(v => v.product).length}, withPricing=${r8.summary?.withPricing}`);
  } catch (e) { score('CCTV coverage', false, e.message); }

  // 3d. IT
  maxScore += 1;
  try {
    const r9 = await post({ category: 'IT', postcode: 'NP44', requirements: { numberOfUsers: 25 } });
    const hasProduct = r9.vendors?.some(v => v.product !== null);
    const hasPricing = r9.vendors?.some(v => v.pricing !== null);
    total += score('IT: product + pricing returned', hasProduct && hasPricing,
      `withProduct=${r9.vendors?.filter(v => v.product).length}, withPricing=${r9.summary?.withPricing}`);
  } catch (e) { score('IT coverage', false, e.message); }

  // ── 4. RESPONSE QUALITY (3 tests) ────────────────────────
  console.log('\n4. RESPONSE QUALITY — Scoring, badges, follow-ups\n');

  // 4a. Best Match badge assigned
  maxScore += 1;
  try {
    const r10 = await post({ category: 'Telecoms', postcode: 'NP44', requirements: { numberOfUsers: 15 } });
    const hasBadge = r10.vendors?.some(v => v.badge === 'Best Match');
    total += score('Best Match badge assigned to top vendor', hasBadge,
      `badges: ${r10.vendors?.map(v => v.badge).filter(Boolean).join(', ') || 'none'}`);
  } catch (e) { score('Badge assignment', false, e.message); }

  // 4b. Follow-up questions are category-appropriate
  maxScore += 1;
  try {
    const r11 = await post({ category: 'CCTV', postcode: 'NP44', requirements: { numberOfCameras: 4 } });
    const cctvFields = ['cameraLocation', 'monitoring', 'resolution', 'storage'];
    const hasCctvQuestions = cctvFields.some(f => r11.followUp?.some(q => q.field === f));
    total += score('Follow-up questions match category (CCTV)', hasCctvQuestions,
      `fields: ${r11.followUp?.map(q => q.field).join(', ')}`);
  } catch (e) { score('Category questions', false, e.message); }

  // 4c. answeredFields tracks NLU-extracted fields
  maxScore += 1;
  try {
    const r12 = await post({ query: 'I need a colour A3 copier for about 8000 pages a month near Newport' });
    const tracksColour = r12.answeredFields?.includes('colour');
    const tracksA3 = r12.answeredFields?.includes('a3');
    const pass = tracksColour && tracksA3;
    total += score('answeredFields includes NLU-extracted colour + a3', pass,
      `answeredFields: ${JSON.stringify(r12.answeredFields)}`);
  } catch (e) { score('Answered fields tracking', false, e.message); }

  // ── FINAL SCORE ───────────────────────────────────────────
  const pct = Math.round((total / maxScore) * 10);
  console.log('\n========================================');
  console.log(`  AUDIT SCORE: ${total}/${maxScore} tests passed (${pct}/10)`);
  console.log('========================================');
  console.log(`  Previous score: 4/10`);
  console.log(`  Current score:  ${pct}/10`);
  console.log('========================================\n');
}

runAudit().catch(e => console.error('Audit failed:', e));
