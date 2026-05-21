export function buildWeeklyEmailHTML(vendor, report) {
  const firmName = vendor.company;
  const reportUrl = `${process.env.FRONTEND_URL || 'https://www.tendorai.com'}/vendor-dashboard/reports/${report._id}`;
  const score = report.scoreHeader.currentScore;
  const change = report.scoreHeader.weeklyChange;
  const changeArrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
  const changeText = change > 0 ? `+${change}` : `${change}`;
  const pendingCount = report.recommendedActions.length;
  const weekNum = report.reportNumber.match(/W(\d+)$/)?.[1] || '';
  const weekEndFormatted = report.weekEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const topCompetitor = report.competitors.find(c => !c.isYou && c.citationCount > 0);
  const yourCitations = report.competitors.find(c => c.isYou)?.citationCount || 0;

  const bulletPoints = [];
  bulletPoints.push(`Visibility score: <strong>${score}/100</strong> (${changeArrow} ${changeText} vs last week)`);

  if (topCompetitor) {
    bulletPoints.push(`Top competitor: <strong>${topCompetitor.firmName}</strong> cited ${topCompetitor.citationCount} time${topCompetitor.citationCount === 1 ? '' : 's'} — you were cited ${yourCitations}`);
  } else if (yourCitations > 0) {
    bulletPoints.push(`You were cited ${yourCitations} time${yourCitations === 1 ? '' : 's'} — no competitors were named in responses`);
  } else {
    bulletPoints.push(`AI assistants did not mention ${firmName} this week — fixes below will help`);
  }

  if (pendingCount > 0) {
    bulletPoints.push(`<strong>${pendingCount}</strong> high-impact fix${pendingCount === 1 ? '' : 'es'} prepared and pending your approval`);
  }

  const bulletsHtml = bulletPoints.map(b => `<li>${b}</li>`).join('\n      ');

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <h2 style="color:#0a0a0a;margin-bottom:8px">Weekly AI Visibility Intelligence Brief</h2>
  <p style="color:#666;margin-top:0">Week ${weekNum}</p>

  <p>Hi ${firmName},</p>

  <p>Your AI Visibility Intelligence Report for week ending ${weekEndFormatted} is ready.</p>

  <div style="background:#f4f4f4;padding:16px;border-radius:8px;margin:20px 0">
    <p style="margin:0 0 8px"><strong>This week:</strong></p>
    <ul style="margin:0;padding-left:20px;line-height:1.8">
      ${bulletsHtml}
    </ul>
  </div>

  <p style="text-align:center;margin:24px 0">
    <a href="${reportUrl}" style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">View Full Report &rarr;</a>
  </p>

  <p style="font-size:13px;color:#888;margin-top:32px;padding-top:16px;border-top:1px solid #ddd">
    &mdash; TendorAI<br>
    <em>Whether AI assistants recommend your firm instead of your competitors &mdash; measured weekly.</em>
  </p>
</body></html>`;
}

export function buildWeeklyEmailSubject(report) {
  const weekNum = report.reportNumber.match(/W(\d+)$/)?.[1] || '';
  return `Weekly AI Visibility Intelligence Brief — Week ${weekNum}`;
}
