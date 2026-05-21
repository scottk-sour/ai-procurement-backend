import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import DirectoryListing from '../models/DirectoryListing.js';
import { getCanonicalNap } from './listings/canonicalNap.js';
import { compareNap } from './listings/napConsistency.js';
import { checkPresence as checkYell } from './listings/directoryAdapters/yell.js';
import { checkPresence as checkFreeindex } from './listings/directoryAdapters/freeindex.js';
import { checkPresence as checkCylex } from './listings/directoryAdapters/cylex.js';
import { checkPresence as checkThomsonLocal } from './listings/directoryAdapters/thomsonLocal.js';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

const AUDIT_DIRECTORIES = [
  { key: 'yell', label: 'Yell.com', check: checkYell },
  { key: 'freeindex', label: 'FreeIndex', check: checkFreeindex },
  { key: 'cylex', label: 'Cylex', check: checkCylex },
  { key: 'thomson_local', label: 'Thomson Local', check: checkThomsonLocal },
];

const REGULATORY_MAP = {
  solicitor: { directory: 'law_society', field: 'sraNumber' },
  accountant: { directory: 'icaew', field: 'icaewFirmNumber' },
  'mortgage-advisor': { directory: 'fca_register', field: 'fcaNumber' },
  'estate-agent': { directory: 'propertymark', field: 'propertymarkNumber' },
};

const DIRECTORY_LABELS = {
  yell: 'Yell.com', freeindex: 'FreeIndex', cylex: 'Cylex',
  thomson_local: 'Thomson Local', law_society: 'Law Society',
  icaew: 'ICAEW', fca_register: 'FCA Register', propertymark: 'Propertymark',
};

function hasPlaceholderData(vendor) {
  const website = vendor.contactInfo?.website || '';
  if (/\.(example\.com|test|invalid)$/i.test(website)) return 'placeholder website';
  if ((vendor.email || '').endsWith('@placeholder.tendorai.com')) return 'placeholder email';
  if ((vendor.company || '').startsWith('TendorAI Demo')) return 'demo vendor';
  return null;
}

export async function runListingsForVendor(vendorId, opts = {}) {
  const startedAt = new Date();
  const weekStart = AgentRun.normaliseWeekStarting(new Date());

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  if (!PRO_TIERS.has(vendor.tier)) {
    return AgentRun.create({
      vendorId, agentName: 'listings', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'Vendor not on Pro tier', failureReason: 'not_pro_tier',
    });
  }

  const placeholder = hasPlaceholderData(vendor);
  if (placeholder) {
    return AgentRun.create({
      vendorId, agentName: 'listings', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: `Vendor has ${placeholder} — needs real contact info before directory audit`,
      failureReason: 'placeholder_data',
    });
  }

  if (!vendor.company || !vendor.location?.city) {
    return AgentRun.create({
      vendorId, agentName: 'listings', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'Missing required fields: company + city',
      failureReason: 'missing_required_fields',
    });
  }

  const canonicalNap = getCanonicalNap(vendor);
  const stats = { checked: 0, found: 0, notFound: 0, undetermined: 0, napIssues: 0 };
  const findings = [];

  for (const dir of AUDIT_DIRECTORIES) {
    stats.checked++;
    let result;
    try {
      result = await dir.check(canonicalNap);
    } catch (err) {
      console.error(`[Listings] ${dir.key} adapter threw for ${vendor.company}:`, err.message);
      result = { directory: dir.key, found: null, confidence: 0, listingUrl: null, scraped: null, error: err.message };
    }

    let status = 'undetermined';
    if (result.found === true) { status = 'found'; stats.found++; }
    else if (result.found === false) { status = 'not_found'; stats.notFound++; }
    else { stats.undetermined++; }

    let napResult = null;
    if (result.found === true && result.scraped) {
      napResult = compareNap(canonicalNap, result.scraped);
      if (napResult.phone === 'phone_mismatch' || napResult.postcode === 'mismatch') {
        stats.napIssues++;
      }
    }

    await DirectoryListing.findOneAndUpdate(
      { vendorId, directory: dir.key },
      {
        vendorId, directory: dir.key,
        status,
        auditMode: true,
        presenceConfidence: result.confidence || 0,
        listingUrl: result.listingUrl || undefined,
        scrapedName: result.scraped?.name || undefined,
        scrapedPhone: result.scraped?.phone || undefined,
        scrapedPostcode: result.scraped?.postcode || undefined,
        napNameStatus: napResult?.name || null,
        napPhoneStatus: napResult?.phone || null,
        napPostcodeStatus: napResult?.postcode || null,
        errorReason: result.error || undefined,
        lastCheckedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    if (status === 'not_found') {
      findings.push({
        category: 'directory_presence',
        severity: 'medium',
        evidence: `Not found on ${dir.label} — adding a listing increases the sources AI assistants can cite.`,
        recommendation: `Create a listing on ${dir.label} for ${vendor.company}.`,
        downstreamAgent: 'listings',
      });
    } else if (status === 'undetermined' && result.error) {
      findings.push({
        category: 'directory_presence',
        severity: 'low',
        evidence: `Couldn't automatically check ${dir.label} — worth a manual look.`,
        recommendation: `Search for ${vendor.company} on ${dir.label} manually.`,
        downstreamAgent: null,
      });
    }

    if (napResult?.phone === 'phone_mismatch') {
      findings.push({
        category: 'nap_inconsistency',
        severity: 'medium',
        evidence: `Phone on ${dir.label} (${result.scraped?.phone || '?'}) differs from your confirmed number (${canonicalNap.phone}) — inconsistent contact details reduce trust signals.`,
        recommendation: `Update your phone number on ${dir.label} to match your confirmed number.`,
        downstreamAgent: null,
      });
    }

    if (napResult?.postcode === 'mismatch') {
      findings.push({
        category: 'nap_inconsistency',
        severity: 'medium',
        evidence: `Postcode on ${dir.label} (${result.scraped?.postcode || '?'}) differs from ${canonicalNap.postcode}.`,
        recommendation: `Update your postcode on ${dir.label}.`,
        downstreamAgent: null,
      });
    }
  }

  // Name variation across multiple directories
  const nameVariations = [];
  for (const dir of AUDIT_DIRECTORIES) {
    const listing = await DirectoryListing.findOne({ vendorId, directory: dir.key, auditMode: true }).lean();
    if (listing?.napNameStatus === 'name_variation') {
      nameVariations.push(dir.label);
    }
  }
  if (nameVariations.length >= 2) {
    findings.push({
      category: 'nap_inconsistency',
      severity: 'low',
      evidence: `Your firm name appears differently across ${nameVariations.length} directories (${nameVariations.join(', ')}) — consistent naming strengthens recognition.`,
      recommendation: 'Update your business name to be consistent across all directories.',
      downstreamAgent: null,
    });
  }

  // Regulatory presence
  const reg = REGULATORY_MAP[vendor.vendorType];
  if (reg) {
    const hasNumber = !!vendor[reg.field];
    if (hasNumber) {
      stats.checked++;
      stats.found++;
      await DirectoryListing.findOneAndUpdate(
        { vendorId, directory: reg.directory },
        {
          vendorId, directory: reg.directory,
          status: 'found',
          auditMode: true,
          presenceConfidence: 1.0,
          lastCheckedAt: new Date(),
        },
        { upsert: true, new: true },
      );
    }
  }

  const hasUndetermined = stats.undetermined > 0;
  const parts = [];
  if (stats.found) parts.push(`${stats.found} found`);
  if (stats.notFound) parts.push(`${stats.notFound} not found`);
  if (stats.undetermined) parts.push(`${stats.undetermined} undetermined`);
  if (stats.napIssues) parts.push(`${stats.napIssues} NAP issues`);
  const summary = parts.length
    ? `Checked ${stats.checked} directories: ${parts.join(', ')}.`
    : 'No directories checked.';

  const run = await AgentRun.create({
    vendorId, agentName: 'listings', weekStarting: weekStart,
    status: hasUndetermined ? 'partial' : 'completed',
    startedAt, completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    summary,
    artifacts: {
      ...stats,
      findings,
      gapsIdentified: findings.length,
      gaps: findings.slice(0, 3).map(f => f.recommendation),
      competitorsAbove: [],
    },
  });

  return run;
}

export async function runWeeklyListingsCheck() {
  const startTime = Date.now();
  const stats = { scanned: 0, completed: 0, partial: 0, failed: 0 };

  const vendors = await Vendor.find({
    tier: { $in: [...PRO_TIERS] },
  }).select('_id company tier vendorType sraNumber icaewFirmNumber fcaNumber propertymarkNumber location contactInfo email firmData').lean();

  console.log(`[Listings] Starting weekly directory audit for ${vendors.length} vendors`);

  for (const vendor of vendors) {
    try {
      const run = await runListingsForVendor(vendor._id);
      stats.scanned++;
      stats[run.status] = (stats[run.status] || 0) + 1;
      console.log(`[Listings] ${vendor.company}: ${run.status} — ${run.summary}`);
    } catch (err) {
      console.error(`[Listings] ${vendor.company} failed:`, err.message);
      stats.failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Listings] Audit complete in ${durationMs}ms:`, stats);

  try {
    const { sendEmail } = await import('./emailService.js');
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'scott.davies@tendorai.com',
      subject: `Listings Audit weekly: ${stats.completed} completed, ${stats.partial} partial, ${stats.failed} failed`,
      text: `Listings directory audit completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}`,
      html: `<pre>Listings directory audit completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}</pre>`,
    });
  } catch (err) {
    console.error(`[Listings] Admin email failed:`, err.message);
  }

  return stats;
}
