import crypto from 'crypto';
import Vendor from '../../models/Vendor.js';

function deterministicPick(candidates, count, seedString) {
  if (candidates.length <= count) return candidates;
  const seed = crypto.createHash('md5').update(seedString).digest('hex');
  const indexed = candidates.map((c, i) => ({
    item: c,
    sortKey: crypto.createHash('md5').update(seed + i).digest('hex'),
  }));
  indexed.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return indexed.slice(0, count).map(x => x.item);
}

export async function selectCompetitors(vendor, maxCount = 3) {
  const baseFilter = {
    _id: { $ne: vendor._id },
    vendorType: vendor.vendorType,
  };

  const cityCandidates = await Vendor.find({ ...baseFilter, 'location.city': vendor.location?.city })
    .select('_id company slug vendorType location')
    .limit(30)
    .lean();

  if (cityCandidates.length >= maxCount) {
    return deterministicPick(cityCandidates, maxCount, String(vendor._id));
  }

  const regionCandidates = await Vendor.find({ ...baseFilter, 'location.region': vendor.location?.region })
    .select('_id company slug vendorType location')
    .limit(30)
    .lean();

  const combined = [...cityCandidates, ...regionCandidates.filter(r =>
    !cityCandidates.some(c => String(c._id) === String(r._id))
  )];

  return deterministicPick(combined, maxCount, String(vendor._id));
}

export { deterministicPick };
