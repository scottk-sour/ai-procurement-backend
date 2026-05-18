export function buildWeeklyEmailHTML(vendor, report) {
  const firmName = vendor.company;
  const reportUrl = `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard/reports/${report._id}`;
  const score = report.scoreHeader.currentScore;
  const change = report.scoreHeader.weeklyChange;
  const changeArrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  const changeText = change > 0 ? `+${change}` : `${change}`;
  const competitorsAhead = report.scoreHeader.competitorsAhead;
  const aheadNames = report.competitors.filter(c => !c.isYou && c.visibilityScore > score)
    .slice(0, 3).map(c => c.firmName).join(', ');
  const exposureMin = (report.revenueExposure.monthlyMin || 0).toLocaleString('en-GB');
  const exposureMax = (report.revenueExposure.monthlyMax || 0).toLocaleString('en-GB');
  const pendingCount = report.recommendedActions.length;
  const weekNum = report.reportNumber.match(/W(\d+)$/)?.[1] || '';
  const weekEndFormatted = report.weekEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <h2 style="color:#0a0a0a;margin-bottom:8px">Weekly AI Visibility Intelligence Brief</h2>
  <p style="color:#666;margin-top:0">Week ${weekNum}</p>

  <p>Hi ${firmName},</p>

  <p>Your AI Visibility Intelligence Report for week ending ${weekEndFormatted} is ready.</p>

  <div style="background:#f4f4f4;padding:16px;border-radius:8px;margin:20px 0">
    <p style="margin:0 0 8px"><strong>This week:</strong></p>
    <ul style="margin:0;padding-left:20px;line-height:1.8">
      <li>Visibility score: <strong>${score}/100</strong> (${changeArrow} ${changeText} vs last week)</li>
      <li><strong>${competitorsAhead} competitor${competitorsAhead === 1 ? '' : 's'} ahead of you</strong> in ${vendor.location?.city || 'your area'}${aheadNames ? `: ${aheadNames}` : ''}</li>
      <li>Estimated monthly revenue exposure: <strong>&pound;${exposureMin}&ndash;&pound;${exposureMax}</strong></li>
      <li><strong>${pendingCount}</strong> high-impact fix${pendingCount === 1 ? '' : 'es'} prepared and pending your approval</li>
    </ul>
  </div>

  <p style="text-align:center;margin:24px 0">
    <a href="${reportUrl}" style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">View Full Report &rarr;</a>
  </p>

  <p style="font-size:14px;color:#444">This week TendorAI continues:</p>
  <ul style="font-size:14px;color:#444;line-height:1.6">
    <li>Daily AI visibility scans across Claude, ChatGPT (via OpenAI), and Perplexity</li>
    <li>Gemini, Grok, and DeepSeek coverage launching Q3&ndash;Q4 2026</li>
    <li>Two new content drafts (Wed + Fri) ready for your review</li>
    <li>Ongoing directory submissions and review monitoring</li>
  </ul>

  <p style="font-size:13px;color:#888;margin-top:32px;padding-top:16px;border-top:1px solid #ddd">
    &mdash; TendorAI<br>
    <em>Whether AI assistants recommend your firm instead of your competitors &mdash; and what we&rsquo;ve fixed this week.</em>
  </p>
</body></html>`;
}

export function buildWeeklyEmailSubject(report) {
  const weekNum = report.reportNumber.match(/W(\d+)$/)?.[1] || '';
  return `Weekly AI Visibility Intelligence Brief — Week ${weekNum}`;
}
