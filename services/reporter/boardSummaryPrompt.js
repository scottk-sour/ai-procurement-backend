export async function generateBoardSummary(anthropicClient, data) {
  const prompt = `You are writing the Board Summary section of an AI Visibility Intelligence Report for a UK SME. Write ONE paragraph (3-4 sentences) following these rules:

TONE RULES - absolute:
- NEVER use: "not listed", "not mentioned", "no visibility", "0 mentions"
- ALWAYS use: "authority signal missing", "visibility gap detected", "opportunity identified", "fixes prepared for deployment"
- Frame TendorAI as actively working
- Frame poor performance as opportunity
- End with forward-looking sentence about projected impact

STRUCTURE:
1. Sentence 1: current market position (rank, score change)
2. Sentence 2: competitor context (use real competitor names)
3. Sentence 3: TendorAI's prepared response (pending approvals)
4. Sentence 4: projected outcome if actions approved

DATA:
${JSON.stringify({
  firmName: data.vendor.company,
  city: data.vendor.location?.city,
  vertical: data.vendor.vendorType,
  currentScore: data.scoreHeader.currentScore,
  weeklyChange: data.scoreHeader.weeklyChange,
  rank: data.scoreHeader.rankInCity,
  totalFirms: data.scoreHeader.totalFirmsInCity,
  competitorsAhead: data.scoreHeader.competitorsAhead,
  topCompetitors: data.competitorList.filter(c => !c.isYou).slice(0, 3).map(c => c.firmName),
  pendingActionCount: data.recommendedActions.length,
  monthlyExposure: data.revenueExposure,
}, null, 2)}

Use UK English. No marketing language. No bullet points. One paragraph.`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = response.content[0]?.text || '';
    const bannedPhrases = ['not listed', 'not mentioned', 'no visibility', '0 mentions'];
    for (const banned of bannedPhrases) {
      if (summary.toLowerCase().includes(banned)) {
        console.warn(`[Reporter] Board summary contained banned phrase "${banned}", using fallback`);
        return buildFallbackSummary(data);
      }
    }
    return summary.trim();
  } catch (e) {
    console.error('Board summary generation failed:', e.message);
    return buildFallbackSummary(data);
  }
}

function buildFallbackSummary(data) {
  return `Your firm's current AI market position requires attention, with several visibility opportunities identified this week. TendorAI has prepared ${data.recommendedActions.length} high-impact fixes within your approval queue. Approving these is projected to increase visibility coverage over the next 30 days.`;
}
