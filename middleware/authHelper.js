import jwt from 'jsonwebtoken';

/**
 * Verifies a JSON Web Token from the Authorization header.
 *
 * @param {string} authHeader - The Authorization header containing the token.
 * @param {string} secret - The secret key used to verify the token.
 * @returns {object} - The decoded token payload if verification is successful.
 * @throws {Error} - An error object with a message and status code.
 */
export const verifyToken = (authHeader, secret) => {
  if (!secret) {
    console.error("❌ ERROR: JWT Secret Key is missing! Check your .env file.");
    throw new Error("Internal server error: Missing authentication secret.");
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn("⚠ Unauthorized Access Attempt - No or Malformed Token Provided");
    throw new Error("Authorization denied. No or malformed token provided.");
  }

  const token = authHeader.split(' ')[1];

  try {
    return jwt.verify(token, secret); // ✅ Returns the decoded token payload
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error("❌ Authentication Failed - Token Expired:", err.message);
      throw new Error("Token expired. Please log in again.");
    }

    console.error("❌ Authentication Failed - Invalid Token:", err.message);
    throw new Error("Invalid token. Authorization denied.");
  }
};
