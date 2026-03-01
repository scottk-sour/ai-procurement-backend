/**
 * Industry-specific configuration for AEO report emails.
 * Keyed by category slug (matching the system's category slugs).
 * Used by emailTemplates.js and can be reused elsewhere.
 */

const DEFAULT_CONFIG = {
  industryLabel: 'your industry',
  buyerLabel: 'potential customers',
  urgencyAngle: 'Buyers are switching from Google to AI assistants to find and compare providers. If AI doesn\'t recommend you, those leads go to competitors you\'ll never know about.',
  benchmark: 'The average score in your sector is around 35/100 — most businesses haven\'t optimised for AI yet.',
  regulatorNote: null,
};

const INDUSTRY_CONFIG = {
  // --- Solicitors ---
  conveyancing: {
    industryLabel: 'conveyancing',
    buyerLabel: 'homebuyers and sellers',
    urgencyAngle: 'Homebuyers are asking ChatGPT and Perplexity for conveyancing quotes before they ever Google "solicitor near me." The firms AI recommends get the instruction — everyone else gets nothing.',
    benchmark: 'The average conveyancing firm scores 28/100. Most haven\'t claimed any AI presence at all.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'family-law': {
    industryLabel: 'family law',
    buyerLabel: 'people going through divorce or custody disputes',
    urgencyAngle: 'People facing divorce or custody issues are asking AI for solicitor recommendations. These are urgent, high-value instructions — and AI gives them to the firms with the best structured data.',
    benchmark: 'The average family law firm scores 25/100. Most have no AI-readable practice data.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'criminal-law': {
    industryLabel: 'criminal law',
    buyerLabel: 'people needing urgent legal representation',
    urgencyAngle: 'When someone needs a criminal solicitor, they need one fast. Increasingly, they\'re asking AI. The firms AI knows about get the call — the rest don\'t even appear.',
    benchmark: 'The average criminal law firm scores 22/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'commercial-law': {
    industryLabel: 'commercial law',
    buyerLabel: 'business owners needing legal advice',
    urgencyAngle: 'Business owners are asking AI for commercial solicitor recommendations before reaching out. AI recommends firms with structured, machine-readable data about their specialisms.',
    benchmark: 'The average commercial law firm scores 30/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'employment-law': {
    industryLabel: 'employment law',
    buyerLabel: 'employers and employees with workplace disputes',
    urgencyAngle: 'HR managers and employees facing tribunal claims are asking AI for employment solicitor recommendations. The firms AI recommends get high-value, repeat instructions.',
    benchmark: 'The average employment law firm scores 26/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'wills-and-probate': {
    industryLabel: 'wills and probate',
    buyerLabel: 'people planning their estate or dealing with probate',
    urgencyAngle: 'People writing wills or dealing with probate are asking AI which solicitors to trust. If your firm isn\'t visible, those instructions go elsewhere.',
    benchmark: 'The average wills and probate firm scores 24/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  immigration: {
    industryLabel: 'immigration law',
    buyerLabel: 'visa applicants and sponsors',
    urgencyAngle: 'Visa applicants and employers sponsoring workers are asking AI for immigration solicitor recommendations. These are high-value, time-sensitive cases that go to the firms AI knows about.',
    benchmark: 'The average immigration firm scores 27/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },
  'personal-injury': {
    industryLabel: 'personal injury',
    buyerLabel: 'accident victims seeking compensation',
    urgencyAngle: 'Injury claimants are asking AI which solicitors to use before searching Google. AI recommends firms with clear specialism data and track records.',
    benchmark: 'The average personal injury firm scores 29/100.',
    regulatorNote: 'This report uses verified data from the SRA Solicitors Register.',
  },

  // --- Accountants ---
  'tax-advisory': {
    industryLabel: 'tax advisory',
    buyerLabel: 'business owners needing tax advice',
    urgencyAngle: 'Business owners are asking AI for accountant recommendations, especially at year-end. If AI can\'t find your specialisms and client sectors, it recommends your competitors.',
    benchmark: 'The average tax advisory firm scores 31/100.',
    regulatorNote: 'This report uses data from the ICAEW directory.',
  },
  'audit-assurance': {
    industryLabel: 'audit and assurance',
    buyerLabel: 'companies needing audit services',
    urgencyAngle: 'Companies needing audits are asking AI for recommendations. AI favours firms with clear, structured data about their audit capabilities and sector experience.',
    benchmark: 'The average audit firm scores 33/100.',
    regulatorNote: 'This report uses data from the ICAEW directory.',
  },
  bookkeeping: {
    industryLabel: 'bookkeeping',
    buyerLabel: 'small businesses needing bookkeeping support',
    urgencyAngle: 'Small business owners are asking AI for bookkeeping recommendations. The practices AI can identify and describe get the enquiries — the rest are invisible.',
    benchmark: 'The average bookkeeping practice scores 23/100.',
    regulatorNote: null,
  },
  payroll: {
    industryLabel: 'payroll services',
    buyerLabel: 'businesses outsourcing payroll',
    urgencyAngle: 'Companies looking to outsource payroll are asking AI for recommendations. AI recommends providers with clear pricing, service descriptions, and client testimonials.',
    benchmark: 'The average payroll provider scores 25/100.',
    regulatorNote: null,
  },
  'corporate-finance': {
    industryLabel: 'corporate finance',
    buyerLabel: 'businesses seeking M&A or funding advice',
    urgencyAngle: 'Business owners seeking funding or M&A advice are asking AI for recommendations. These are high-value, long-term engagements — and AI gives them to firms it can confidently describe.',
    benchmark: 'The average corporate finance firm scores 34/100.',
    regulatorNote: 'This report uses data from the ICAEW directory.',
  },
  'business-advisory': {
    industryLabel: 'business advisory',
    buyerLabel: 'businesses seeking growth advice',
    urgencyAngle: 'Business owners asking AI for advisory firm recommendations get answers based on structured data. If your firm lacks clear specialism and sector data, AI skips you.',
    benchmark: 'The average business advisory firm scores 30/100.',
    regulatorNote: 'This report uses data from the ICAEW directory.',
  },
  'vat-services': {
    industryLabel: 'VAT services',
    buyerLabel: 'businesses needing VAT compliance help',
    urgencyAngle: 'Businesses struggling with VAT are asking AI for help finding accountants. AI recommends firms with clear VAT expertise in their structured data.',
    benchmark: 'The average VAT services provider scores 26/100.',
    regulatorNote: null,
  },
  'financial-planning': {
    industryLabel: 'financial planning',
    buyerLabel: 'individuals and businesses seeking financial advice',
    urgencyAngle: 'People planning retirement, investments, or business finances are asking AI for advisor recommendations. AI recommends planners it can verify and describe with confidence.',
    benchmark: 'The average financial planner scores 28/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },

  // --- Mortgage advisors ---
  'residential-mortgages': {
    industryLabel: 'residential mortgages',
    buyerLabel: 'homebuyers looking for mortgage advice',
    urgencyAngle: 'First-time buyers and movers are asking AI for mortgage advisor recommendations before checking comparison sites. The advisors AI recommends get the warm leads.',
    benchmark: 'The average mortgage advisor scores 27/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  'buy-to-let': {
    industryLabel: 'buy-to-let mortgages',
    buyerLabel: 'property investors seeking BTL mortgages',
    urgencyAngle: 'Landlords and property investors are asking AI for BTL mortgage advice. AI recommends advisors with clear product knowledge and BTL specialism.',
    benchmark: 'The average BTL mortgage advisor scores 25/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  remortgage: {
    industryLabel: 'remortgaging',
    buyerLabel: 'homeowners looking to remortgage',
    urgencyAngle: 'Homeowners coming off fixed deals are asking AI where to remortgage. AI recommends the advisors it knows best — if that\'s not you, those leads go to competitors.',
    benchmark: 'The average remortgage advisor scores 26/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  'first-time-buyer': {
    industryLabel: 'first-time buyer mortgages',
    buyerLabel: 'first-time buyers entering the property market',
    urgencyAngle: 'First-time buyers overwhelmingly start with AI. They ask ChatGPT and Perplexity for mortgage advice before they talk to anyone. The advisors AI recommends get first contact.',
    benchmark: 'The average first-time buyer advisor scores 24/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  'equity-release': {
    industryLabel: 'equity release',
    buyerLabel: 'homeowners aged 55+ exploring equity release',
    urgencyAngle: 'Equity release clients often start with AI research before approaching a broker. If AI can\'t describe your services, those high-value leads go to better-optimised competitors.',
    benchmark: 'The average equity release advisor scores 23/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  'commercial-mortgages': {
    industryLabel: 'commercial mortgages',
    buyerLabel: 'business owners seeking commercial finance',
    urgencyAngle: 'Business owners seeking commercial mortgage advice are asking AI for recommendations. AI recommends brokers with clear lending criteria and deal experience.',
    benchmark: 'The average commercial mortgage broker scores 29/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },
  'protection-insurance': {
    industryLabel: 'protection insurance',
    buyerLabel: 'individuals and families seeking life or income protection',
    urgencyAngle: 'People looking for life insurance and income protection are asking AI for advisor recommendations. AI favours advisors with structured data about their product range.',
    benchmark: 'The average protection advisor scores 22/100.',
    regulatorNote: 'This report uses data from the FCA Financial Services Register.',
  },

  // --- Estate agents ---
  sales: {
    industryLabel: 'property sales',
    buyerLabel: 'homeowners looking to sell',
    urgencyAngle: 'Sellers are asking AI which estate agents to use before checking Rightmove. AI recommends agencies with strong local presence data — if that\'s not you, those instructions go elsewhere.',
    benchmark: 'The average estate agent scores 32/100.',
    regulatorNote: null,
  },
  lettings: {
    industryLabel: 'lettings',
    buyerLabel: 'landlords looking for letting agents',
    urgencyAngle: 'Landlords are asking AI for letting agent recommendations. AI recommends agents with clear management fees, tenant find services, and local portfolio data.',
    benchmark: 'The average letting agent scores 29/100.',
    regulatorNote: null,
  },
  'property-management': {
    industryLabel: 'property management',
    buyerLabel: 'landlords needing property management services',
    urgencyAngle: 'Portfolio landlords are asking AI for property management recommendations. AI recommends agents with clear service descriptions, coverage, and management capabilities.',
    benchmark: 'The average property management agent scores 27/100.',
    regulatorNote: null,
  },
  'block-management': {
    industryLabel: 'block management',
    buyerLabel: 'freeholders and RTM companies',
    urgencyAngle: 'Leaseholders and RTM companies are asking AI for block management recommendations. AI recommends agents with clear service levels, portfolio size, and regulatory compliance.',
    benchmark: 'The average block management agent scores 26/100.',
    regulatorNote: null,
  },
  auctions: {
    industryLabel: 'property auctions',
    buyerLabel: 'sellers considering auction',
    urgencyAngle: 'Property sellers exploring auction are asking AI for recommendations. AI recommends auction houses with clear success rates, coverage areas, and fee structures.',
    benchmark: 'The average auction house scores 30/100.',
    regulatorNote: null,
  },
  'commercial-property': {
    industryLabel: 'commercial property',
    buyerLabel: 'businesses looking for commercial premises',
    urgencyAngle: 'Business owners searching for office or retail space are asking AI for agent recommendations. AI recommends agents with clear commercial portfolio data.',
    benchmark: 'The average commercial property agent scores 31/100.',
    regulatorNote: null,
  },
  inventory: {
    industryLabel: 'inventory services',
    buyerLabel: 'landlords and agents needing inventory reports',
    urgencyAngle: 'Letting agents and landlords are asking AI for inventory service recommendations. AI recommends providers with clear service areas, turnaround times, and pricing.',
    benchmark: 'The average inventory provider scores 21/100.',
    regulatorNote: null,
  },

  // --- Tech / Office ---
  copiers: {
    industryLabel: 'photocopier and managed print',
    buyerLabel: 'businesses looking for office printers and copiers',
    urgencyAngle: 'Office managers are asking AI which copier suppliers to use. AI recommends providers with clear product catalogues, service coverage, and pricing data.',
    benchmark: 'The average managed print supplier scores 35/100.',
    regulatorNote: null,
  },
  telecoms: {
    industryLabel: 'business telecoms and VoIP',
    buyerLabel: 'businesses upgrading their phone systems',
    urgencyAngle: 'Businesses upgrading to VoIP are asking AI for provider recommendations. AI recommends suppliers with clear product ranges, installation coverage, and pricing.',
    benchmark: 'The average telecoms provider scores 33/100.',
    regulatorNote: null,
  },
  cctv: {
    industryLabel: 'CCTV and security',
    buyerLabel: 'businesses needing security systems',
    urgencyAngle: 'Business owners and facilities managers are asking AI for CCTV installer recommendations. AI recommends providers with clear service coverage and product data.',
    benchmark: 'The average security installer scores 28/100.',
    regulatorNote: null,
  },
  it: {
    industryLabel: 'IT support and managed services',
    buyerLabel: 'businesses looking for IT support',
    urgencyAngle: 'Business owners are asking AI for IT support recommendations. AI recommends providers with clear service descriptions, response times, and client sectors.',
    benchmark: 'The average IT support provider scores 30/100.',
    regulatorNote: null,
  },

  // --- Fallback ---
  other: { ...DEFAULT_CONFIG },
};

/**
 * Get the industry config for a category, falling back to DEFAULT_CONFIG.
 */
export function getIndustryConfig(category) {
  return INDUSTRY_CONFIG[category] || DEFAULT_CONFIG;
}

export { INDUSTRY_CONFIG, DEFAULT_CONFIG };
