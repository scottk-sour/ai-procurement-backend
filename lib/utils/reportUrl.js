const FRONTEND_BASE = () => process.env.FRONTEND_URL || 'https://www.tendorai.com';

export function buildReportUrl(reportId) {
  return `${FRONTEND_BASE()}/ai-visibility-report/results/${reportId}`;
}
