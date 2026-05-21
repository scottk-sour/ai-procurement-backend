/**
 * Live adapter smoke test.
 * Run locally: node scripts/test-directory-adapters.js
 *
 * Tests all 4 directory adapters against Hugh James Solicitors, Cardiff
 * (a large firm known to be listed on Yell, FreeIndex, and Cylex).
 */

import { checkPresence as checkYell } from '../services/listings/directoryAdapters/yell.js';
import { checkPresence as checkFreeindex } from '../services/listings/directoryAdapters/freeindex.js';
import { checkPresence as checkCylex } from '../services/listings/directoryAdapters/cylex.js';
import { checkPresence as checkThomsonLocal } from '../services/listings/directoryAdapters/thomsonLocal.js';

const CANONICAL = {
  name: 'Hugh James',
  address: 'Two Central Square, Central Square',
  postcode: 'CF10 1FS',
  phone: '029 2022 4871',
  website: 'https://www.hughjames.com',
};

console.log('=== Live Directory Adapter Test ===');
console.log(`Firm: ${CANONICAL.name}`);
console.log(`Postcode: ${CANONICAL.postcode}`);
console.log(`Phone: ${CANONICAL.phone}`);
console.log('');

const adapters = [
  { name: 'Yell', fn: checkYell },
  { name: 'FreeIndex', fn: checkFreeindex },
  { name: 'Cylex', fn: checkCylex },
  { name: 'Thomson Local', fn: checkThomsonLocal },
];

for (const adapter of adapters) {
  console.log(`--- ${adapter.name} ---`);
  try {
    const result = await adapter.fn(CANONICAL);
    console.log(`  directory:    ${result.directory}`);
    console.log(`  found:        ${result.found}`);
    console.log(`  confidence:   ${result.confidence}`);
    console.log(`  scrapedName:  ${result.scraped?.name ?? 'null'}`);
    console.log(`  listingUrl:   ${result.listingUrl ?? 'null'}`);
    console.log(`  error:        ${result.error ?? 'null'}`);
    if (result.scraped) {
      console.log(`  scrapedPhone: ${result.scraped.phone || '(empty)'}`);
      console.log(`  scrapedPC:    ${result.scraped.postcode || '(empty)'}`);
      console.log(`  scrapedAddr:  ${result.scraped.address || '(empty)'}`);
    }
  } catch (err) {
    console.log(`  THREW: ${err.message}`);
  }
  console.log('');
}

console.log('=== Done ===');
