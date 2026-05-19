import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import DirectoryListing from '../models/DirectoryListing.js';
import { createApproval } from './approvalQueue.js';
import { submitToBingPlaces } from './directoryAdapters/bingPlaces.js';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

const V1_DIRECTORIES = ['bing_places', 'yell', 'freeindex', 'trustpilot'];
const CONCIERGE_DIRECTORIES = new Set(['yell', 'freeindex', 'trustpilot']);

const REGULATORY_MAP = {
  solicitor: { directory: 'law_society', field: 'sraNumber' },
  accountant: { directory: 'icaew', field: 'icaewFirmNumber' },
  'mortgage-advisor': { directory: 'fca_register', field: 'fcaNumber' },
  'estate-agent': { directory: 'propertymark', field: 'propertymarkNumber' },
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
      summary: `Vendor has ${placeholder} — needs real contact info before directory submission`,
      failureReason: 'placeholder_data',
    });
  }

  if (!vendor.company || !vendor.location?.city || (!vendor.contactInfo?.phone && !vendor.contactInfo?.website)) {
    return AgentRun.create({
      vendorId, agentName: 'listings', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'Missing required fields: company + city + (phone or website)',
      failureReason: 'missing_required_fields',
    });
  }

  const stats = { queued: 0, automated: 0, concierge: 0, alreadyListed: 0, skipped: 0 };

  for (const dir of V1_DIRECTORIES) {
    const existing = await DirectoryListing.findOne({ vendorId, directory: dir });

    if (existing && ['live', 'submitted', 'pending_verification', 'queued'].includes(existing.status)) {
      stats.alreadyListed++;
      continue;
    }
    if (existing && existing.status === 'failed' && existing.retryCount >= 3) {
      stats.skipped++;
      continue;
    }

    if (dir === 'bing_places' && !opts.skipBing) {
      const result = await submitToBingPlaces(vendor);
      await DirectoryListing.findOneAndUpdate(
        { vendorId, directory: dir },
        {
          vendorId, directory: dir,
          status: result.success ? 'submitted' : 'failed',
          submissionMethod: 'api',
          submittedAt: result.success ? new Date() : undefined,
          listingUrl: result.listingUrl || undefined,
          errorReason: result.error || undefined,
          $inc: result.success ? {} : { retryCount: 1 },
        },
        { upsert: true, new: true },
      );
      stats.automated++;
    } else if (CONCIERGE_DIRECTORIES.has(dir)) {
      const listing = await DirectoryListing.findOneAndUpdate(
        { vendorId, directory: dir },
        { vendorId, directory: dir, status: 'queued', submissionMethod: 'concierge' },
        { upsert: true, new: true },
      );

      await createApproval({
        vendorId, agentName: 'listings', itemType: 'directory_submission',
        title: `Submit ${vendor.company} to ${dir.replace(/_/g, ' ')}`,
        draftPayload: {
          directoryName: dir,
          listingId: listing._id,
          vendor: { company: vendor.company, city: vendor.location?.city, website: vendor.contactInfo?.website, phone: vendor.contactInfo?.phone },
        },
        metadata: { listingId: listing._id },
        source: 'listings-agent',
      });
      stats.concierge++;
    }
  }

  const reg = REGULATORY_MAP[vendor.vendorType];
  if (reg) {
    const hasNumber = !!vendor[reg.field];
    await DirectoryListing.findOneAndUpdate(
      { vendorId, directory: reg.directory },
      {
        vendorId, directory: reg.directory,
        status: hasNumber ? 'live' : 'queued',
        submissionMethod: 'auto_regulatory',
        verifiedAt: hasNumber ? new Date() : undefined,
        errorReason: hasNumber ? undefined : `no ${reg.field}`,
      },
      { upsert: true, new: true },
    );
    if (hasNumber) stats.alreadyListed++;
  }

  const parts = [];
  if (stats.automated) parts.push(`${stats.automated} automated (Bing)`);
  if (stats.concierge) parts.push(`${stats.concierge} concierge queued`);
  if (stats.alreadyListed) parts.push(`${stats.alreadyListed} already listed`);
  if (stats.skipped) parts.push(`${stats.skipped} skipped (max retries)`);
  const summary = parts.length ? `${parts.join(', ')}.` : 'No actions taken.';

  const run = await AgentRun.create({
    vendorId, agentName: 'listings', weekStarting: weekStart,
    status: (stats.automated + stats.concierge > 0) ? 'completed' : 'partial',
    startedAt, completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    summary,
    artifacts: {
      ...stats,
      gapsIdentified: 0, gaps: [], competitorsAbove: [],
    },
  });

  return run;
}

export async function runWeeklyListingsCheck() {
  const startTime = Date.now();
  const stats = { scanned: 0, completed: 0, partial: 0, failed: 0 };

  const vendors = await Vendor.find({
    tier: { $in: [...PRO_TIERS] },
  }).select('_id company tier').lean();

  console.log(`[Listings] Starting weekly check for ${vendors.length} vendors`);

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
  console.log(`[Listings] Complete in ${durationMs}ms:`, stats);

  try {
    const { sendEmail } = await import('./emailService.js');
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'scott.davies@tendorai.com',
      subject: `Listings Agent weekly: ${stats.completed} completed, ${stats.partial} partial, ${stats.failed} failed`,
      text: `Listings Agent weekly check completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}`,
      html: `<pre>Listings Agent weekly check completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}</pre>`,
    });
  } catch (err) {
    console.error(`[Listings] Admin email failed:`, err.message);
  }

  return stats;
}
