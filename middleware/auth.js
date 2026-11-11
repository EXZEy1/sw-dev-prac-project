const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { appError } = require('../utils/errors');

async function protect(req, res, next) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string' && authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) return next(appError(401, 'UNAUTHORIZED', 'Log in to access this resource.'));
  let decoded;
  try {
    decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return next(appError(401, 'UNAUTHORIZED', 'Invalid or expired token.'));
  }
  if (!decoded || typeof decoded !== 'object' || !/^[a-f\d]{24}$/i.test(decoded.id || '')) {
    return next(appError(401, 'UNAUTHORIZED', 'Invalid token subject.'));
  }
  try {
    const user = await User.findById(decoded.id);
    if (!user) return next(appError(401, 'UNAUTHORIZED', 'Account is unavailable.'));
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(appError(401, 'UNAUTHORIZED', 'Log in first.'));
    if (!roles.includes(req.user.role)) return next(appError(403, 'FORBIDDEN', 'Your role cannot access this resource.'));
    next();
  };
}

module.exports = { protect, authorize };
