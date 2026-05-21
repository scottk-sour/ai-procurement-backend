import { isSameFirm } from '../platformQuery/nameMatch.js';

function normalisePhone(raw) {
  if (!raw) return '';
  return raw.replace(/\s+/g, '').replace(/^\+44/, '0').replace(/[^\d]/g, '');
}

function normalisePostcode(raw) {
  if (!raw) return '';
  return raw.replace(/\s+/g, '').toUpperCase();
}

function addressTokens(raw) {
  if (!raw) return [];
  return raw.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

export function compareNap(canonicalNap, scraped) {
  if (!scraped) {
    return {
      name: 'unverifiable',
      postcode: 'unverifiable',
      phone: 'unverifiable',
      address: 'unverifiable',
    };
  }

  let nameStatus = 'unverifiable';
  if (canonicalNap.name && scraped.name) {
    nameStatus = isSameFirm(scraped.name, canonicalNap.name) ? 'match' : 'name_variation';
  }

  let postcodeStatus = 'unverifiable';
  if (canonicalNap.postcode && scraped.postcode) {
    postcodeStatus = normalisePostcode(canonicalNap.postcode) === normalisePostcode(scraped.postcode)
      ? 'match' : 'mismatch';
  }

  let phoneStatus = 'unverifiable';
  if (canonicalNap.phone && scraped.phone) {
    phoneStatus = normalisePhone(canonicalNap.phone) === normalisePhone(scraped.phone)
      ? 'match' : 'phone_mismatch';
  }

  let addressStatus = 'unverifiable';
  if (canonicalNap.address && scraped.address) {
    const canonical = addressTokens(canonicalNap.address);
    const listed = addressTokens(scraped.address);
    if (canonical.length > 0 && listed.length > 0) {
      const overlap = canonical.filter(t => listed.includes(t)).length;
      const ratio = overlap / Math.max(canonical.length, 1);
      addressStatus = ratio >= 0.4 ? 'match' : 'address_variation';
    }
  }

  return { name: nameStatus, postcode: postcodeStatus, phone: phoneStatus, address: addressStatus };
}
