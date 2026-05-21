import Vendor from '../models/Vendor.js';
import AgentRun from '../models/AgentRun.js';
import AIMentionScan from '../models/AIMentionScan.js';
import AeoReport from '../models/AeoReport.js';
import VendorProduct from '../models/VendorProduct.js';
import { filterRealCompetitors } from './reporter/filterRealCompetitors.js';
import Review from '../models/Review.js';
import { calculateVisibilityScore } from '../utils/visibilityScore.js';

const PRO_TIERS = new Set(['pro', 'managed', 'verified', 'enterprise']);

export async function runDetectiveForVendor(vendorId) {
  const startedAt = new Date();
  const weekStart = AgentRun.normaliseWeekStarting(new Date());

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  if (!PRO_TIERS.has(vendor.tier)) {
    return AgentRun.create({
      vendorId, agentName: 'detective', weekStarting: weekStart,
      status: 'failed', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'Vendor not on Pro tier', failureReason: 'not_pro_tier',
    });
  }

  const scans = await AIMentionScan.find({
    vendorId, scanDate: { $gte: weekStart }, platform: { $ne: null },
  }).lean();

  if (scans.length === 0) {
    return AgentRun.create({
      vendorId, agentName: 'detective', weekStarting: weekStart,
      status: 'partial', startedAt, completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: 'No Reconnaissance data this week — Detective will run again next week',
      artifacts: { reason: 'no_recon_data' },
    });
  }

  const okScans = scans.filter(s => s.status !== 'error' && s.status !== 'timeout');
  const platforms = {};
  for (const s of okScans) {
    if (s.platform && !platforms[s.platform]) platforms[s.platform] = false;
    if (s.platform && s.mentioned === true) platforms[s.platform] = true;
  }
  const uniquePlatforms = Object.keys(platforms).length;
  const platformsCited = Object.values(platforms).filter(v => v).length;
  const mentioned = okScans.filter(s => s.mentioned === true).length;
  const notMentioned = okScans.filter(s => s.mentioned === false).length;
  const errorCount = scans.length - okScans.length;
  const mentionSummary = { mentioned, notMentioned, errorCount, platforms, totalScans: scans.length, platformsCited, uniquePlatforms };

  const rawCompCounts = {};
  const rawCompPlatforms = {};
  for (const s of scans) {
    for (const c of (s.competitorsMentioned || [])) {
      rawCompCounts[c] = (rawCompCounts[c] || 0) + 1;
      if (!rawCompPlatforms[c]) rawCompPlatforms[c] = new Set();
      if (s.platform) rawCompPlatforms[c].add(s.platform);
    }
  }
  const realFirms = await filterRealCompetitors(Object.keys(rawCompCounts), { category: vendor.vendorType });
  const topCompetitors = realFirms
    .map(f => ({
      name: f.name, citationCount: rawCompCounts[f.raw] || 0,
      platforms: [...(rawCompPlatforms[f.raw] || [])],
    }))
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 5);

  let scoreData = null;
  try {
    const products = await VendorProduct.find({
      $or: [{ vendorId }, { vendorId: vendorId.toString() }], isActive: { $ne: false },
    }).lean();
    const reviewAgg = await Review.aggregate([
      { $match: { vendor: vendor._id, status: 'approved' } },
      { $group: { _id: null, reviewCount: { $sum: 1 }, averageRating: { $avg: '$rating' } } },
    ]);
    const reviewData = reviewAgg[0] || { reviewCount: 0, averageRating: 0 };
    const mentionData = {
      mentionsThisWeek: mentioned, mentionsLastWeek: 0, totalMentions30d: mentioned, avgPosition: null,
    };
    scoreData = calculateVisibilityScore(vendor, products, mentionData, reviewData);
  } catch (err) {
    console.error(`[Detective] Score calculation failed for ${vendor.company}:`, err.message);
  }

  let aeoGaps = [];
  try {
    const aeoReport = await AeoReport.findOne({ vendorId }).sort({ createdAt: -1 }).select('gaps').lean();
    if (aeoReport?.gaps && Array.isArray(aeoReport.gaps)) {
      aeoGaps = aeoReport.gaps.slice(0, 5);
    }
  } catch (err) {
    console.error(`[Detective] AeoReport lookup failed for ${vendor.company}:`, err.message);
  }

  const findings = [];

  const silentPlatforms = Object.entries(platforms).filter(([, v]) => !v).map(([k]) => k);
  for (const p of silentPlatforms.slice(0, 2)) {
    const platformScans = scans.filter(s => s.platform === p);
    const topOnPlatform = platformScans.flatMap(s => s.competitorsMentioned || []);
    const topCompCount = {};
    for (const c of topOnPlatform) topCompCount[c] = (topCompCount[c] || 0) + 1;
    const topComp = Object.keys(topCompCount).length
      ? Object.entries(topCompCount).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    findings.push({
      category: 'platform_silence', severity: 'high', platform: p,
      evidence: `Not mentioned by ${p} on any of ${platformScans.length} queries this week`,
      recommendation: topComp
        ? `Investigate why ${p} doesn't recommend you — top competitor was ${topComp}`
        : `Investigate why ${p} doesn't recommend you — no specific firms were named in responses, suggesting ${p} couldn't find authoritative information for this query`,
      downstreamAgent: null,
    });
  }

  for (const gap of aeoGaps) {
    if (findings.length >= 5) break;
    findings.push({
      category: 'website_gap', severity: (gap.impact || 0) >= 10 ? 'high' : 'medium',
      evidence: gap.explanation || gap.title || '',
      recommendation: `Fix on your website: ${gap.title}`,
      downstreamAgent: gap.key === 'schema' ? 'builder' : null,
    });
  }

  if (scoreData?.tips) {
    for (const tip of scoreData.tips) {
      if (findings.length >= 5) break;
      findings.push({
        category: tip.category || 'general', severity: tip.impact === 'high' ? 'medium' : 'low',
        evidence: tip.message,
        recommendation: tip.action || 'See your dashboard for details',
        downstreamAgent: tip.category === 'reviews' ? 'reviews' : null,
      });
    }
  }

  // Directory presence + NAP findings from Listings audit
  const directoryGapStrings = [];
  try {
    const { default: DirectoryListing } = await import('../models/DirectoryListing.js');
    const listings = await DirectoryListing.find({ vendorId }).lean();
    const presentDirectories = new Set(
      listings.filter(l => l.status === 'found' || l.status === 'live').map(l => l.directory),
    );
    const importantDirectories = [
      { key: 'yell', name: 'Yell.com', severity: 'medium' },
      { key: 'freeindex', name: 'FreeIndex', severity: 'medium' },
      { key: 'cylex', name: 'Cylex', severity: 'low' },
      { key: 'thomson_local', name: 'Thomson Local', severity: 'low' },
    ];
    for (const dir of importantDirectories) {
      const listing = listings.find(l => l.directory === dir.key);
      if (listing?.status === 'not_found') {
        const gap = `Not found on ${dir.name} — adding a listing increases the sources AI assistants can cite`;
        directoryGapStrings.push(gap);
        if (findings.length < 5) {
          findings.push({
            category: 'directory_presence', severity: dir.severity,
            evidence: gap,
            recommendation: `Create a listing on ${dir.name}.`,
            downstreamAgent: 'listings',
          });
        }
      } else if (!listing || (!presentDirectories.has(dir.key) && listing.status !== 'undetermined')) {
        if (findings.length < 5) {
          findings.push({
            category: 'directory_gap', severity: dir.severity,
            evidence: `No directory audit data for ${dir.name} yet`,
            recommendation: `Get listed on ${dir.name} — increases citation footprint.`,
            downstreamAgent: 'listings',
          });
        }
      }
      // undetermined (null) → no string emitted, stays honest
    }
    // Surface NAP issues from audit
    for (const listing of listings) {
      if (listing.napPhoneStatus === 'phone_mismatch') {
        const label = importantDirectories.find(d => d.key === listing.directory)?.name || listing.directory;
        const gap = `Phone on ${label} differs from your confirmed number — inconsistent contact details weaken trust signals`;
        directoryGapStrings.push(gap);
        if (findings.length < 5) {
          findings.push({
            category: 'nap_inconsistency', severity: 'medium',
            evidence: gap,
            recommendation: `Update your phone on ${label} to ensure consistency.`,
            downstreamAgent: null,
          });
        }
      }
      if (listing.napPostcodeStatus === 'mismatch') {
        const label = importantDirectories.find(d => d.key === listing.directory)?.name || listing.directory;
        const gap = `Postcode on ${label} differs from yours — inconsistent address details weaken trust signals`;
        directoryGapStrings.push(gap);
        if (findings.length < 5) {
          findings.push({
            category: 'nap_inconsistency', severity: 'medium',
            evidence: gap,
            recommendation: `Update your postcode on ${label}.`,
            downstreamAgent: null,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Detective] Directory listing check failed for ${vendor.company}:`, err.message);
  }

  if (topCompetitors.length > 0 && findings.length < 5) {
    findings.push({
      category: 'competitive_intelligence', severity: 'medium',
      evidence: `Top competitors cited this week: ${topCompetitors.slice(0, 3).map(c => c.name).join(', ')}`,
      recommendation: 'Review their websites and pricing pages — they\'re winning citations you should be winning',
      downstreamAgent: null,
    });
  }

  findings.splice(5);

  let oneLineSummary;
  const firstFix = findings[0]?.recommendation || '';
  const truncatedFix = firstFix.length > 100 ? firstFix.substring(0, 97) + '...' : firstFix;
  if (platformsCited === 0) {
    oneLineSummary = `Not cited by any AI platform this week.${truncatedFix ? ' Top fix: ' + truncatedFix : ''}`;
  } else if (platformsCited === uniquePlatforms && uniquePlatforms > 0) {
    oneLineSummary = `Cited by all ${uniquePlatforms} platforms.${findings.length > 0 ? ' Top fix: ' + truncatedFix : ' No major gaps detected this week.'}`;
  } else if (findings.length === 0) {
    oneLineSummary = `Cited by ${platformsCited}/${uniquePlatforms} platforms. No major gaps detected this week.`;
  } else {
    oneLineSummary = `${platformsCited}/${uniquePlatforms} platforms cited you. Top fix: ${truncatedFix}`;
  }

  const run = await AgentRun.create({
    vendorId, agentName: 'detective', weekStarting: weekStart,
    status: findings.length > 0 ? 'completed' : 'partial',
    startedAt, completedAt: new Date(),
    durationMs: Date.now() - startedAt.getTime(),
    summary: oneLineSummary,
    artifacts: {
      findings, mentionSummary, topCompetitors,
      scoreContext: { currentScore: scoreData?.score || null },
      gapsIdentified: findings.length,
      gaps: [
        ...findings
          .filter(f => f.category !== 'directory_presence' && f.category !== 'nap_inconsistency' && f.category !== 'directory_gap')
          .slice(0, 3)
          .map(f => f.recommendation),
        ...directoryGapStrings,
      ],
      competitorsAbove: topCompetitors.slice(0, 3).map(c => c.name),
    },
  });

  return run;
}

export async function runWeeklyDetective() {
  const startTime = Date.now();
  const stats = { scanned: 0, completed: 0, partial: 0, failed: 0 };

  const vendors = await Vendor.find({
    tier: { $in: ['pro', 'managed', 'verified', 'enterprise'] },
  }).select('_id company tier').lean();

  console.log(`[Detective] Starting weekly run for ${vendors.length} vendors`);

  for (const vendor of vendors) {
    try {
      const run = await runDetectiveForVendor(vendor._id);
      stats.scanned++;
      stats[run.status] = (stats[run.status] || 0) + 1;
      console.log(`[Detective] ${vendor.company}: ${run.status} — ${run.summary}`);
    } catch (err) {
      console.error(`[Detective] ${vendor.company} failed:`, err.message);
      stats.failed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Detective] Complete in ${durationMs}ms:`, stats);

  try {
    const { sendEmail } = await import('./emailService.js');
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'scott.davies@tendorai.com',
      subject: `Detective Agent weekly run: ${stats.completed} completed, ${stats.partial} partial, ${stats.failed} failed`,
      text: `Detective Agent weekly run completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}`,
      html: `<pre>Detective Agent weekly run completed in ${durationMs}ms\nVendors: ${vendors.length}\nCompleted: ${stats.completed}\nPartial: ${stats.partial}\nFailed: ${stats.failed}</pre>`,
    });
  } catch (err) {
    console.error(`[Detective] Admin email failed:`, err.message);
  }

  return stats;
}
