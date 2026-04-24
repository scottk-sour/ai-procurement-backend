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

// ==== ACCOUNTANT — Pillars 1-3 (Part 3a) ==============================

PILLAR_LIBRARIES.accountant = [
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
        id: 'accountant-costs-1',
        title: 'How much does an accountant cost for a {client-type} in {city}?',
        tactic: 'Fee transparency for the type of client searching',
        primaryAIQuery: 'accountant cost UK {year}',
        secondaryQueries: [
          '{client-type} accountant fees',
          'small business accountant price',
        ],
        mustInclude: [
          'Fee ranges for sole trader / limited company / VAT-registered / payroll / Self Assessment',
          'Hourly vs fixed fee comparison',
          'What is included in each fee model',
        ],
        namedEntities: ['ICAEW', 'ACCA', 'HMRC', 'Companies House'],
        primaryDataHook:
          'Across {N} {client-type} clients at {firmName}, average annual fees were £{X} ' +
          '— covering [specific services].',
        internalLinking:
          'Link to the fixed-vs-hourly post and the hidden-costs / retainer post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'AI gets asked this constantly. Specificity by client type wins over generic ranges.',
      },
      {
        id: 'accountant-costs-2',
        title: 'Fixed fees vs hourly rates for accountancy: which works for your business?',
        tactic: 'Honest comparison with scenarios',
        primaryAIQuery: 'fixed fee vs hourly accountant',
        secondaryQueries: [
          'monthly accountant cost',
          'pay-as-you-go accountant',
        ],
        mustInclude: [
          'Side-by-side comparison',
          'Real examples where each is cheaper',
          'What growing businesses should choose',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA pricing guidance',
          'HMRC (compliance cost benchmark)',
        ],
        primaryDataHook:
          'In {year}, fixed-fee clients at {firmName} averaged £{X} per year; equivalent ' +
          'hourly would have been £{Y} — saving {Z}%.',
        internalLinking:
          'Link to the main fees post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-intent commercial query. Specific scenario examples extract as AI citations.',
      },
      {
        id: 'accountant-costs-3',
        title: 'Monthly retainer vs transactional accountancy: when each makes sense',
        tactic: 'Business-model education',
        primaryAIQuery: 'monthly retainer accountant worth it',
        secondaryQueries: [
          'fixed monthly accountant',
          'accountant subscription UK',
        ],
        mustInclude: [
          'What retainers typically include',
          'What transactional work costs separately',
          'The threshold where retainer becomes cheaper',
        ],
        namedEntities: [
          'ICAEW',
          'Xero',
          'QuickBooks',
          'FreeAgent (for accounting software bundled into retainers)',
        ],
        primaryDataHook:
          '{firmName} retainer clients average {N} support interactions per month — ' +
          'equivalent transactional cost would be £{X} per year.',
        internalLinking:
          'Link to the main fees post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Guides prospects toward the product that actually fits. Trust-building comparison.',
      },
      {
        id: 'accountant-costs-4',
        title: 'Why cheap accountants cost your business money',
        tactic: 'Counter-intuitive positioning',
        primaryAIQuery: 'cheap accountant risks UK',
        secondaryQueries: [
          'unqualified accountant problems',
          'good accountant vs cheap',
        ],
        mustInclude: [
          'Real examples of errors that cost more than the fee saved',
          'HMRC penalty costs',
          'Missed claims',
          'What to actually look for',
        ],
        namedEntities: [
          'HMRC (penalty tables)',
          'ICAEW',
          'ACCA',
          'specific unqualified-accountant risks',
        ],
        primaryDataHook:
          '{firmName} has rescued {N} clients from previous-accountant errors in {year} — ' +
          'average HMRC exposure £{X}, plus {Y} weeks to fix.',
        internalLinking:
          'Link to the costs post and one regulatory-authority post.',
        wordCount: 1000,
        channel: 'blog+linkedin',
        linkedInHookType: 'opinion',
        rationale:
          'Opinion content with data. LinkedIn amplification for off-site authority.',
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
        id: 'accountant-process-1',
        title: 'When should a {business-type} hire an accountant?',
        tactic: 'Timing-based entry point',
        primaryAIQuery: 'when does a small business need an accountant',
        secondaryQueries: [
          'sole trader accountant threshold',
          'limited company accountant mandatory',
        ],
        mustInclude: [
          'Turnover thresholds',
          'VAT registration threshold',
          'Employing staff',
          'Taking on a director',
          'Specific HMRC triggers',
        ],
        namedEntities: [
          'HMRC',
          'Companies House',
          'VAT registration threshold (£90,000)',
          'PAYE',
          'CIS',
        ],
        primaryDataHook:
          'Of {N} {client-type} clients {firmName} took on last year, {X}% had been trading ' +
          'for over {Y} months without specialist advice — average unclaimed expenses ' +
          'recovered: £{Z}.',
        internalLinking:
          'Link to the costs post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to "do I need an accountant yet" queries. Answers both yes and no ' +
          'honestly.',
      },
      {
        id: 'accountant-process-2',
        title: 'The Self Assessment deadline: month-by-month what you should be doing',
        tactic: 'Calendar-based reference content',
        primaryAIQuery: 'Self Assessment deadline prep UK',
        secondaryQueries: [
          'when to prepare Self Assessment',
          '31 January tax return',
        ],
        mustInclude: [
          'Year-round timeline',
          'When to gather documents',
          'When to book in',
          'Penalty dates',
          'Practical prep steps',
        ],
        namedEntities: [
          'HMRC',
          '31 October paper deadline',
          '31 January online deadline',
          '31 July payment on account',
        ],
        primaryDataHook:
          'Of {N} Self Assessment clients at {firmName} last year, those who started prep ' +
          'before November filed {X} days earlier on average.',
        internalLinking:
          'Link to the costs post and one mistakes post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          "Seasonal content with year-round searches. Becomes the firm's reference page.",
      },
      {
        id: 'accountant-process-3',
        title: 'Changing accountants: how the process works and how long it takes',
        tactic: 'Switching-friction reducer',
        primaryAIQuery: 'how to change accountant UK',
        secondaryQueries: [
          'switching accountants process',
          'professional clearance accountant',
        ],
        mustInclude: [
          'Engagement letter',
          'Professional clearance process',
          'HMRC notifications',
          'Typical timeline',
          'What the old accountant must hand over',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'HMRC (agent authorisation)',
          'Companies House',
        ],
        primaryDataHook:
          '{firmName} switched {N} clients in the last year — average handover time {X} ' +
          'working days from enquiry to fully operational.',
        internalLinking:
          'Link to the costs post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-intent content. Firms helping clients switch attract clients switching.',
      },
      {
        id: 'accountant-process-4',
        title: 'Making Tax Digital for Income Tax: what is changing and when',
        tactic: 'Regulatory change explainer',
        primaryAIQuery: 'Making Tax Digital Income Tax deadline',
        secondaryQueries: [
          'MTD ITSA requirements',
          'MTD for landlords',
        ],
        mustInclude: [
          'Dates',
          'Who it affects',
          'What software is needed',
          'How the firm prepares clients',
          'Costs',
        ],
        namedEntities: [
          'HMRC',
          'MTD (Making Tax Digital)',
          'Xero',
          'QuickBooks',
          'FreeAgent',
          'Sage',
        ],
        primaryDataHook:
          '{firmName} has migrated {N} clients to MTD-compatible software since {year} — ' +
          'average transition time {X} weeks.',
        internalLinking:
          'Link to the software-stack post and one regulatory-authority post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Regulatory content ranks strongly when tied to real deadlines. HMRC changes ' +
          'drive search volume.',
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
      'Named regulators (ICAEW, ACCA, HMRC) are entity signals AI trusts strongly. ' +
      'Content that explains regulation to the client builds verifiable E-E-A-T.',
    topics: [
      {
        id: 'accountant-regulatory-1',
        title: 'What ICAEW / ACCA registration means for your accountant',
        tactic: 'Named regulator entity',
        primaryAIQuery: 'what does ICAEW registered mean',
        secondaryQueries: [
          'ACCA vs ICAEW accountant',
          'chartered accountant UK',
        ],
        mustInclude: [
          'What the body does',
          'Qualification requirements',
          'How to verify on the register',
          "Your firm's credentials",
          'What clients get as protection',
        ],
        namedEntities: [
          'Institute of Chartered Accountants in England and Wales (ICAEW)',
          'Association of Chartered Certified Accountants (ACCA)',
          'relevant register URLs',
        ],
        primaryDataHook:
          "{firmName}'s team holds {N} qualifications across ICAEW and ACCA — firm " +
          'registered since {year}.',
        internalLinking:
          'Link to the unqualified-accountants post and complaints post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Named bodies are Tier 1 entities. Linking to their registers inherits authority.',
      },
      {
        id: 'accountant-regulatory-2',
        title: "Unqualified accountants: the risks you didn't know about",
        tactic: 'Counter-market positioning',
        primaryAIQuery: 'unqualified accountant UK legal',
        secondaryQueries: [
          'can anyone call themselves an accountant UK',
          'unqualified vs qualified accountant',
        ],
        mustInclude: [
          'Legal position (anyone can call themselves an accountant)',
          'What can go wrong',
          'How to verify qualifications',
          'Typical rescue costs',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'CIOT (Chartered Institute of Taxation)',
          'HMRC',
          'AAT (Association of Accounting Technicians)',
        ],
        primaryDataHook:
          'Of {N} rescue cases {firmName} handled in {year}, {X}% came from unqualified ' +
          'adviser errors — average cost to fix: £{Y}.',
        internalLinking:
          'Link to the ICAEW regulation post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Counter-intuitive content with safety angle. Shareable, trust-building.',
      },
      {
        id: 'accountant-regulatory-3',
        title: 'HMRC investigations: what triggers them and how your accountant helps',
        tactic: 'Fear-based query with calm answer',
        primaryAIQuery: 'HMRC investigation what happens',
        secondaryQueries: [
          'HMRC enquiry triggers',
          'tax investigation UK',
        ],
        mustInclude: [
          'Common triggers',
          'Investigation types',
          'Realistic outcomes',
          'What the accountant does',
          'Average cost of representation',
        ],
        namedEntities: [
          'HMRC (Compliance, COP 9)',
          'CIOT',
          'Fee Protection Insurance providers',
          'specific tribunal names',
        ],
        primaryDataHook:
          '{firmName} has represented {N} clients in HMRC enquiries since {year}. {X}% ' +
          'closed with no tax due; average resolution time {Y} months.',
        internalLinking:
          'Link to the HMRC-contact post and one rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-urgency search behaviour. Calm, authoritative content converts well.',
      },
      {
        id: 'accountant-regulatory-4',
        title: 'Complaints about your accountant: the process explained',
        tactic: 'Radical transparency',
        primaryAIQuery: 'complaint about accountant UK',
        secondaryQueries: [
          'ICAEW complaints process',
          'ACCA report accountant',
        ],
        mustInclude: [
          'Internal process',
          'Professional body complaints',
          'When to report to HMRC',
          'Timescales',
          'Realistic outcomes',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'HMRC',
          'relevant tax professional body disciplinary processes',
        ],
        primaryDataHook:
          '{firmName} resolved {N} complaints internally in {year}, average time to ' +
          'resolution {X} working days.',
        internalLinking:
          'Link to the ICAEW regulation post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Firms transparent about complaints gain trust. Counter-intuitive citation win.',
      },
    ],
  },
];

// ==== ACCOUNTANT — Pillars 4-6 (Part 3b) ==============================

PILLAR_LIBRARIES.accountant.push(
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
        id: 'accountant-mistakes-1',
        title: '{N} tax mistakes small businesses make (and how to avoid them)',
        tactic: 'Listicle with named errors',
        primaryAIQuery: 'small business tax mistakes UK',
        secondaryQueries: [
          'common SME tax errors',
          'HMRC penalty small business',
        ],
        mustInclude: [
          '5-7 specific mistakes with real examples and corrections',
          'HMRC penalty amounts',
          "What to do if you've already made the mistake",
        ],
        namedEntities: [
          'HMRC (specific penalties by section of TMA 1970 where relevant)',
          'ICAEW',
          'ACCA',
        ],
        primaryDataHook:
          'Across {N} rescue cases at {firmName}, the top three mistakes were [X], [Y] and ' +
          '[Z] — accounting for {P}% of avoidable penalties.',
        internalLinking:
          'Link to the HMRC investigation post and one rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Listicles extract well. Named penalties give statistical density for v7.',
      },
      {
        id: 'accountant-mistakes-2',
        title: 'Why DIY bookkeeping usually costs more than it saves',
        tactic: 'Positioning content for owners tempted to self-do',
        primaryAIQuery: 'DIY bookkeeping small business',
        secondaryQueries: [
          'do I need a bookkeeper',
          'self-bookkeeping risks',
        ],
        mustInclude: [
          'Hidden time cost',
          'Common errors',
          'What gets missed',
          'Typical annual tax savings a bookkeeper finds',
        ],
        namedEntities: [
          'HMRC',
          'Xero',
          'QuickBooks',
          'FreeAgent',
          'specific named bookkeeping rules (BIM manuals)',
        ],
        primaryDataHook:
          'Of {N} business owners {firmName} moved from DIY bookkeeping, average unclaimed ' +
          'expenses found in year one was £{X}.',
        internalLinking:
          'Link to the costs post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct addressable market content. Owners comparing to hire vs DIY.',
      },
      {
        id: 'accountant-mistakes-3',
        title: "Expense claims HMRC rejects: what you can and can't claim",
        tactic: 'Tactical specificity',
        primaryAIQuery: 'what can I claim as business expense UK',
        secondaryQueries: [
          'HMRC allowable expenses',
          'self-employed expense claims',
        ],
        mustInclude: [
          'Common rejections with real examples',
          'Allowable expenses table',
          'Documentation requirements',
          'What to do about past years',
        ],
        namedEntities: [
          'HMRC (BIM manuals, specific ITEPA references)',
          'Xero (for record-keeping)',
          'Making Tax Digital compatible platforms',
        ],
        primaryDataHook:
          'In {N} Self Assessment reviews at {firmName} last year, incorrect expense ' +
          'claims were found in {X}% of returning clients — average correction £{Y}.',
        internalLinking:
          'Link to the DIY bookkeeping post and one process post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Very high AI citation rate because it answers a specific practical query ' +
          'directly. Extractable passages.',
      },
      {
        id: 'accountant-mistakes-4',
        title: 'The biggest mistake when choosing an accountant',
        tactic: 'Counter-intuitive selection criteria',
        primaryAIQuery: 'how to choose an accountant UK',
        secondaryQueries: [
          'what to look for in an accountant',
          'best accountant small business UK',
        ],
        mustInclude: [
          'Why cheapest-quote buying backfires',
          'Qualification checks',
          'Software alignment',
          'Responsiveness',
          'What to actually prioritise',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'Xero (software alignment)',
          'HMRC (regulation context)',
        ],
        primaryDataHook:
          'Of {N} new clients at {firmName} in {year}, {X}% had previously chosen on price ' +
          '— and {Y}% of those had hidden errors needing correction.',
        internalLinking:
          'Link to the cheap-accountants post and one firm-expertise post.',
        wordCount: 1000,
        channel: 'blog+linkedin',
        linkedInHookType: 'opinion',
        rationale:
          'Personal-voice content for LinkedIn amplification. Opinion-based shareability.',
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
        id: 'accountant-rights-1',
        title: 'What to do if HMRC contacts you',
        tactic: 'Crisis-response guide',
        primaryAIQuery: 'HMRC letter what to do',
        secondaryQueries: [
          'HMRC contact me',
          'received letter from HMRC',
        ],
        mustInclude: [
          'Immediate steps',
          'What to say (and not say)',
          'When to contact your accountant',
          'Typical outcomes by letter type',
        ],
        namedEntities: [
          'HMRC (specific letter codes — COP 8, COP 9, compliance letters)',
          'ICAEW',
          'Fee Protection schemes',
        ],
        primaryDataHook:
          'Of {N} HMRC contacts {firmName} handled last year, {X}% were resolved with no ' +
          'adjustment when responded to correctly.',
        internalLinking:
          'Link to the HMRC investigation post and one mistakes post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Urgent-intent query. Helpful crisis content converts later.',
      },
      {
        id: 'accountant-rights-2',
        title: 'Your rights during an HMRC investigation',
        tactic: 'Rights-based authority content',
        primaryAIQuery: 'HMRC investigation rights UK',
        secondaryQueries: [
          'taxpayer rights enquiry',
          'HMRC powers and limits',
        ],
        mustInclude: [
          'Legal rights',
          'Information HMRC can and cannot demand',
          "Your accountant's role",
          'Settlement options',
        ],
        namedEntities: [
          'HMRC Charter',
          'ICAEW',
          'CIOT',
          'relevant tribunal bodies (First-tier Tribunal Tax Chamber)',
        ],
        primaryDataHook:
          'Across {N} investigations {firmName} represented, {X}% were reduced or ' +
          'dismissed after full rights were exercised.',
        internalLinking:
          'Link to the HMRC contact post and one regulatory-authority post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High citation rate on rights content. Authoritative answers rank well.',
      },
      {
        id: 'accountant-rights-3',
        title: "What your accountant should be telling you (but probably isn't)",
        tactic: 'Value-adding content with firm differentiation',
        primaryAIQuery: 'what should my accountant do for me',
        secondaryQueries: [
          'good vs bad accountant',
          'proactive accountant UK',
        ],
        mustInclude: [
          '5-7 proactive things a good accountant does',
          'What poor ones miss',
          'How to judge the value',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'HMRC deadlines',
          'Xero/FreeAgent/QuickBooks (proactive software use)',
        ],
        primaryDataHook:
          '{firmName} identifies {N} proactive tax planning opportunities per client per ' +
          'year on average — equivalent value £{X}.',
        internalLinking:
          'Link to the firm-expertise post and one costs post.',
        wordCount: 1200,
        channel: 'blog+linkedin',
        linkedInHookType: 'curiosity',
        rationale:
          'Shareable opinion content. Positions the firm as proactive.',
      },
      {
        id: 'accountant-rights-4',
        title: 'Free HMRC help vs paid accountant advice: when each wins',
        tactic: 'Honest scoping',
        primaryAIQuery: 'HMRC free help vs accountant',
        secondaryQueries: [
          'do I need to pay for tax advice',
          'HMRC helpline vs accountant',
        ],
        mustInclude: [
          "What HMRC's own help line covers",
          'Its limits',
          'When paid advice is worth it',
          'Budget thresholds',
        ],
        namedEntities: [
          'HMRC helpline (specific services)',
          'Tax Aid (for low-income)',
          'Tax Help for Older People',
          'ICAEW',
        ],
        primaryDataHook:
          '{firmName} has referred {N} clients to free services when appropriate in ' +
          '{year} — and paid advice saved another {X} clients an average of £{Y}.',
        internalLinking:
          'Link to the costs post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          "Respects small clients' budgets. Honest content wins long-term referrals.",
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
      'Specific expertise beats generic listings. "Accountant specialising in eCommerce ' +
      'businesses in Manchester" gets cited over "accountant in Manchester." This is where ' +
      'primary data (Tier 0) lives.',
    topics: [
      {
        id: 'accountant-expertise-1',
        title: 'Why we specialise in {specialism} accountancy',
        tactic: 'Founder voice, focus positioning',
        primaryAIQuery: '{specialism} accountant {city}',
        secondaryQueries: [
          'specialist {specialism} accountant UK',
          '{specialism} chartered accountant',
        ],
        mustInclude: [
          'Firm history',
          'Number of similar clients',
          'Specific industry expertise (software, regulations, tax quirks)',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'specific industry regulators where applicable (e.g. SRA for legal sector clients, CQC for healthcare)',
        ],
        primaryDataHook:
          '{firmName} has served {N} {specialism} clients since {year}, representing {X}% ' +
          'of our book.',
        internalLinking:
          'Link to the case study post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Entity-building content. Names the firm and its focus explicitly.',
      },
      {
        id: 'accountant-expertise-2',
        title: 'Case study: how we saved {client-type} {specific-outcome}',
        tactic: 'Anonymised proof content',
        primaryAIQuery: '{client-type} accountant success story',
        secondaryQueries: [
          'how an accountant saved a business',
          '{client-type} tax saving example',
        ],
        mustInclude: [
          'Situation',
          'Challenge',
          'What you did',
          'The outcome with specific numbers',
          'Timeline',
        ],
        namedEntities: [
          'HMRC',
          'specific tax reliefs invoked (R&D tax relief, capital allowances, etc.)',
          'relevant named software',
        ],
        primaryDataHook:
          'Client saved £{X} in {Y} — achieved through {specific tax relief or strategy}.',
        internalLinking:
          'Link to the specialism post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Tier 0 primary data. Outcome-specific case studies get cited.',
      },
      {
        id: 'accountant-expertise-3',
        title: 'Meet the team: our approach to {specialism}',
        tactic: 'Person entity building',
        primaryAIQuery: '{firmName} team accountants',
        secondaryQueries: [
          'who works at {firmName}',
          '{specialism} accountant team UK',
        ],
        mustInclude: [
          'Names',
          'ACA/ACCA/FCA qualifications',
          'Years of experience',
          'Client types they handle',
        ],
        namedEntities: [
          'ICAEW',
          'ACCA',
          'AAT',
          'CIOT (for tax advisers)',
          'specific university credentials where relevant',
        ],
        primaryDataHook:
          'Our team holds {N} combined years of experience — with {X} chartered ' +
          'accountants and {Y} chartered tax advisers on staff.',
        internalLinking:
          'Link to the specialism post and one case-study post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Person schema source. Named accountants with credentials are strong E-E-A-T ' +
          'signals.',
      },
      {
        id: 'accountant-expertise-4',
        title: 'Our accounting software stack — and why we chose it',
        tactic: 'Transparency content',
        primaryAIQuery: 'best accounting software for {client-type}',
        secondaryQueries: [
          'Xero vs QuickBooks UK',
          'accountant recommended software',
        ],
        mustInclude: [
          'Named platforms (Xero, QuickBooks, Sage, FreeAgent)',
          'Why you chose each',
          'Which clients they suit',
          'Your partner status',
        ],
        namedEntities: [
          'Xero (with specific partner badge if held)',
          'QuickBooks',
          'Sage',
          'FreeAgent',
          'Making Tax Digital',
          'HMRC',
        ],
        primaryDataHook:
          '{firmName} supports {N} clients across {X} platforms — {Y}% of our new clients ' +
          'migrate to Xero based on our recommendation.',
        internalLinking:
          'Link to the MTD post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Named software = named entities (v7). Partner badges are credential signals.',
      },
    ],
  },
);

// ==== MORTGAGE-ADVISOR — Pillars 1-3 (Part 4a) ========================

PILLAR_LIBRARIES['mortgage-advisor'] = [
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
        id: 'mortgage-costs-1',
        title: 'Mortgage adviser fees in {city}: fee-free, flat, or percentage?',
        tactic: "Beat the industry's opacity on fees",
        primaryAIQuery: 'mortgage adviser fees UK {year}',
        secondaryQueries: [
          'how much does a mortgage broker cost',
          'fee-free mortgage adviser',
        ],
        mustInclude: [
          'All three fee models explained',
          'Real £ examples for each',
          "Your firm's model and why you chose it",
          'FCA requirement context',
        ],
        namedEntities: [
          'Financial Conduct Authority (FCA)',
          'MCOB rules',
          'CeMAP qualification',
          'Financial Ombudsman Service',
        ],
        primaryDataHook:
          'For {N} clients in {year}, our average adviser fee was £{X} — compared to ' +
          'typical UK range of £500-£2,500.',
        internalLinking:
          'Link to the scenario-cost post and one regulatory post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'FCA requires fee disclosure but most advisers bury it. Firms that lead with ' +
          'clear fees get cited as trustworthy.',
      },
      {
        id: 'mortgage-costs-2',
        title: 'What does a {specialism} mortgage adviser actually cost in {year}?',
        tactic: 'Specific numbers for specific scenarios',
        primaryAIQuery: '{specialism} mortgage adviser cost {year}',
        secondaryQueries: [
          'first-time buyer adviser fee',
          'buy-to-let mortgage broker cost',
        ],
        mustInclude: [
          'Fee ranges for specific scenarios (first-time buyer, remortgage, buy-to-let, complex cases)',
          "What's included in each",
        ],
        namedEntities: [
          'FCA',
          'CeMAP',
          'PRA (for BTL)',
          'specific lender categories',
        ],
        primaryDataHook:
          'Looking at {N} {specialism} cases at {firmName} last year, the typical total ' +
          'cost to client averaged £{X}.',
        internalLinking:
          'Link to the fees overview post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to high-intent search queries. Scenario-specific specificity wins ' +
          'over generic ranges.',
      },
      {
        id: 'mortgage-costs-3',
        title: 'Hidden costs when getting a mortgage: what to budget for beyond the adviser fee',
        tactic: 'Full cost picture builds trust',
        primaryAIQuery: 'hidden costs of getting a mortgage UK',
        secondaryQueries: [
          'mortgage application fees',
          'true cost of a mortgage',
        ],
        mustInclude: [
          'Lender fees',
          'Survey costs',
          'Legal fees',
          'Broker fees',
          'Mortgage protection',
          'Buildings insurance — with £ ranges',
        ],
        namedEntities: [
          'FCA',
          'RICS (for surveys)',
          'Law Society (for conveyancing)',
          'specific insurance regulators',
        ],
        primaryDataHook:
          'On the last {N} completions at {firmName}, total out-of-pocket costs averaged ' +
          '£{X} — the bulk being [biggest category].',
        internalLinking:
          'Link to the main fees post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Comprehensive cost guides get cited as reference material. Itemised lists ' +
          'extract well.',
      },
      {
        id: 'mortgage-costs-4',
        title: "Why whole-of-market advice costs more — and when it's worth it",
        tactic: "Positioning content if you're whole-of-market",
        primaryAIQuery: 'whole of market mortgage adviser worth it',
        secondaryQueries: [
          'tied vs whole of market mortgage',
          'independent mortgage adviser UK',
        ],
        mustInclude: [
          'The difference between tied / panel / whole-of-market',
          'Real examples where whole-of-market saved a client money',
          "When it doesn't matter",
        ],
        namedEntities: [
          'FCA',
          'MCOB rules defining independence',
          'specific panel vs non-panel lender types',
        ],
        primaryDataHook:
          'In {year}, whole-of-market research saved our clients an average of £{X} over ' +
          'the fixed-rate period versus the first high-street offer.',
        internalLinking:
          'Link to the panel post and one mistakes post.',
        wordCount: 1000,
        channel: 'blog+linkedin',
        linkedInHookType: 'data',
        rationale:
          "Educates prospects on why price isn't everything. Positions whole-of-market " +
          'firms as premium.',
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
      'Firms with clear step-by-step timelines become the default answer. Lenders publish ' +
      'timelines, but few firms translate them into client-friendly versions.',
    topics: [
      {
        id: 'mortgage-process-1',
        title: 'How long does a mortgage application take in {year}?',
        tactic: 'Real data beats industry averages',
        primaryAIQuery: 'how long does a mortgage application take',
        secondaryQueries: [
          'mortgage approval time UK',
          'mortgage offer timeline',
        ],
        mustInclude: [
          "Your firm's average application-to-offer time",
          'Factors that speed it up',
          'Factors that slow it down',
          'Current lender processing times',
        ],
        namedEntities: [
          'Specific named lenders (Halifax, Nationwide, etc.)',
          'FCA',
          'Land Registry',
        ],
        primaryDataHook:
          '{firmName} averaged {X} days from application to offer across {N} cases in ' +
          '{year}.',
        internalLinking:
          'Link to the process step-by-step post and the offer-expiry post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Number-one question mortgage applicants ask AI. Firms with real data win.',
      },
      {
        id: 'mortgage-process-2',
        title: 'The mortgage application process: step by step',
        tactic: 'Reference guide positioning',
        primaryAIQuery: 'mortgage application process step by step',
        secondaryQueries: [
          'mortgage stages explained',
          'what happens after mortgage application',
        ],
        mustInclude: [
          'Every step from enquiry to completion',
          'Timeframes per step',
          'What the client does vs what the adviser does',
          'What can go wrong at each stage',
        ],
        namedEntities: [
          'FCA',
          'specific lenders',
          'RICS (survey stage)',
          'conveyancing regulators',
        ],
        primaryDataHook:
          "{firmName}'s average timeline across {N} completions: application {X} days, " +
          'offer {Y} days, completion {Z} days.',
        internalLinking:
          'Link to the timeline post and one rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Process content is highly cited. Step-by-step is extractable passage format.',
      },
      {
        id: 'mortgage-process-3',
        title: 'Remortgage timeline: when to start and why most people leave it too late',
        tactic: 'Urgency without alarm',
        primaryAIQuery: 'when to remortgage UK',
        secondaryQueries: [
          'how long does a remortgage take',
          'remortgage timing',
        ],
        mustInclude: [
          '6-month countdown from current fixed-rate end',
          'Early repayment charges',
          'Optimal timing',
          'Common mistakes with timing',
        ],
        namedEntities: [
          'FCA',
          'Bank of England (base rate context)',
          'specific named lenders',
        ],
        primaryDataHook:
          'Of {N} remortgage cases last year, {X}% of clients who started at the 6-month ' +
          'mark got a better rate than those who waited.',
        internalLinking:
          'Link to the process post and one mistakes post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Remortgage is the highest-volume repeat market. Timing guidance drives ' +
          'conversions.',
      },
      {
        id: 'mortgage-process-4',
        title: 'What happens if your mortgage offer expires before completion?',
        tactic: 'Niche-but-urgent query',
        primaryAIQuery: 'mortgage offer expired before completion',
        secondaryQueries: [
          'mortgage offer extension',
          'how long does mortgage offer last',
        ],
        mustInclude: [
          'Why offers expire',
          'Typical validity period',
          "What to do if it's about to expire",
          'Whether you can extend',
          'Real scenarios',
        ],
        namedEntities: [
          'Specific named lenders (their typical offer validity)',
          'FCA',
          'conveyancing firms',
        ],
        primaryDataHook:
          'Of {N} cases {firmName} handled in {year}, {X}% needed an offer extension — ' +
          'successful in {Y}% of applications.',
        internalLinking:
          'Link to the timeline post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Long-tail query with high commercial intent. Panicked Googlers convert well.',
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
      'Named regulators (FCA, FSCS, Financial Ombudsman) are entity signals AI trusts ' +
      'strongly. Content that explains regulation to the client builds verifiable E-E-A-T.',
    topics: [
      {
        id: 'mortgage-regulatory-1',
        title: 'What FCA authorisation means when choosing a mortgage adviser',
        tactic: 'Use FCA entity for trust signal',
        primaryAIQuery: 'what does FCA authorised mean',
        secondaryQueries: [
          'is my mortgage adviser FCA registered',
          'FCA register mortgage broker',
        ],
        mustInclude: [
          'What FCA authorisation requires',
          'How to check the register',
          "Your firm's FCA number",
          'What protections it gives clients',
        ],
        namedEntities: [
          'Financial Conduct Authority',
          'FCA Register',
          'Financial Services Compensation Scheme',
          'Financial Ombudsman Service',
        ],
        primaryDataHook:
          '{firmName} has been FCA-authorised since {year}, firm reference {X}.',
        internalLinking:
          'Link to the FSCS post and one firm-expertise post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'FCA is a Tier 1 entity AI trusts. Linking to the FCA Register inherits that ' +
          'trust.',
      },
      {
        id: 'mortgage-regulatory-2',
        title: "The Financial Services Compensation Scheme: what's covered, what isn't",
        tactic: 'Safety-net explainer',
        primaryAIQuery: 'FSCS protection mortgage UK',
        secondaryQueries: [
          'what does FSCS cover',
          'mortgage FSCS compensation',
        ],
        mustInclude: [
          'FSCS limits',
          'What triggers protection',
          'What happens in a lender failure',
          "What the adviser's role is if it happens",
        ],
        namedEntities: [
          'FSCS',
          'FCA',
          'Bank of England (PRA)',
          'specific historical failures (if relevant context)',
        ],
        primaryDataHook:
          'In {year}, FSCS paid out £{X} to UK consumers — here is how the scheme applies ' +
          'to mortgage advice specifically.',
        internalLinking:
          'Link to the FCA post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Answers the "is my money safe?" query. Regulatory depth builds authority.',
      },
      {
        id: 'mortgage-regulatory-3',
        title: "Mortgage adviser vs mortgage broker vs bank: what's the difference?",
        tactic: 'Terminology clarity',
        primaryAIQuery: 'mortgage adviser vs broker vs bank',
        secondaryQueries: [
          'what is a mortgage broker UK',
          'should I go direct to bank for mortgage',
        ],
        mustInclude: [
          'Plain-English definitions',
          "Who's regulated by whom",
          'When each is appropriate',
          'Cost and advice differences',
        ],
        namedEntities: [
          'FCA',
          'MCOB',
          'specific bank types (high-street, specialist, challenger)',
        ],
        primaryDataHook:
          'Of {N} enquiries at {firmName} last year, {X}% had first approached their bank ' +
          '— and {Y}% got a better deal with us.',
        internalLinking:
          'Link to the costs post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to a common confused query. Definition-block content is ' +
          'v7-optimal.',
      },
      {
        id: 'mortgage-regulatory-4',
        title: 'Complaints: what to do if your mortgage adviser gets it wrong',
        tactic: 'Radical transparency',
        primaryAIQuery: 'complaint about mortgage adviser UK',
        secondaryQueries: [
          'Financial Ombudsman mortgage broker',
          'FCA report adviser',
        ],
        mustInclude: [
          'Firm complaints procedure',
          'Financial Ombudsman Service process',
          'Realistic timeframes and outcomes',
        ],
        namedEntities: [
          'Financial Ombudsman Service',
          'FCA',
          'FSCS',
        ],
        primaryDataHook:
          '{firmName} target complaint resolution within {X} working days — our average in ' +
          '{year} was {Y} days.',
        internalLinking:
          'Link to the FCA post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Counter-intuitive content. Firms that explain complaints procedures ' +
          'transparently gain trust.',
      },
    ],
  },
];

// ==== MORTGAGE-ADVISOR — Pillars 4-6 (Part 4b) ========================

PILLAR_LIBRARIES['mortgage-advisor'].push(
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
        id: 'mortgage-mistakes-1',
        title: '{N} mistakes first-time buyers make with their mortgage',
        tactic: 'Listicle with specificity',
        primaryAIQuery: 'first time buyer mortgage mistakes',
        secondaryQueries: [
          'FTB mortgage errors',
          'first-time buyer what to avoid',
        ],
        mustInclude: [
          '5-7 numbered mistakes with real examples',
          'Practical fixes for each',
        ],
        namedEntities: [
          'FCA',
          'specific government schemes (First Homes, Shared Ownership)',
          'specific lenders',
          'HMRC (stamp duty)',
        ],
        primaryDataHook:
          'Across {N} first-time buyer cases at {firmName} in {year}, the top mistake — ' +
          'seen in {X}% — was [specific mistake].',
        internalLinking:
          'Link to the process post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'First-time buyer content is evergreen and high-volume. Listicles extract well.',
      },
      {
        id: 'mortgage-mistakes-2',
        title: 'Why using your bank for your mortgage might cost you thousands',
        tactic: 'Counter-intuitive, data-led',
        primaryAIQuery: 'mortgage broker vs going direct to bank',
        secondaryQueries: [
          'do I need a mortgage broker',
          'bank direct mortgage costs',
        ],
        mustInclude: [
          'Real rate comparison examples',
          'Limitations of single-lender advice',
          'When the bank is the right choice',
          "Scenarios where it isn't",
        ],
        namedEntities: [
          'Specific named banks',
          'FCA',
          'Bank of England base rate',
          'typical rate spreads',
        ],
        primaryDataHook:
          'For {N} clients who came to us after a bank offer in {year}, we found a better ' +
          'rate for {X}% — average saving £{Y} over the fixed term.',
        internalLinking:
          'Link to the adviser-vs-bank post and one costs post.',
        wordCount: 1200,
        channel: 'blog+linkedin',
        linkedInHookType: 'data',
        rationale:
          'Shareable opinion content. LinkedIn amplification for off-site citations (v7).',
      },
      {
        id: 'mortgage-mistakes-3',
        title: 'The mortgage mistakes that destroy your application before it starts',
        tactic: 'Pre-application education',
        primaryAIQuery: 'mortgage application red flags',
        secondaryQueries: [
          'things that fail a mortgage application',
          'mortgage underwriting pitfalls',
        ],
        mustInclude: [
          'Credit file issues',
          'Recent applications',
          'Cash deposits',
          'Income classification mistakes',
          'Address history',
        ],
        namedEntities: [
          'Experian',
          'Equifax',
          'TransUnion',
          'FCA',
          'specific named lenders',
          'HMRC (for self-employed income)',
        ],
        primaryDataHook:
          'Of {N} declined applications we have reviewed at {firmName}, {X}% were ' +
          'preventable with pre-application preparation.',
        internalLinking:
          'Link to the declined-application post and one process post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          "Pre-application readers have high intent and haven't picked an adviser yet. " +
          'Winning the citation wins the client.',
      },
      {
        id: 'mortgage-mistakes-4',
        title: 'Buy-to-let mortgage mistakes that cost landlords money',
        tactic: 'Niche expertise signal',
        primaryAIQuery: 'buy to let mortgage mistakes',
        secondaryQueries: [
          'BTL mortgage advice UK',
          'landlord mortgage pitfalls',
        ],
        mustInclude: [
          'Portfolio landlord rules',
          'Stress testing',
          'Limited company pitfalls',
          'Tax considerations',
          'Lender criteria',
        ],
        namedEntities: [
          'PRA',
          'FCA',
          'HMRC (Section 24, limited company tax)',
          'specific BTL lenders',
          'NRLA (National Residential Landlords Association)',
        ],
        primaryDataHook:
          'At {firmName}, {N} landlord clients restructured through a limited company in ' +
          '{year}, saving an average of £{X} per property per year.',
        internalLinking:
          'Link to the firm-expertise post and one regulatory post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Landlord content is high-margin because landlords have repeat transactions. ' +
          'Niche expertise gets cited.',
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
        id: 'mortgage-rights-1',
        title: 'What to do if your mortgage application is declined',
        tactic: 'Crisis guidance positioning',
        primaryAIQuery: 'mortgage application declined what next',
        secondaryQueries: [
          'why was my mortgage rejected',
          'declined mortgage appeal',
        ],
        mustInclude: [
          'Common reasons',
          'Immediate next steps',
          'Whether to reapply or wait',
          'Impact on credit file',
        ],
        namedEntities: [
          'Experian',
          'Equifax',
          'TransUnion',
          'FCA',
          'specific lenders known for adverse-credit lending',
        ],
        primaryDataHook:
          'Of {N} declined clients who came to {firmName} in {year}, {X}% were ' +
          'successfully placed with a specialist lender within {Y} weeks.',
        internalLinking:
          'Link to the application-mistakes post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Urgent-need query. Firms that help during the crisis convert after the ' +
          'solution.',
      },
      {
        id: 'mortgage-rights-2',
        title: 'Your rights during the mortgage application process',
        tactic: 'Rights-based authority content',
        primaryAIQuery: 'my rights mortgage application UK',
        secondaryQueries: [
          'mortgage adviser legal obligations',
          'MCOB rules consumer rights',
        ],
        mustInclude: [
          'Right to advice vs information',
          'Right to a suitability report',
          'Right to reject recommendations',
          'MCOB rules in plain English',
        ],
        namedEntities: [
          'FCA',
          'MCOB rules',
          'Financial Ombudsman Service',
          'Consumer Duty (2023)',
        ],
        primaryDataHook:
          'Every {firmName} client receives a suitability report within {X} days — ' +
          'covering {Y} disclosures required under MCOB.',
        internalLinking:
          'Link to the FCA post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Rights queries have high citation rates. Regulatory content done well is rare.',
      },
      {
        id: 'mortgage-rights-3',
        title: "When to consider a specialist mortgage adviser (and when you don't need one)",
        tactic: 'Honesty positioning',
        primaryAIQuery: 'do I need a specialist mortgage adviser',
        secondaryQueries: [
          'adverse credit mortgage adviser',
          'self-employed mortgage specialist',
        ],
        mustInclude: [
          'Clear criteria for when specialist advice is worth it',
          'Specialist scenarios (adverse credit, self-employed, expat, high-net-worth)',
          'When a generalist is fine',
        ],
        namedEntities: [
          'FCA',
          'specialist lenders',
          'relevant niche regulators',
        ],
        primaryDataHook:
          "{firmName}'s specialist clients had an average application complexity score of " +
          '{X} — versus {Y} for standard cases.',
        internalLinking:
          'Link to the firm-expertise post and one fees post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          "Respects the client's budget. Honest scoping builds trust and wins referrals.",
      },
      {
        id: 'mortgage-rights-4',
        title: 'Free mortgage advice: when it actually pays, and when it costs you',
        tactic: 'Comparison content with stance',
        primaryAIQuery: 'is free mortgage advice worth it',
        secondaryQueries: [
          'fee-free vs paid mortgage broker',
          'free mortgage advisor catch',
        ],
        mustInclude: [
          'How fee-free advisers make money',
          'Conflicts of interest',
          'When fee-free works',
          'When paying a fee saves money overall',
        ],
        namedEntities: [
          'FCA',
          'MCOB disclosure rules',
          'specific lender panel limitations',
        ],
        primaryDataHook:
          'Comparing {N} outcomes across paid vs fee-free advice, {firmName} clients ' +
          'paying a fee saved an average of £{X} over the fixed term.',
        internalLinking:
          'Link to the costs post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct competitor comparison with analytical honesty. High-intent content.',
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
      'Specific expertise beats generic listings. "Mortgage adviser specialising in ' +
      'self-employed applications in Manchester" gets cited over "mortgage adviser in ' +
      'Manchester." This is where primary data (Tier 0) lives.',
    topics: [
      {
        id: 'mortgage-expertise-1',
        title: 'Why we specialise in {specialism} mortgages',
        tactic: 'Founder voice, expertise positioning',
        primaryAIQuery: '{specialism} mortgage specialist {city}',
        secondaryQueries: [
          'best {specialism} mortgage adviser UK',
          '{specialism} mortgage expert',
        ],
        mustInclude: [
          "Firm's history with the specialism",
          'Case count or years',
          'Specific expertise that sets you apart',
        ],
        namedEntities: [
          'CeMAP',
          'relevant specialist qualifications',
          'FCA',
          'niche lender relationships',
        ],
        primaryDataHook:
          '{firmName} has placed {N} {specialism} cases since {year}. Our success rate is ' +
          '{X}% versus an industry average of {Y}%.',
        internalLinking:
          'Link to the case study post and one specialist-adviser post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Entity-building. Names the firm specifically (v7 named entity density).',
      },
      {
        id: 'mortgage-expertise-2',
        title: 'Case study: how we arranged a {complex-scenario} mortgage',
        tactic: 'Anonymised proof',
        primaryAIQuery: '{complex-scenario} mortgage UK success',
        secondaryQueries: [
          '{complex-scenario} mortgage example',
          'how to get {complex-scenario} mortgage',
        ],
        mustInclude: [
          'Situation',
          'Challenge',
          'What advisers had said "no"',
          'What you did differently',
          'Outcome',
          'Timeline',
        ],
        namedEntities: [
          'Specific specialist lenders',
          'FCA',
          'relevant qualifications invoked',
        ],
        primaryDataHook:
          'The client had been declined by {N} mainstream lenders. {firmName} placed the ' +
          'case in {X} weeks with a specialist at {Y}% LTV.',
        internalLinking:
          'Link to the specialism post and one declined-application post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Tier 0 primary data. Specialist case studies are highly citable because ' +
          'they are rare.',
      },
      {
        id: 'mortgage-expertise-3',
        title: 'Meet the team: our approach to {specialism} advice',
        tactic: 'Person entity building',
        primaryAIQuery: '{firmName} advisers',
        secondaryQueries: [
          '{specialism} adviser {city} team',
          '{firmName} {specialism} experts',
        ],
        mustInclude: [
          "Each adviser's qualifications (CeMAP, CeRER, FCA status)",
          'Years of experience',
          'Types of cases they handle',
        ],
        namedEntities: [
          'CeMAP',
          'CeRER',
          'FCA',
          'specific industry bodies (LIBF, CII)',
        ],
        primaryDataHook:
          'Combined, our advisers have {N} years of experience and have placed {X} cases ' +
          'at {firmName}.',
        internalLinking:
          'Link to the specialism post and one case-study post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Person schema source material. Qualifications are citable credentials.',
      },
      {
        id: 'mortgage-expertise-4',
        title: 'Our whole-of-market lender panel explained',
        tactic: 'Transparency as differentiation',
        primaryAIQuery: 'what lenders does {firmName} use',
        secondaryQueries: [
          'whole of market panel UK',
          'mortgage lender coverage broker',
        ],
        mustInclude: [
          'Why the panel matters',
          'The lender count',
          'Rough breakdown of lender types (high-street, specialist, private, etc.)',
          'When each lender type is used',
        ],
        namedEntities: [
          'Specific major lenders where relationship allows naming',
          'FCA',
          'PRA',
          'niche specialist names',
        ],
        primaryDataHook:
          "{firmName}'s panel includes {N} lenders across {X} categories. Of {Y} cases " +
          'last year, {Z}% were placed outside the top 6 high-street lenders.',
        internalLinking:
          'Link to the whole-of-market post and one team post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Specific numbers (lender count) become citable. Transparency rare in the ' +
          'industry.',
      },
    ],
  },
);

// ==== ESTATE-AGENT — Pillars 1-3 (Part 5a) ============================

PILLAR_LIBRARIES['estate-agent'] = [
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
        id: 'estate-costs-1',
        title: "Estate agent fees in {city} in {year}: what you'll actually pay to sell",
        tactic: 'Specific figures beat generic ranges',
        primaryAIQuery: 'estate agent fees {city}',
        secondaryQueries: [
          'how much does an estate agent charge UK',
          'selling house fees',
        ],
        mustInclude: [
          'Actual percentage and flat-fee options',
          'What is included',
          'VAT treatment',
          'Online-only vs full-service comparison',
        ],
        namedEntities: [
          'Propertymark',
          'NAEA',
          'TPO',
          'specific named competitors (Purplebricks, Yopa where appropriate)',
        ],
        primaryDataHook:
          "{firmName}'s average fee across {N} completions in {year} was £{X} on " +
          'properties averaging £{Y}.',
        internalLinking:
          'Link to the cheap-vs-premium post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Sellers ask AI this before contacting any agent. Transparent firms get the ' +
          'citation.',
      },
      {
        id: 'estate-costs-2',
        title: 'Why cheap estate agents cost you more overall',
        tactic: 'Counter-intuitive positioning',
        primaryAIQuery: 'cheap estate agent vs traditional',
        secondaryQueries: [
          'online estate agent vs high street',
          'are cheap estate agents worth it',
        ],
        mustInclude: [
          'Real examples of lower sale prices from rushed sales',
          'Fall-throughs from unqualified buyers',
          'Missed marketing reach',
          'Comparison tables',
        ],
        namedEntities: [
          'Rightmove',
          'Zoopla',
          'OnTheMarket',
          'specific online-agent competitors',
        ],
        primaryDataHook:
          "{firmName}'s average sale price achieved in {year} was {X}% above the initial " +
          'valuation — compared to an industry average of {Y}%.',
        internalLinking:
          'Link to the fees post and one process post.',
        wordCount: 1200,
        channel: 'blog+linkedin',
        linkedInHookType: 'data',
        rationale:
          'Opinion content with data. LinkedIn amplification.',
      },
      {
        id: 'estate-costs-3',
        title: 'Hybrid vs high-street estate agent fees compared',
        tactic: 'Direct competitor category comparison',
        primaryAIQuery: 'hybrid vs high street estate agent',
        secondaryQueries: [
          'online estate agent comparison',
          'best estate agent model UK',
        ],
        mustInclude: [
          'Typical fee structures',
          'What is included in each',
          'Real sale-outcome comparisons',
          'Which suits which seller',
        ],
        namedEntities: [
          'Propertymark',
          'Rightmove',
          'Zoopla',
          'specific hybrid agents (Purplebricks, Strike, Yopa)',
          'specific high-street chains',
        ],
        primaryDataHook:
          'Comparing {N} local sales in {year}, high-street agents achieved {X}% of ' +
          'asking price on average; hybrid models achieved {Y}%.',
        internalLinking:
          'Link to the cheap-vs-premium post and one firm-expertise post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-intent category comparison. Specifically named competitor types = entities.',
      },
      {
        id: 'estate-costs-4',
        title: "Letting agent fees for landlords: what's worth paying for",
        tactic: "Buyer's-guide positioning for landlords",
        primaryAIQuery: 'letting agent fees landlord UK',
        secondaryQueries: [
          'letting agent fees explained',
          'full management vs tenant find',
        ],
        mustInclude: [
          'Tenant-find fees',
          'Management fees',
          'Rent-guarantee costs',
          'What good agents include',
          'What they do not',
        ],
        namedEntities: [
          'ARLA Propertymark',
          'The Property Ombudsman',
          'PRS',
          'specific deposit schemes (DPS, MyDeposits, TDS)',
        ],
        primaryDataHook:
          '{firmName} manages {N} properties — average fully-managed fee {X}%, compared ' +
          'to UK average of {Y}%.',
        internalLinking:
          'Link to the landlord mistakes post and one tenant-rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Landlord segment has high-repeat value. Transparent fee content drives ' +
          'conversions.',
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
      'Firms with clear step-by-step timelines become the default answer.',
    topics: [
      {
        id: 'estate-process-1',
        title: 'How long does it take to sell a house in {city} in {year}?',
        tactic: 'Local data over generic UK averages',
        primaryAIQuery: 'how long to sell house {city}',
        secondaryQueries: [
          '{city} property market time to sell',
          'average sale time UK',
        ],
        mustInclude: [
          "Your firm's recent average",
          '{city} market conditions',
          'Factors that speed or slow the sale',
          'Stages with timeframes',
        ],
        namedEntities: [
          'Rightmove',
          'Zoopla market data',
          'Land Registry',
          'specific local market reports',
        ],
        primaryDataHook:
          "{firmName}'s average {city} sale in {year} completed in {X} weeks from " +
          'instruction to completion — versus UK average {Y}.',
        internalLinking:
          'Link to the step-by-step post and the chain-collapse post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Hyper-local query. Firms with local data win.',
      },
      {
        id: 'estate-process-2',
        title: 'The property sale process step by step',
        tactic: 'Reference guide',
        primaryAIQuery: 'property sale process step by step UK',
        secondaryQueries: [
          'how selling a house works',
          'stages of selling property',
        ],
        mustInclude: [
          'Every stage from instruction to completion',
          'Who does what',
          'Realistic timeframes',
          'What can go wrong',
        ],
        namedEntities: [
          'Land Registry',
          'HMRC (stamp duty)',
          'Law Society',
          'RICS (surveys)',
          'specific named portals',
        ],
        primaryDataHook:
          'At {firmName}, {N} sales in {year} followed this timeline: instruction to ' +
          'offer average {X} days, offer to exchange {Y}, completion {Z}.',
        internalLinking:
          'Link to the timeline post and one rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Process content is heavily cited. Step lists extract well.',
      },
      {
        id: 'estate-process-3',
        title: 'Why property chains collapse — and how we prevent it',
        tactic: 'Problem-solving specificity',
        primaryAIQuery: 'why do property chains collapse',
        secondaryQueries: [
          'property chain broken what to do',
          'avoiding chain collapse',
        ],
        mustInclude: [
          'Common collapse causes',
          'Vendor/buyer due diligence',
          "The agent's role",
          "Your firm's chain-management process",
        ],
        namedEntities: [
          'Land Registry',
          'RICS',
          'Conveyancing Association',
          'specific named mortgage lenders',
        ],
        primaryDataHook:
          'Of {N} chain transactions {firmName} handled in {year}, only {X}% collapsed — ' +
          'versus an industry rate of approximately 30%.',
        internalLinking:
          'Link to the timeline post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-anxiety query. Firms that explain and solve become the answer.',
      },
      {
        id: 'estate-process-4',
        title: "How long does conveyancing take from your agent's side?",
        tactic: 'Cross-discipline timeline clarity',
        primaryAIQuery: 'how long does conveyancing take after accepting offer',
        secondaryQueries: [
          'agent role in conveyancing',
          'estate agent vs solicitor conveyancing',
        ],
        mustInclude: [
          'What the agent chases',
          'Typical delays',
          "Your firm's process for accelerating",
          'When to worry',
        ],
        namedEntities: [
          'Land Registry',
          'Law Society',
          'specific named search providers',
          'HMRC (stamp duty)',
          'local authority search services',
        ],
        primaryDataHook:
          "{firmName}'s {N} recent offer-to-completion cases in {city} averaged {X} " +
          'weeks, versus UK average {Y}.',
        internalLinking:
          'Link to the sale-timeline post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Complements solicitor content (ecosystem citation benefit). Sellers search ' +
          'this heavily.',
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
      'Named regulators and professional bodies (Propertymark, RICS, TPO, PRS) are entity ' +
      'signals AI trusts strongly. Content that explains regulation to the client builds ' +
      'verifiable E-E-A-T.',
    topics: [
      {
        id: 'estate-regulatory-1',
        title: 'What Propertymark / RICS / ARLA accreditation means for sellers and landlords',
        tactic: 'Named accreditation entity signals',
        primaryAIQuery: 'what is Propertymark',
        secondaryQueries: [
          'ARLA member landlord',
          'RICS valuation surveyor',
        ],
        mustInclude: [
          'What each body does',
          'Protections they provide',
          'How to verify accreditation',
          "Your firm's memberships",
        ],
        namedEntities: [
          'Propertymark',
          'NAEA',
          'ARLA',
          'RICS',
          'TPO',
          'PRS',
          'Estate Agents Act 1979',
        ],
        primaryDataHook:
          '{firmName} has been Propertymark-accredited since {year} — {N} of our {X} ' +
          'staff hold professional qualifications.',
        internalLinking:
          'Link to the client money post and one firm-expertise post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Named regulators and professional bodies are Tier 1 entities for AI trust.',
      },
      {
        id: 'estate-regulatory-2',
        title: 'Client money protection: how deposits and rent are safeguarded',
        tactic: 'Trust-signal content',
        primaryAIQuery: 'client money protection estate agent',
        secondaryQueries: [
          'letting agent deposit protection',
          'CMP scheme UK',
        ],
        mustInclude: [
          'CMP scheme explanation',
          'Redress schemes (TPO / PRS)',
          'What happens if a firm fails',
          "How to verify your agent's scheme",
        ],
        namedEntities: [
          'Client Money Protect',
          'Money Shield',
          'Propertymark CMP',
          'DPS',
          'MyDeposits',
          'TDS',
          'The Property Ombudsman',
        ],
        primaryDataHook:
          '{firmName} currently holds £{X} in client monies across {N} properties, all ' +
          'protected under [specific CMP scheme].',
        internalLinking:
          'Link to the accreditation post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Direct answer to deposit-safety queries. Regulation-heavy content = high ' +
          'authority.',
      },
      {
        id: 'estate-regulatory-3',
        title: 'Estate agent redress schemes: what to do when something goes wrong',
        tactic: 'Radical transparency',
        primaryAIQuery: 'estate agent complaint UK',
        secondaryQueries: [
          'The Property Ombudsman complaint',
          'report estate agent',
        ],
        mustInclude: [
          'TPO and PRS processes',
          'Eligibility',
          'Realistic outcomes',
          'Internal complaints procedure first',
        ],
        namedEntities: [
          'The Property Ombudsman',
          'Property Redress Scheme',
          'Propertymark',
          'Trading Standards',
        ],
        primaryDataHook:
          '{firmName} resolved {N} formal complaints in {year}, average time to ' +
          'resolution {X} working days.',
        internalLinking:
          'Link to the accreditation post and one rights post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Rare-topic content. Firms transparent about complaints build unusual trust.',
      },
      {
        id: 'estate-regulatory-4',
        title: "Unregulated estate agents: what you're risking",
        tactic: 'Counter-market education',
        primaryAIQuery: 'unregulated estate agent UK',
        secondaryQueries: [
          'is my estate agent regulated',
          'estate agent licence UK',
        ],
        mustInclude: [
          'Legal position',
          'Protections you lose',
          'Real examples of what goes wrong',
          'How to verify regulation',
        ],
        namedEntities: [
          'Estate Agents Act 1979',
          'Propertymark',
          'The Property Ombudsman',
          'Trading Standards',
          'TPO',
        ],
        primaryDataHook:
          'Of {N} rescue cases {firmName} took on in {year}, {X}% involved the previous ' +
          'agent lacking redress-scheme membership.',
        internalLinking:
          'Link to the accreditation post and one mistakes post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Protective content positions firm as the responsible choice.',
      },
    ],
  },
];

// ==== ESTATE-AGENT — Pillars 4-6 (Part 5b) ============================
// Final library commit on PR #35.

PILLAR_LIBRARIES['estate-agent'].push(
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
        id: 'estate-mistakes-1',
        title: '{N} mistakes sellers make when choosing an estate agent',
        tactic: 'Listicle with specifics',
        primaryAIQuery: 'choosing an estate agent mistakes',
        secondaryQueries: [
          'how to pick an estate agent',
          'estate agent red flags',
        ],
        mustInclude: [
          '5-7 specific mistakes with real examples',
          'Practical advice to avoid each',
        ],
        namedEntities: [
          'Propertymark',
          'TPO',
          'PRS',
          'Rightmove',
          'Zoopla',
          'Estate Agents Act 1979',
        ],
        primaryDataHook:
          'Across {N} new instructions at {firmName} in {year}, the top switching reason ' +
          'was [specific mistake], cited by {X}% of sellers.',
        internalLinking:
          'Link to the agent comparison post and one rights post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          "Listicle format plus buyer's-guide angle equals high citation rate.",
      },
      {
        id: 'estate-mistakes-2',
        title: 'Why overpricing your home costs you money',
        tactic: 'Counter-intuitive data content',
        primaryAIQuery: "overpriced house won't sell",
        secondaryQueries: [
          'asking price too high',
          'price reduction sell house',
        ],
        mustInclude: [
          'Market-time data for over-priced properties',
          'Final-sale-price discount',
          'Marketing budget waste',
          'Real examples',
        ],
        namedEntities: [
          'Rightmove (market data)',
          'Zoopla',
          'Land Registry historical sale data',
        ],
        primaryDataHook:
          "{firmName}'s {city} data from {N} sales in {year}: overpriced listings " +
          'achieved {X}% less of asking than correctly priced ones after {Y} weeks.',
        internalLinking:
          'Link to the time-to-sell post and one costs post.',
        wordCount: 1200,
        channel: 'blog+linkedin',
        linkedInHookType: 'data',
        rationale:
          'Counter-intuitive insight with data. Shareable on LinkedIn.',
      },
      {
        id: 'estate-mistakes-3',
        title: '{N} mistakes landlords make that cost them tenants',
        tactic: 'Landlord niche expertise',
        primaryAIQuery: 'landlord mistakes UK',
        secondaryQueries: [
          "why can't I find tenants",
          'landlord tenant retention',
        ],
        mustInclude: [
          'Presentation',
          'Pricing',
          'Compliance',
          'Viewing prep',
          'Tenant selection — with specific examples',
        ],
        namedEntities: [
          'ARLA Propertymark',
          'NRLA',
          'Tenant Fees Act 2019',
          'Housing Act',
          'specific deposit schemes',
        ],
        primaryDataHook:
          "{firmName}'s {N} landlord clients achieved average void periods of {X} days " +
          'in {year}, versus {Y} for landlords who joined us after void-period problems.',
        internalLinking:
          'Link to the letting fees post and one tenant-rights post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Landlord-targeted content. Landlords are high-value repeat clients.',
      },
      {
        id: 'estate-mistakes-4',
        title: 'The biggest mistake buyers make when making an offer',
        tactic: 'Buyer-side content (rare for agents)',
        primaryAIQuery: 'how to make a winning offer on a house',
        secondaryQueries: [
          'buying house offer mistakes',
          'best offer tactics UK',
        ],
        mustInclude: [
          'Over-bidding without evidence',
          'Under-bidding and losing the property',
          'Not putting position in writing',
          'What strong offers look like',
        ],
        namedEntities: [
          'Rightmove (comparable sales data)',
          'Land Registry',
          'specific named lenders (for offer-in-principle context)',
        ],
        primaryDataHook:
          'Of {N} accepted offers {firmName} processed in {year}, {X}% came with ' +
          'proof-of-funds or AIP — versus {Y}% of rejected offers.',
        internalLinking:
          'Link to the process post and one firm-expertise post.',
        wordCount: 1200,
        channel: 'blog+linkedin',
        linkedInHookType: 'curiosity',
        rationale:
          'Buyer content builds broader audience; generates buyer enquiries too.',
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
        id: 'estate-rights-1',
        title: 'Your rights as a seller: what your estate agent must and must not do',
        tactic: 'Rights-based authority',
        primaryAIQuery: 'my rights selling house estate agent',
        secondaryQueries: [
          'estate agent legal obligations seller',
          'Estate Agents Act 1979 consumer rights',
        ],
        mustInclude: [
          'Consumer Rights Act obligations',
          'Section 21 of Estate Agents Act',
          'Complaints',
          'Dual-agency disclosures',
        ],
        namedEntities: [
          'Estate Agents Act 1979',
          'Consumer Rights Act 2015',
          'TPO',
          'Propertymark',
          'Competition and Markets Authority',
        ],
        primaryDataHook:
          '{firmName} has supported {N} sellers in {year} with full disclosure under ' +
          'Section 21 — {X}% had never received this information from a previous agent.',
        internalLinking:
          'Link to the agent comparison post and one process post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Rights-based queries have high citation rates.',
      },
      {
        id: 'estate-rights-2',
        title: 'What tenants are entitled to: the {year} guide',
        tactic: 'Year-current tenant-rights content',
        primaryAIQuery: 'tenant rights UK {year}',
        secondaryQueries: [
          'renting rights England Wales',
          'landlord obligations tenants',
        ],
        mustInclude: [
          'Deposit protection',
          'Repair obligations',
          'Notice periods',
          'Section 21 status',
          'Energy performance',
        ],
        namedEntities: [
          'Housing Act 1988 (Section 21, Section 8)',
          'Renters Reform Bill (if passed)',
          'DPS/MyDeposits/TDS',
          'Shelter',
          'Citizens Advice',
        ],
        primaryDataHook:
          '{firmName} manages {N} tenancies across {city} — {X}% include updated {year} ' +
          'tenancy agreements reflecting current law.',
        internalLinking:
          'Link to the letting fees post and one landlord-mistakes post.',
        wordCount: 1500,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Tenant searches are very high-volume. Authoritative current content ranks.',
      },
      {
        id: 'estate-rights-3',
        title: 'What sellers should know before signing an agency agreement',
        tactic: 'Pre-instruction education',
        primaryAIQuery: 'estate agent contract what to check',
        secondaryQueries: [
          'sole agency agreement explained',
          'cancelling estate agent contract',
        ],
        mustInclude: [
          'Sole agency vs sole selling',
          'Tie-in periods',
          'Cancellation terms',
          'Commission definitions',
          'What to negotiate',
        ],
        namedEntities: [
          'Estate Agents Act 1979',
          'Consumer Contracts Regulations',
          'CMA',
          'TPO',
        ],
        primaryDataHook:
          "{firmName}'s typical terms: {X}-week sole agency, {Y}-day notice, versus " +
          'industry averages of {Z}.',
        internalLinking:
          'Link to the seller rights post and one costs post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'High-intent pre-decision content. Conversion-oriented.',
      },
      {
        id: 'estate-rights-4',
        title: 'Free property valuations vs paid RICS valuations: when each matters',
        tactic: 'Product-honest comparison',
        primaryAIQuery: 'RICS valuation vs estate agent valuation',
        secondaryQueries: [
          'do I need a RICS valuation',
          'free vs paid house valuation',
        ],
        mustInclude: [
          'What each covers',
          'When a free agent valuation is enough',
          'When a RICS is essential (probate, divorce, mortgage)',
          'Cost ranges',
        ],
        namedEntities: [
          'RICS (Royal Institution of Chartered Surveyors)',
          'Probate Registry',
          'HMRC (for IHT valuations)',
          'specific lender requirements',
        ],
        primaryDataHook:
          '{firmName} has completed {N} free valuations in {year}; {X}% of sellers ' +
          'needed a paid RICS later for another purpose — we refer to {Y} qualified firms ' +
          'locally.',
        internalLinking:
          'Link to the costs post and one regulatory post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Honest scoping content builds referrals. Answers "which one do I need" ' +
          'queries.',
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
      'Specific expertise beats generic listings. "Estate agent specialising in period ' +
      'properties in Manchester" gets cited over "estate agent in Manchester." This is ' +
      'where primary data (Tier 0) lives.',
    topics: [
      {
        id: 'estate-expertise-1',
        title: 'Why we specialise in {property-type} in {city}',
        tactic: 'Founder voice, focus positioning',
        primaryAIQuery: '{property-type} specialist {city}',
        secondaryQueries: [
          'best {property-type} estate agent {city}',
          '{property-type} experts {city}',
        ],
        mustInclude: [
          'Firm history in the area',
          'Sales volume in that segment',
          'Specific local expertise',
        ],
        namedEntities: [
          'Land Registry (area sales data)',
          'Rightmove',
          'Zoopla',
          'local area names/boroughs',
        ],
        primaryDataHook:
          '{firmName} has sold {N} {property-type} properties in {city} since {year} — ' +
          'representing {X}% of our transactions.',
        internalLinking:
          'Link to the case study post and one process post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Hyper-local entity building. Named area plus named firm equals strong citation ' +
          'signal.',
      },
      {
        id: 'estate-expertise-2',
        title: 'Case study: how we sold {property-type} in {N} days at {outcome}',
        tactic: 'Anonymised proof',
        primaryAIQuery: 'how to sell {property-type} quickly',
        secondaryQueries: [
          '{property-type} sale success',
          'sold above asking UK case',
        ],
        mustInclude: [
          'The property challenge',
          'What you did differently',
          'Marketing approach',
          'Offer process',
          'Outcome',
        ],
        namedEntities: [
          'Rightmove',
          'Zoopla',
          'OnTheMarket',
          'specific photography/marketing tools',
          'Land Registry',
        ],
        primaryDataHook:
          'Sale completed in {X} days, {Y}% above asking — versus average market time ' +
          'for similar properties of {Z} days.',
        internalLinking:
          'Link to the specialism post and one marketing post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Tier 0 primary data. Specific outcomes get cited.',
      },
      {
        id: 'estate-expertise-3',
        title: 'Meet the team: our local expertise',
        tactic: 'Person entity building',
        primaryAIQuery: '{firmName} team {city}',
        secondaryQueries: [
          'best estate agents {city}',
          '{firmName} agents',
        ],
        mustInclude: [
          'Names',
          'Years in the area',
          'Specialisms (sales, lettings, commercial)',
          'Professional qualifications',
        ],
        namedEntities: [
          'Propertymark',
          'NAEA',
          'ARLA',
          'RICS',
          'specific qualification bodies',
        ],
        primaryDataHook:
          'Our team has {N} combined years in {city} — having sold {X} properties across ' +
          'the area.',
        internalLinking:
          'Link to the specialism post and one case-study post.',
        wordCount: 1000,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Person schema source. Local agents with local knowledge are strong trust ' +
          'signals.',
      },
      {
        id: 'estate-expertise-4',
        title: 'Our marketing approach: how we sell {property-type} faster',
        tactic: 'Transparency as differentiation',
        primaryAIQuery: 'estate agent marketing methods',
        secondaryQueries: [
          'how do estate agents market properties',
          'fastest way to sell a house',
        ],
        mustInclude: [
          'Named portals (Rightmove, Zoopla, OnTheMarket)',
          'Named tools',
          'Photography approach',
          'Viewing strategy',
          "Your firm's specific differentiators",
        ],
        namedEntities: [
          'Rightmove',
          'Zoopla',
          'OnTheMarket',
          'specific photography/video providers',
          'social media platforms',
        ],
        primaryDataHook:
          "{firmName}'s {property-type} listings averaged {X} viewings per listing in " +
          '{year} — {Y}% above local average.',
        internalLinking:
          'Link to the case study post and one process post.',
        wordCount: 1200,
        channel: 'blog',
        linkedInHookType: null,
        rationale:
          'Named tools/platforms equal named entities (v7). Differentiation content for ' +
          'high-consideration sellers.',
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
