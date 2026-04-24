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

export const UNIVERSAL_RULES = {};

export const VERTICAL_ENTITIES = {};

export const LINKEDIN_HOOK_TYPES = {};
