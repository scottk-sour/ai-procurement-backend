/**
 * Request ID Middleware
 *
 * Adds a unique ID to each request for tracing across logs.
 * Useful for debugging and tracking request flow.
 *
 * Usage:
 *   import requestId from './middleware/requestId.js';
 *   app.use(requestId);
 *
 * The request ID will be available as:
 *   - req.id
 *   - X-Request-ID response header
 */
import { randomUUID } from 'crypto';

const requestId = (req, res, next) => {
  // Check if client sent a request ID
  const clientRequestId = req.get('X-Request-ID');

  // Use client ID if valid, otherwise generate new one
  req.id = clientRequestId || randomUUID();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);

  // Store request start time for response time calculation
  req.startTime = Date.now();

  next();
};

export default requestId;
