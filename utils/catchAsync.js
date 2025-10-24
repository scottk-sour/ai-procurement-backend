/**
 * Async Error Handler Wrapper
 *
 * Wraps async route handlers to automatically catch errors and pass them
 * to the next middleware (error handler).
 *
 * This eliminates the need for try-catch blocks in every async route handler.
 *
 * Usage:
 *   // Before:
 *   const getUser = async (req, res, next) => {
 *     try {
 *       const user = await User.findById(req.params.id);
 *       res.json(user);
 *     } catch (error) {
 *       next(error);
 *     }
 *   };
 *
 *   // After:
 *   const getUser = catchAsync(async (req, res, next) => {
 *     const user = await User.findById(req.params.id);
 *     res.json(user);
 *   });
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
