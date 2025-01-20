const jwt = require('jsonwebtoken');

exports.verifyToken = (authHeader, secret) => {
  if (!authHeader) {
    throw { status: 401, message: 'No token provided. Authorization denied.' };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw { status: 401, message: 'Malformed token. Authorization denied.' };
  }

  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 401, message: 'Token expired. Please log in again.' };
    }
    throw { status: 401, message: 'Invalid token. Authorization denied.' };
  }
};
