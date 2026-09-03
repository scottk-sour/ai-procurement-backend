/**
 * aiContentPublishGuard.js — pure predicates that decide whether a publication
 * action would put AI-generated content live outside the firm content-approval
 * gate. Shared by every publication route so the rule is enforced identically
 * (no bypass) and is unit-testable without a database.
 *
 * These are pure functions only — no I/O, no models, not a service.
 */

// Vendor "create post" route: status defaults to 'published' unless it is
// explicitly 'draft' (see routes/vendorPostRoutes.js). So a create publishes
// AI content whenever aiGenerated is true and the status is anything but 'draft'.
export function aiCreateWouldPublish({ aiGenerated, status }) {
  return aiGenerated === true && status !== 'draft';
}

// Update/patch routes: only an explicit transition to 'published' publishes.
export function aiTransitionWouldPublish({ aiGenerated, status }) {
  return aiGenerated === true && status === 'published';
}

// Admin "execute" route: firm content drafts must go through the firm approval
// path, never admin execute. Any other itemType is unaffected.
export function requiresFirmContentApproval(item) {
  return !!item && item.itemType === 'content_draft';
}

export const AI_PUBLISH_BLOCK_MESSAGE =
  'AI-generated content cannot be published directly. It must be approved by your firm\'s '
  + 'nominated qualified approver through the content approval process before it can go live.';

export const ADMIN_EXECUTE_BLOCK_MESSAGE =
  'Content drafts must be approved and published through the firm approval process. '
  + 'There is no admin override for firm content approval.';
