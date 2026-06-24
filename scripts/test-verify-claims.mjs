import dotenv from 'dotenv';
dotenv.config();

const { verifyClaims } = await import('../services/contentReview/verifyClaims.js');

const BAD_DRAFT = 'The Property Ombudsman provides independent redress, a legal requirement under the Estate Agents Act 1979.';
const GOOD_DRAFT = 'Independent redress is required for all estate agents under the Consumers, Estate Agents and Redress Act 2007.';

console.log('=== BAD DRAFT ===');
console.log('Input:', BAD_DRAFT);
const bad = await verifyClaims({ draftText: BAD_DRAFT, vertical: 'estate-agent' });
console.log('Result:', JSON.stringify(bad, null, 2));

console.log('\n=== GOOD DRAFT ===');
console.log('Input:', GOOD_DRAFT);
const good = await verifyClaims({ draftText: GOOD_DRAFT, vertical: 'estate-agent' });
console.log('Result:', JSON.stringify(good, null, 2));
