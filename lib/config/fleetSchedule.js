/**
 * FLEET_SCHEDULE — the single source of truth for the agent schedule
 * shown to customers (weekly Pro report "What's next" section).
 *
 * Every entry MUST correspond to a real, active cron job:
 *   - AI Mention Scan        0 3 * * 0     (jobs/scheduledReports.js)
 *   - Writer Agent           0 5 * * 1,3,5 (jobs/writerAgent.js)
 *   - Detective Agent        30 5 * * 1    (jobs/detectiveAgent.js)
 *   - Reviews Agent          15 6 * * 1    (jobs/reviewsAgent.js)
 *   - Reporter (Pro weekly)  0 8 * * 1     (jobs/scheduledReports.js)
 *
 * Intentionally NOT listed:
 *   - Listings Agent (currently a no-op — feature-flagged off)
 *   - Daily past-due downgrade check (internal housekeeping)
 *   - Starter monthly report (not relevant to Pro "what's next")
 *
 * Do not add entries here without a matching, active cron job.
 */
export const FLEET_SCHEDULE = [
  {
    id: 'mention_scan',
    label: 'AI visibility scan across AI platforms',
    days: ['Sunday'],
    timeUTC: '03:00',
  },
  {
    id: 'writer',
    label: 'New content drafted for your review',
    days: ['Monday', 'Wednesday', 'Friday'],
    timeUTC: '05:00',
  },
  {
    id: 'detective',
    label: 'Competitor and mention analysis',
    days: ['Monday'],
    timeUTC: '05:30',
  },
  {
    id: 'reviews',
    label: 'Reviews check',
    days: ['Monday'],
    timeUTC: '06:15',
  },
  {
    id: 'reporter',
    label: 'Your weekly visibility report',
    days: ['Monday'],
    timeUTC: '08:00',
  },
];

export default FLEET_SCHEDULE;
