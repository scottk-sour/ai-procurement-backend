import jwt from 'jsonwebtoken';

/**
 * Verifies a JSON Web Token from the Authorization header.
 *
 * @param {string} authHeader - The Authorization header containing the token.
 * @param {string} secret - The secret key used to verify the token.
 * @returns {object} - The decoded token payload if verification is successful.
 * @throws {object} - An error object with `status` and `message` properties.
 */
export const verifyToken = (authHeader, secret) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Authorization denied. No or malformed token provided.' };
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the token and return its payload
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 401, message: 'Token expired. Please log in again.' };
    }
    throw { status: 401, message: 'Invalid token. Authorization denied.' };
  }
};
