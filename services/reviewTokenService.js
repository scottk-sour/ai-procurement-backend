import crypto from 'crypto';

/**
 * Generate a secure random token for review requests
 * @returns {string} 64-character hex token
 */
export function generateReviewToken() {
  return crypto.randomBytes(32).toString('hex');
}

export default { generateReviewToken };
