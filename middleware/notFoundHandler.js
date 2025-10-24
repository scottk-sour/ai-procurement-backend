/**
 * 404 Not Found Handler Middleware
 *
 * Catches all requests that don't match any route and creates a 404 error.
 * This should be placed after all other routes but before the error handler.
 *
 * Usage in index.js:
 *   app.use('/api/users', userRoutes);
 *   app.use('/api/quotes', quoteRoutes);
 *   // ... other routes
 *   app.use(notFoundHandler);  // Catch 404s
 *   app.use(errorHandler);     // Handle all errors
 */
import AppError from '../utils/AppError.js';

const notFoundHandler = (req, res, next) => {
  const message = `Cannot ${req.method} ${req.originalUrl}`;
  next(new AppError(message, 404));
};

export default notFoundHandler;
