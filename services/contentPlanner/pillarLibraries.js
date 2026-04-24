/**
 * v7 content-planner pillar library.
 *
 * Single source of truth for:
 *   - PILLAR_LIBRARIES     six pillars × four topic templates, per vendorType
 *   - UNIVERSAL_RULES      four universal v7 rules referenced by the prompt
 *                          builder (Structure, Named entities,
 *                          Internal linking, Primary data hook)
 *   - VERTICAL_ENTITIES    8-15 named entities per vertical (SRA, HMRC,
 *                          FCA, Propertymark, etc.) the generator should
 *                          surface in every post
 *   - LINKEDIN_HOOK_TYPES  four LinkedIn hook patterns (opinion, data,
 *                          personal, curiosity) selectable per topic
 *
 * This file ships as scaffolding. Library content is pasted in by Scott as
 * a follow-up commit on the same PR (see PR 1 spec). The exports must exist
 * from day one so the route file and tests can import against them.
 */

export const PILLAR_LIBRARIES = {
  'solicitor': [],
  'accountant': [],
  'mortgage-advisor': [],
  'estate-agent': [],
};

export const UNIVERSAL_RULES = {
  structure:
    'Every post opens with: (1) a 40-60 word direct answer paragraph — the first sentence ' +
    'states the core answer as an extractable standalone passage; (2) a 3-5 bullet summary ' +
    'where each bullet is a complete, citable sentence; (3) the full article body. Never ' +
    'skip any of the three. Never merge them. Direct answer first, bullets second, body third.',

  namedEntities:
    'Every post names at least two specific entities AI recognises — regulators, professional ' +
    'bodies, named software, named Acts, named competitors. Generic phrases like "AI tools", ' +
    '"regulators", or "the market" do not count. The entity must be named specifically.',

  internalLinking:
    'Every post links to at least two other posts from the firm\'s own pillar library. Links ' +
    'should cross pillars — a Costs post should link to a Process post and a Mistakes post, ' +
    'not to two other Costs posts. Prefer posts published within the last 90 days. If the ' +
    'firm has fewer than two eligible published posts, leave a placeholder note inviting the ' +
    'author to add internal links once they publish more pillar content.',

  primaryDataHook:
    'Every post includes at least one first-party data point — a number, timeframe, case ' +
    'count, or outcome from the firm\'s own records. Example patterns: "Based on our last ' +
    '247 transactions in {city}...", "From our average case, {specialism} takes {X} weeks ' +
    'end-to-end.", "In {year} we\'ve handled {N} {scenario} cases.", "Our fees for standard ' +
    '{specialism} start from £{X} + VAT." If the firm has not yet provided their own numbers, ' +
    'include the template and prompt the author to fill it in before publish.',
};

export const VERTICAL_ENTITIES = {
  solicitor: [
    'Solicitors Regulation Authority (SRA)',
    'Law Society',
    'Legal Ombudsman',
    'Land Registry',
    'HMRC',
    'Consumer Rights Act 2015',
    'Conveyancing Quality Scheme (CQS)',
    'Resolution (family law body)',
    'SRA Compensation Fund',
    'Money Laundering Regulations 2017',
    'Solicitors Disciplinary Tribunal',
    'Legal Aid Agency',
    'Probate Registry',
    'Wills Act 1837',
    'Citizens Advice',
  ],

  accountant: [
    'Institute of Chartered Accountants in England and Wales (ICAEW)',
    'Association of Chartered Certified Accountants (ACCA)',
    'HMRC',
    'Companies House',
    'Chartered Institute of Taxation (CIOT)',
    'Association of Accounting Technicians (AAT)',
    'Making Tax Digital (MTD)',
    'Xero',
    'QuickBooks',
    'Sage',
    'FreeAgent',
    'VAT registration threshold',
    'IR35',
    'Self Assessment',
    'HMRC Charter',
  ],

  'mortgage-advisor': [
    'Financial Conduct Authority (FCA)',
    'Financial Services Compensation Scheme (FSCS)',
    'Financial Ombudsman Service',
    'FCA Register',
    'MCOB (Mortgage Conduct of Business)',
    'CeMAP (Certificate in Mortgage Advice and Practice)',
    'CeRER (Certificate in Regulated Equity Release)',
    'Prudential Regulation Authority (PRA)',
    'Bank of England base rate',
    'Experian',
    'Equifax',
    'TransUnion',
    'Consumer Duty 2023',
    'National Residential Landlords Association (NRLA)',
    'Help to Buy / First Homes scheme',
  ],

  'estate-agent': [
    'Propertymark',
    'National Association of Estate Agents (NAEA)',
    'Association of Residential Letting Agents (ARLA)',
    'Royal Institution of Chartered Surveyors (RICS)',
    'The Property Ombudsman (TPO)',
    'Property Redress Scheme (PRS)',
    'Estate Agents Act 1979',
    'Tenant Fees Act 2019',
    'Rightmove',
    'Zoopla',
    'OnTheMarket',
    'Deposit Protection Service (DPS)',
    'MyDeposits',
    'Tenancy Deposit Scheme (TDS)',
    'Housing Act 1988',
  ],
};

export const LINKEDIN_HOOK_TYPES = {
  opinion: {
    name: 'Opinion',
    description:
      'The post states a strong view and defends it with examples or data. The first line is a ' +
      'direct claim. Ends with a question that invites debate.',
    exampleFirstLine:
      '"Most solicitors will not publish their fees. Here is the real reason why."',
    instruction:
      'Open with a bold first-line claim. Defend it in 2-3 short paragraphs with at least one ' +
      'specific example or data point. End with a question that divides opinion and invites ' +
      'comments.',
  },

  data: {
    name: 'Data',
    description:
      'The post leads with a specific number or percentage. The first line IS the number. ' +
      'Rest of the post explains what it means and what the reader should do about it.',
    exampleFirstLine:
      '"Clients who came to us after a bank\'s offer saved an average of £3,400. Here is why."',
    instruction:
      'Open with a concrete number — a statistic, percentage, average, or count. The number ' +
      'goes in the first sentence. Explain the methodology briefly. Close with what the ' +
      'reader should do with this information.',
  },

  personal: {
    name: 'Personal',
    description:
      'The post starts with a founder story or firsthand experience. First line is "I" or "We" ' +
      'based, anecdotal. Uses specific detail to ground the story.',
    exampleFirstLine:
      '"I have been doing conveyancing for 15 years. Here is what surprised me this week."',
    instruction:
      'Open with a specific personal anecdote — a moment, a conversation, a realisation. ' +
      'Name a specific detail (a year, a number, a location) to anchor the story. Connect the ' +
      'anecdote to a professional insight the reader can use. Close with a question.',
  },

  curiosity: {
    name: 'Curiosity',
    description:
      'The post opens with a question or surprising fact that invites the reader to keep ' +
      'reading. First line is a hook question or surprising claim. Answer follows.',
    exampleFirstLine:
      '"Did you know you have the right to [X] under UK law? Most people do not."',
    instruction:
      'Open with a question or counter-intuitive claim that makes the reader want to scroll ' +
      'down. The answer appears after a pause (line break, two-sentence setup). Close with a ' +
      'call to comment or share.',
  },
};
