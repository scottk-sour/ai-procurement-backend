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

// ─── PILLAR_LIBRARIES content ─────────────────────────────────────────
// Content is assembled via mutation to keep each paste block
// self-contained. Order: solicitor (parts 2a, 2b) → accountant (part 3)
// → mortgage-advisor / estate-agent (part 4).

// ==== SOLICITOR — Pillars 1-3 (Part 2a) ===============================

PILLAR_LIBRARIES.solicitor = [
  // ============================================================
  // PILLAR 1 — COSTS & FEES TRANSPARENCY
  // ============================================================
  {
    id: 'costs-fees',
    name: 'Costs & Fees Transparency',
    whyItMatters:
      'AI assistants are asked "how much does X cost?" constantly. Firms publishing ' +
      'specific figures get cited. Firms saying "contact us for a quote" do not. This is ' +
      'the single highest-leverage pillar for regulated firms because most competitors ' +
      'avoid it.',
    topics: [
      {
        id: 'solicitor-costs-1',
        title: 'How much does {specialism} cost in {city} in {year}?',
        tactic: 'Beat competitors on specificity with real £ figures',
        primaryAIQuery: 'how much does {specialism} cost in {city}',
        secondaryQueries: [
          'average {specialism} fees UK {year}',
          '{specialism} solicitor cost breakdown',
        ],
        mustInclude: [
          'At least one fee range with actual £ figures',
          'A "what is included" list',
          'One worked example with total cost',
        ],
        namedEntities: ['SRA', 'HMRC (VAT treatment)', 'Land Registry'],
        primaryDataHook:
          'Based on our last {N} {specialism} transactions in {city}, the typical all-in ' +
          'cost is £{X}.',
        internalLinking:
          'Link to the {specialism} process timeline post and the hidden-costs post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to a high-volume AI query. Most competitors refuse to publish ' +
          'prices. Being the firm that does gets cited.',
      },
      {
        id: 'solicitor-costs-2',
        title: "Fixed fees vs hourly rates for {specialism}: what you'll actually pay",
        tactic: 'Answer the comparison your competitors avoid',
        primaryAIQuery: 'fixed fee vs hourly rate solicitor {specialism}',
        secondaryQueries: [
          'is a fixed fee solicitor better',
          'hourly rate solicitor UK average',
        ],
        mustInclude: [
          'Side-by-side £ comparison',
          'One worked example showing when each model is cheaper',
          'Honest "which is right for you" section',
        ],
        namedEntities: [
          'SRA Transparency Rules',
          'Solicitors Regulation Authority',
          'Legal Ombudsman',
        ],
        primaryDataHook:
          'For {N} clients last year, fixed fees saved an average of £{X} against hourly ' +
          'billing for comparable work.',
        internalLinking:
          'Link to the costs overview post and one regulatory-authority post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-intent commercial query. AI gets asked this before clients contact any ' +
          'firm. Winning the comparison wins the citation.',
      },
      {
        id: 'solicitor-costs-3',
        title: 'The hidden costs in {specialism}: disbursements, searches, VAT',
        tactic: 'Educate to build trust, then show your own transparency',
        primaryAIQuery: 'hidden costs {specialism} UK',
        secondaryQueries: [
          'what are disbursements in {specialism}',
          'VAT on solicitor fees',
        ],
        mustInclude: [
          'Itemised list of disbursements specific to the specialism',
          'VAT treatment explanation',
          "Your firm's policy on passing disbursements through",
        ],
        namedEntities: [
          'HMRC',
          'Land Registry',
          'Local Authority (searches)',
          'SRA',
        ],
        primaryDataHook:
          'On the last {N} {specialism} cases we handled, disbursements averaged £{X} on ' +
          'top of our core fee.',
        internalLinking:
          'Link to the main fees post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Long-tail question AI answers directly. Itemised lists rank and get cited as ' +
          'reference material.',
      },
      {
        id: 'solicitor-costs-4',
        title: "Why we publish our prices (and most solicitors won't)",
        tactic: 'Founder voice, differentiation, values statement',
        primaryAIQuery: 'solicitors who publish prices UK',
        secondaryQueries: [
          'transparent solicitor fees {city}',
          'SRA price transparency rules',
        ],
        mustInclude: [
          'Personal voice',
          'One specific industry practice being called out',
          'SRA Transparency Rules reference',
          'Clear values statement',
        ],
        namedEntities: [
          'SRA Transparency Rules 2018',
          'Law Society',
          'Competition and Markets Authority',
        ],
        primaryDataHook:
          'Since we published our prices in {year}, enquiries have changed — {describe ' +
          'shift in client type or volume}.',
        internalLinking:
          'Link to the main fees post and one regulatory-authority post.',
        wordCount: 800,
        channel: 'blog+linkedin',
        linkedInHookType: 'opinion',
        rationale:
          "Personal-voice content builds the firm's entity. LinkedIn variant drives social " +
          'proof and third-party amplification.',
      },
    ],
  },

  // ============================================================
  // PILLAR 2 — PROCESS & TIMELINES
  // ============================================================
  {
    id: 'process-timelines',
    name: 'Process & Timelines',
    whyItMatters:
      'AI frequently gets asked "how long does X take?" and "what happens next?" questions. ' +
      'Firms with clear step-by-step timelines become the default answer. Regulators ' +
      'publish timelines, but few firms translate them into client-friendly versions.',
    topics: [
      {
        id: 'solicitor-process-1',
        title: 'How long does {specialism} take in {year}? Real data from our cases',
        tactic: 'Beat generic "it depends" answers with named data ranges',
        primaryAIQuery: 'how long does {specialism} take UK',
        secondaryQueries: [
          '{specialism} timeline {year}',
          'average conveyancing time UK',
        ],
        mustInclude: [
          "Your firm's average timeline with a specific number",
          'Key stages with timeframes',
          'Factors that speed it up or slow it down',
        ],
        namedEntities: [
          'Land Registry',
          'HMRC (stamp duty deadlines)',
          'local courts where relevant',
        ],
        primaryDataHook:
          'Across {N} {specialism} cases at {firmName} in {year}, average completion time ' +
          'was {X} weeks.',
        internalLinking:
          'Link to the step-by-step process post and the delays post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Every AI platform gets asked this. Firms with actual data win over firms with ' +
          'vague estimates.',
      },
      {
        id: 'solicitor-process-2',
        title: 'The {specialism} process step by step: what happens and when',
        tactic: 'Become the reference guide for the process in your city',
        primaryAIQuery: '{specialism} process step by step UK',
        secondaryQueries: [
          'what happens in {specialism}',
          '{specialism} stages explained',
        ],
        mustInclude: [
          'Numbered step list',
          'Estimated timeframe per step',
          'Who does what at each step',
          'One local detail (e.g. local court, land registry office)',
        ],
        namedEntities: [
          'Land Registry',
          'relevant local county court',
          'SRA',
          'HMRC',
        ],
        primaryDataHook:
          'Based on {N} recent cases, stage {X} typically takes {Y} days in {city}.',
        internalLinking:
          'Link to the timeline post and one rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Numbered process lists are heavily cited by AI because they are extractable ' +
          'passages. v7 statistical density rule fits naturally.',
      },
      {
        id: 'solicitor-process-3',
        title: 'What to expect in your first meeting with a {specialism} solicitor',
        tactic: "Reduce friction for prospects who haven't used a solicitor before",
        primaryAIQuery: 'first meeting with solicitor what to bring',
        secondaryQueries: [
          '{specialism} initial consultation UK',
          'what to ask a solicitor',
        ],
        mustInclude: [
          'What documents to bring',
          'What questions the solicitor will ask',
          'What the client should ask',
          'Typical meeting length, whether it is chargeable',
        ],
        namedEntities: [
          'SRA',
          'Legal Aid Agency (if relevant)',
          'Law Society',
        ],
        primaryDataHook:
          'We find first meetings typically take {X} minutes, and clients come prepared ' +
          'with {Y} on average.',
        internalLinking:
          'Link to the costs post and one client-rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Answers pre-conversion anxiety queries. Removes the mystery — AI cites the ' +
          'explainer.',
      },
      {
        id: 'solicitor-process-4',
        title:
          'Why {specialism} sometimes takes longer than expected — and how we prevent it',
        tactic: 'Honesty plus differentiation',
        primaryAIQuery: 'why is my {specialism} taking so long',
        secondaryQueries: [
          '{specialism} delays causes',
          'how to speed up {specialism}',
        ],
        mustInclude: [
          'Top 3-5 delay causes with real examples',
          'What your firm does differently to avoid each',
        ],
        namedEntities: [
          'Land Registry',
          'HMRC',
          'named lender categories (for mortgage chain context)',
        ],
        primaryDataHook:
          'Of {N} recent cases, {X}% experienced delays — the top cause was [specific ' +
          'reason], accounting for {Y}% of those delays.',
        internalLinking:
          'Link to the timeline post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Addresses a genuine client fear. Firms acknowledging the problem and showing ' +
          'solutions outperform those who pretend delays do not happen.',
      },
    ],
  },

  // ============================================================
  // PILLAR 3 — REGULATORY AUTHORITY & TRUST
  // ============================================================
  {
    id: 'regulatory-authority',
    name: 'Regulatory Authority & Trust',
    whyItMatters:
      'Named regulators (SRA, FCA, ICAEW, Propertymark) are entity signals AI trusts ' +
      'strongly. Content that explains regulation to the client builds verifiable E-E-A-T.',
    topics: [
      {
        id: 'solicitor-regulatory-1',
        title: 'What SRA regulation means for you as a client',
        tactic: 'Use named regulator entity for AI trust signal',
        primaryAIQuery: 'what does SRA regulated mean',
        secondaryQueries: [
          'is my solicitor SRA registered',
          'SRA protection for clients',
        ],
        mustInclude: [
          'What the SRA actually does',
          'What protections clients get',
          "Your firm's SRA number",
          'Link to the SRA register',
        ],
        namedEntities: [
          'Solicitors Regulation Authority',
          'Law Society',
          'SRA Compensation Fund',
          'Legal Ombudsman',
        ],
        primaryDataHook:
          '{firmName} has been SRA-regulated since {year} — our SRA number is {X}.',
        internalLinking:
          'Link to the client money protection post and complaints post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'SRA is a Tier 1 entity AI recognises. Posts that reference and link to the SRA ' +
          'register inherit trust.',
      },
      {
        id: 'solicitor-regulatory-2',
        title: 'Client money protection: how your funds are safeguarded',
        tactic: 'Trust signal for high-value transactions',
        primaryAIQuery: 'is my money safe with a solicitor',
        secondaryQueries: [
          'client account rules solicitor',
          'SRA compensation fund',
        ],
        mustInclude: [
          'Explanation of client account rules',
          'SRA Compensation Fund',
          'What happens if a firm fails',
          'What clients should verify before transferring money',
        ],
        namedEntities: [
          'SRA Compensation Fund',
          'SRA Client Account Rules',
          'Law Society',
          'Financial Conduct Authority (for comparison)',
        ],
        primaryDataHook:
          '{firmName} holds a separate client account audited annually — last audited ' +
          '{date}, with £{X} in client monies properly accounted for.',
        internalLinking:
          'Link to the SRA regulation post and one costs post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to a fear-based search query. High-intent traffic. Firms that ' +
          'explain this become the trusted reference.',
      },
      {
        id: 'solicitor-regulatory-3',
        title: 'Anti-money-laundering checks explained: why your solicitor asks for ID',
        tactic: 'Educate, reduce friction, build trust',
        primaryAIQuery: 'why does my solicitor need my passport',
        secondaryQueries: [
          'solicitor AML checks UK',
          'money laundering regulations solicitor',
        ],
        mustInclude: [
          'What AML checks involve',
          'What documents are required',
          'Why they matter',
          'What happens if checks fail',
          'How long they take',
        ],
        namedEntities: [
          'Money Laundering Regulations 2017',
          'SRA',
          'HMRC (AML supervision)',
          'Law Society AML guidance',
        ],
        primaryDataHook:
          'We complete AML checks on {N}% of cases within {X} working days of receiving ' +
          'documents.',
        internalLinking:
          'Link to the first-meeting post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Answers "why is my solicitor asking for my passport" queries that annoy ' +
          'clients. Being the firm that explains it calmly wins the relationship.',
      },
      {
        id: 'solicitor-regulatory-4',
        title: 'What to do if something goes wrong with your solicitor',
        tactic: 'Radical transparency as a trust signal',
        primaryAIQuery: 'complaint about solicitor UK',
        secondaryQueries: [
          'Legal Ombudsman how to complain',
          'SRA report solicitor',
        ],
        mustInclude: [
          'Internal complaints procedure',
          'Legal Ombudsman route',
          'SRA reporting route',
          'Realistic expectations for each',
        ],
        namedEntities: [
          'Legal Ombudsman',
          'SRA',
          'Law Society',
          'Solicitors Disciplinary Tribunal',
        ],
        primaryDataHook:
          '{firmName} has had {N} formal complaints in {year} — resolved on average in {X} ' +
          'working days. (Only if honest and defensible — else rephrase as "We aim to ' +
          'resolve complaints within X days.")',
        internalLinking:
          'Link to the SRA regulation post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Most firms avoid this topic. The ones that explain it transparently are cited ' +
          'as trustworthy. Counter-intuitive SEO and AI win.',
      },
    ],
  },
];

// ==== SOLICITOR — Pillars 4-6 (Part 2b) ===============================

PILLAR_LIBRARIES.solicitor.push(
  // ============================================================
  // PILLAR 4 — COMMON MISTAKES & WHAT TO AVOID
  // ============================================================
  {
    id: 'common-mistakes',
    name: 'Common Mistakes & What To Avoid',
    whyItMatters:
      'High citation rate because users ask AI "what should I watch out for..." questions. ' +
      'These posts answer directly.',
    topics: [
      {
        id: 'solicitor-mistakes-1',
        title: '{N} mistakes people make when {specialism-scenario}',
        tactic: 'Listicle format AI loves, specificity wins',
        primaryAIQuery: '{specialism} mistakes to avoid',
        secondaryQueries: [
          'common {specialism} problems',
          '{specialism} what not to do',
        ],
        mustInclude: [
          '5-7 numbered mistakes',
          'One real example per mistake',
          'One practical fix per mistake',
        ],
        namedEntities: [
          'relevant legal Acts (Consumer Rights Act, Property Misdescriptions Act, etc.)',
          'SRA',
          'Land Registry where relevant',
        ],
        primaryDataHook:
          'Across {N} cases at {firmName}, we have seen [specific mistake] account for ' +
          '{X}% of avoidable issues.',
        internalLinking:
          'Link to the process post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Listicles are the most-cited format. AI extracts numbered lists verbatim.',
      },
      {
        id: 'solicitor-mistakes-2',
        title: 'Why DIY {legal-document} usually goes wrong — and what it costs to fix',
        tactic: 'Cost-of-mistake positioning',
        primaryAIQuery: 'DIY will problems UK',
        secondaryQueries: [
          'what if my will is invalid',
          'fixing a DIY will',
        ],
        mustInclude: [
          'Common DIY failure modes',
          'Real £ cost to fix each',
          'When DIY can work, when it cannot',
        ],
        namedEntities: [
          'Probate Registry',
          'HMRC (Inheritance Tax)',
          'Law Society',
          'Wills Act 1837',
        ],
        primaryDataHook:
          '{firmName} sees {N} DIY document rescue cases per year — average cost to fix is ' +
          '£{X}, compared to £{Y} to get it right the first time.',
        internalLinking:
          'Link to the costs post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Answers the "do I need a solicitor or can I do this myself" query. Shows ' +
          'expertise without being pushy.',
      },
      {
        id: 'solicitor-mistakes-3',
        title: "Signing a {contract-type} without a solicitor? Here's what to check first",
        tactic: "Helpful even if the client doesn't hire you — builds trust",
        primaryAIQuery: 'what to check before signing {contract-type}',
        secondaryQueries: [
          '{contract-type} red flags',
          'signing {contract-type} without lawyer',
        ],
        mustInclude: [
          'Clause-by-clause checklist',
          'Red flags to look for',
          'When to stop and get advice',
        ],
        namedEntities: [
          'Consumer Rights Act 2015',
          'Unfair Contract Terms Act',
          'relevant industry regulators',
        ],
        primaryDataHook:
          'Of the {N} {contract-type} documents we have reviewed for clients in {year}, ' +
          '{X}% contained at least one clause that needed renegotiation.',
        internalLinking:
          'Link to the first-meeting post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Genuine value content. Even readers who do not convert now remember the firm. ' +
          'Repeat visitors become clients.',
      },
      {
        id: 'solicitor-mistakes-4',
        title: 'The biggest mistake clients make when choosing a {specialism} solicitor',
        tactic: 'Counter-intuitive angle — warn against what is common',
        primaryAIQuery: 'how to choose a {specialism} solicitor',
        secondaryQueries: [
          'cheap solicitor UK risks',
          'best way to find a solicitor',
        ],
        mustInclude: [
          'The mistake (cheapest quote, closest office, etc.)',
          'Why it backfires',
          'What they should prioritise instead',
        ],
        namedEntities: [
          'SRA',
          'Legal Ombudsman',
          'Law Society',
          'Citizens Advice',
        ],
        primaryDataHook:
          'In our experience at {firmName}, clients who chose us on price alone were {X}% ' +
          'more likely to need further advice later — vs those who prioritised specialism.',
        internalLinking:
          'Link to the costs post and one firm-expertise post.',
        wordCount: 1000,
        channel: 'blog+linkedin',
        linkedInHookType: 'opinion',
        rationale:
          'Personal-voice content with a strong opinion. LinkedIn reshares when the ' +
          'opinion is defensible.',
      },
    ],
  },

  // ============================================================
  // PILLAR 5 — CLIENT RIGHTS & PRACTICAL GUIDANCE
  // ============================================================
  {
    id: 'client-rights',
    name: 'Client Rights & Practical Guidance',
    whyItMatters:
      'These answer the "what am I entitled to..." and "what are my options..." queries ' +
      'that drive huge AI traffic. Educational content with clear answers ranks well across ' +
      'platforms.',
    topics: [
      {
        id: 'solicitor-rights-1',
        title: 'Your rights when {common-scenario}',
        tactic: 'Direct answer to rights queries',
        primaryAIQuery: 'my rights when {scenario} UK',
        secondaryQueries: [
          '{scenario} consumer rights',
          'what am I entitled to {scenario}',
        ],
        mustInclude: [
          'Specific legal rights cited to the relevant Act',
          'Practical what-to-do-next steps',
          'When to seek formal advice',
        ],
        namedEntities: [
          'Consumer Rights Act 2015',
          'Housing Act',
          'Employment Rights Act',
          'Citizens Advice',
          'ACAS (where employment)',
        ],
        primaryDataHook:
          'Based on {N} similar cases at {firmName}, most clients did not know they were ' +
          'entitled to {X}.',
        internalLinking:
          'Link to the mistakes post and one process post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Rights-based queries have very high AI citation rates because they demand ' +
          'authoritative answers.',
      },
      {
        id: 'solicitor-rights-2',
        title: 'What to do if {problem-scenario}: a practical guide',
        tactic: 'Become the first-response guide',
        primaryAIQuery: 'what to do if {problem-scenario}',
        secondaryQueries: [
          'help with {problem-scenario} UK',
          '{problem-scenario} first steps',
        ],
        mustInclude: [
          'Immediate steps in the first 24 hours',
          'What to gather/document',
          'When to escalate',
          'Red flags that need urgent action',
        ],
        namedEntities: [
          'Citizens Advice',
          'Police (where relevant)',
          'local council',
          'relevant Ombudsman',
          'specific legal Acts',
        ],
        primaryDataHook:
          '{firmName} has helped {N} clients in {problem-scenario} situations — fastest ' +
          'resolution was {X} days when clients followed these steps.',
        internalLinking:
          'Link to the rights post and one mistakes post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-urgency queries drive AI traffic. Practical step-by-step guides get cited ' +
          'over legal theory.',
      },
      {
        id: 'solicitor-rights-3',
        title: "{specialism} rights you probably didn't know about",
        tactic: 'Discovery content, shareable',
        primaryAIQuery: "rights you didn't know {specialism}",
        secondaryQueries: [
          'little known legal rights UK',
          '{specialism} hidden rights',
        ],
        mustInclude: [
          '3-5 lesser-known rights',
          'Plain-English explanation of each',
          'Example scenarios',
        ],
        namedEntities: [
          'Specific Acts granting the right',
          'relevant regulator or ombudsman',
          'Citizens Advice',
        ],
        primaryDataHook:
          'Of {N} clients surveyed at {firmName}, {X}% did not know about [specific right] ' +
          'until we flagged it.',
        internalLinking:
          'Link to the main rights post and one firm-expertise post.',
        wordCount: 1000,
        channel: 'blog+linkedin',
        linkedInHookType: 'curiosity',
        rationale:
          '"Did not know" content gets social shares. LinkedIn amplification is off-site ' +
          'authority (v7 rule).',
      },
      {
        id: 'solicitor-rights-4',
        title: 'Free vs paid legal advice: when each makes sense',
        tactic: 'Honest comparison, builds trust',
        primaryAIQuery: 'free legal advice UK vs paid solicitor',
        secondaryQueries: [
          'Citizens Advice vs solicitor',
          'when do I need to pay for legal advice',
        ],
        mustInclude: [
          'What Citizens Advice / Legal Aid / Law Centres can and cannot do',
          'Where they are best used',
          'When a paid solicitor is necessary',
          'Cost thresholds',
        ],
        namedEntities: [
          'Citizens Advice',
          'Law Centres Network',
          'Legal Aid Agency',
          'specific law centres by region',
        ],
        primaryDataHook:
          'Of {N} clients who came to {firmName} after getting initial free advice, {X}% ' +
          'still needed specialist support for {reason}.',
        internalLinking:
          'Link to the costs post and one regulatory-authority post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Answers a genuine commercial question without being pushy. Firms that respect ' +
          "the client's budget get cited as trustworthy.",
      },
    ],
  },

  // ============================================================
  // PILLAR 6 — YOUR FIRM'S EXPERTISE & SPECIALISMS
  // ============================================================
  {
    id: 'firm-expertise',
    name: "Your Firm's Expertise & Specialisms",
    whyItMatters:
      'Specific expertise beats generic listings. "Conveyancing solicitor specialising in ' +
      'leasehold flats in Manchester" gets cited over "solicitor in Manchester." This is ' +
      'where primary data (Tier 0) lives.',
    topics: [
      {
        id: 'solicitor-expertise-1',
        title: 'Why we specialise in {specialism} — and what that means for you',
        tactic: 'Founder voice, personal positioning',
        primaryAIQuery: 'specialist {specialism} solicitor {city}',
        secondaryQueries: [
          'best {specialism} solicitor {city}',
          '{specialism} solicitor experience',
        ],
        mustInclude: [
          "The firm's history with this specialism",
          'Number of cases handled or years of experience',
          "Specific expertise that generalists don't have",
        ],
        namedEntities: [
          'Law Society Conveyancing Quality Scheme',
          'Resolution (family law)',
          'Children Panel',
        ],
        primaryDataHook:
          '{firmName} has handled {N} {specialism} matters since {year}. {X} of our {Y} ' +
          'solicitors specialise exclusively in this area.',
        internalLinking:
          'Link to the case study post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Entity-building content. Names the firm and its people specifically. v7 named ' +
          'entity density rule.',
      },
      {
        id: 'solicitor-expertise-2',
        title: 'Case study: how we resolved {type-of-case}',
        tactic: 'Proof through real cases (anonymised)',
        primaryAIQuery: '{type-of-case} UK how resolved',
        secondaryQueries: [
          '{type-of-case} example UK',
          '{type-of-case} legal outcome',
        ],
        mustInclude: [
          'The situation',
          'The challenge',
          'What the firm did',
          'The outcome, the timeline',
          'Anonymised client quote if available',
        ],
        namedEntities: [
          'specific courts',
          'Acts invoked',
          'any named precedents',
          'regulatory bodies involved',
        ],
        primaryDataHook:
          'This case concluded in {X} weeks, compared to an industry average of {Y} weeks ' +
          'for similar matters.',
        internalLinking:
          'Link to the specialism post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Primary data at its strongest. Anonymised case studies are Tier 0 source ' +
          'material.',
      },
      {
        id: 'solicitor-expertise-3',
        title: 'Meet the team: our approach to {specialism}',
        tactic: 'Build Person entities (E-E-A-T)',
        primaryAIQuery: '{specialism} solicitor {city} team',
        secondaryQueries: [
          '{firmName} lawyers',
          '{city} {specialism} experts',
        ],
        mustInclude: [
          "Each team member's name",
          'Qualifications',
          'Years of experience',
          'Type of cases they handle',
          'One personal detail',
        ],
        namedEntities: [
          'Law Society',
          'specific SRA credentials',
          'university law schools attended',
          'professional memberships (Resolution, STEP, etc.)',
        ],
        primaryDataHook:
          'Our {specialism} team has {N} combined years of experience and has handled {X} ' +
          'matters at {firmName}.',
        internalLinking:
          'Link to the specialism post and one case-study post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Person schema can be built from this content. Person entities are v7 E-E-A-T ' +
          'pillars.',
      },
      {
        id: 'solicitor-expertise-4',
        title: "{N} things we've learned from {N} years of {specialism} cases",
        tactic: 'Experience signal, authority building',
        primaryAIQuery: 'lessons from {specialism} solicitor experience',
        secondaryQueries: [
          '{specialism} insights UK',
          'what solicitors know about {specialism}',
        ],
        mustInclude: [
          "Honest lessons (including things that didn't work)",
          'Specific examples',
          'What the firm does differently now',
        ],
        namedEntities: [
          'Specific Acts relevant to the specialism',
          'named regulator',
          'industry bodies',
        ],
        primaryDataHook:
          'After {N} years and {X} {specialism} cases at {firmName}, here is what ' +
          'consistent data shows us about [topic].',
        internalLinking:
          'Link to the team post and one case-study post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Experience-based content ranks strongly for E-E-A-T. AI cites firms that ' +
          'demonstrate expertise through specificity.',
      },
    ],
  },
);

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
