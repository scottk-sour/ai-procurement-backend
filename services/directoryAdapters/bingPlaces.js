// DEAD: bingplaces.com has no public submission API. Not used by the audit. Scheduled for removal.
import logger from '../logger.js';

export async function submitToBingPlaces(vendor) {
  const apiKey = process.env.BING_PLACES_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'BING_PLACES_API_KEY not configured' };
  }

  const payload = {
    Title: vendor.company,
    AddressLine: vendor.location?.address || '',
    City: vendor.location?.city || '',
    Zip: vendor.location?.postcode || '',
    CountryRegion: 'GB',
    Phone: vendor.contactInfo?.phone || '',
    Website: vendor.contactInfo?.website || '',
    Description: (vendor.businessProfile?.description || '').substring(0, 500),
  };

  try {
    const response = await fetch('https://www.bingplaces.com/api/v1/businesses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 201 || response.status === 202) {
      const data = await response.json().catch(() => ({}));
      logger.info(`[BingPlaces] Submitted ${vendor.company} — status ${response.status}`);
      return { success: true, listingUrl: data.url || data.listingUrl || null };
    }

    const body = await response.text().catch(() => '');
    logger.error(`[BingPlaces] Submit failed for ${vendor.company} — status ${response.status}: ${body}`);
    return { success: false, error: `HTTP ${response.status}: ${body}` };
  } catch (err) {
    logger.error(`[BingPlaces] Submit error for ${vendor.company}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
