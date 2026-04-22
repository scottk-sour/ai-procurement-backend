/**
 * Diagnostic: show what Google Places Text Search v1 actually returns for
 * three variations of the TendorAI lookup, and confirm which (companyName,
 * city) pair reaches checkGoogleBusinessProfile when the public AEO report
 * runs.
 *
 * Throwaway. Do not merge to main. Run once, capture output, delete branch.
 *
 *   GOOGLE_PLACES_API_KEY=... node scripts/diagnose-gbp.js
 *
 * Never logs the API key.
 */

import axios from 'axios';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
].join(',');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('FATAL: GOOGLE_PLACES_API_KEY is not set in process.env.');
  console.error('Set it before running this script (same env var as services/googleBusinessProfile.js).');
  process.exit(1);
}

// Copy of normalizeForMatch from services/googleBusinessProfile.js (PR #29).
// Duplicated here because it's not exported.
function normalizeForMatch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function containsCity(place, city) {
  const needle = normalizeForMatch(city);
  const fields = {
    formattedAddress: typeof place?.formattedAddress === 'string' ? place.formattedAddress : '',
    shortFormattedAddress: typeof place?.shortFormattedAddress === 'string' ? place.shortFormattedAddress : '',
    displayNameText: typeof place?.displayName?.text === 'string' ? place.displayName.text : '',
  };
  const perField = {};
  for (const [k, v] of Object.entries(fields)) {
    perField[k] = normalizeForMatch(v).includes(needle);
  }
  const anyMatch = Object.values(perField).some(Boolean);
  return { anyMatch, perField };
}

async function runQuery(label, textQuery, cityForMatch) {
  console.log('\n' + '='.repeat(72));
  console.log(`QUERY ${label}`);
  console.log('='.repeat(72));
  console.log(`textQuery sent:   ${JSON.stringify(textQuery)}`);
  console.log(`city for match:   ${JSON.stringify(cityForMatch)}`);

  let resp;
  try {
    resp = await axios.post(
      ENDPOINT,
      { textQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        timeout: 10000,
        validateStatus: () => true,
      },
    );
  } catch (err) {
    console.log(`HTTP error:       ${err.code || err.message}`);
    return;
  }

  console.log(`HTTP status:      ${resp.status}`);
  if (resp.status < 200 || resp.status >= 300) {
    const body = typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data);
    console.log(`Response body:    ${body.slice(0, 400)}`);
    return;
  }

  const places = Array.isArray(resp.data?.places) ? resp.data.places : [];
  console.log(`Places returned:  ${places.length}`);

  places.forEach((place, i) => {
    console.log(`\n  [${i}] displayName.text:        ${JSON.stringify(place?.displayName?.text ?? null)}`);
    console.log(`      formattedAddress:        ${JSON.stringify(place?.formattedAddress ?? null)}`);
    console.log(`      shortFormattedAddress:   ${JSON.stringify(place?.shortFormattedAddress ?? null)}`);
    console.log(`      primaryType:             ${JSON.stringify(place?.primaryType ?? null)}`);
    console.log(`      types:                   ${JSON.stringify(place?.types ?? null)}`);
    console.log(`      rating / userRatingCount: ${place?.rating ?? 'n/a'} / ${place?.userRatingCount ?? 'n/a'}`);
    const { anyMatch, perField } = containsCity(place, cityForMatch);
    console.log(`      normalizeForMatch("${cityForMatch}") present in any field?  ${anyMatch}`);
    console.log(`        - formattedAddress:      ${perField.formattedAddress}`);
    console.log(`        - shortFormattedAddress: ${perField.shortFormattedAddress}`);
    console.log(`        - displayName.text:      ${perField.displayNameText}`);
  });
}

function traceCallChain() {
  console.log('\n' + '='.repeat(72));
  console.log('CALL CHAIN TRACE');
  console.log('='.repeat(72));
  console.log('Form submission: { companyName: "TendorAI LTD", city: "Cwmbran",');
  console.log('                   websiteUrl: "https://www.tendorai.com", ... }');
  console.log('');
  console.log('routes/publicVendorRoutes.js:1425');
  console.log('  const { companyName, category, city, email, name, source,');
  console.log('          customIndustry, websiteUrl } = req.body;');
  console.log('  → companyName = "TendorAI LTD"');
  console.log('  → city        = "Cwmbran"');
  console.log('  (no transformation)');
  console.log('');
  console.log('routes/publicVendorRoutes.js:1477');
  console.log('  await buildPublicReport({ companyName, category, city, email,');
  console.log('                            websiteUrl, name, source, customIndustry });');
  console.log('');
  console.log('services/publicAeoReportBuilder.js:419 (buildPublicReport)');
  console.log('  destructures the same params, no transformation applied.');
  console.log('');
  console.log('services/publicAeoReportBuilder.js:468');
  console.log('  const gbp = await checkGoogleBusinessProfile(companyName, city);');
  console.log('  → ACTUAL ARGS: checkGoogleBusinessProfile("TendorAI LTD", "Cwmbran")');
  console.log('');
  console.log('services/publicAeoReportBuilder.js:472');
  console.log('  const reviews = await checkGoogleReviews(companyName, city);');
  console.log('  → ACTUAL ARGS: checkGoogleReviews("TendorAI LTD", "Cwmbran")');
  console.log('');
  console.log('services/googleBusinessProfile.js:132');
  console.log('  textQuery: `${companyName} ${city}`');
  console.log('  → ACTUAL textQuery SENT TO PLACES: "TendorAI LTD Cwmbran"');
}

async function main() {
  traceCallChain();
  await runQuery('A — clean (no suffix)', 'TendorAI Cwmbran', 'Cwmbran');
  await runQuery('B — with LTD',          'TendorAI LTD Cwmbran', 'Cwmbran');
  await runQuery('C — name only',         'TendorAI', 'Cwmbran');
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Unhandled error:', err.message);
  process.exit(1);
});
