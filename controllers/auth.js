const User = require('../models/User');
const { appError } = require('../utils/errors');
const { allowFields, invalid } = require('../utils/validation');

function sendTokenResponse(user, statusCode, res) {
  return res.status(statusCode).json({ success: true, ...user.toPublic(), token: user.getSignedJwtToken() });
}

async function register(req, res) {
  allowFields(req.body, ['name', 'tel', 'email', 'password']);
  for (const key of ['name', 'tel', 'email', 'password']) {
    if (typeof req.body[key] !== 'string' || !req.body[key].trim()) throw invalid(`${key} is required and must be text.`);
  }
  const { name, tel, email, password } = req.body;
  const user = await User.create({ name, tel, email, password, role: 'user' });
  return sendTokenResponse(user, 201, res);
}

async function login(req, res) {
  allowFields(req.body, ['email', 'password']);
  if (typeof req.body.email !== 'string' || typeof req.body.password !== 'string' || !req.body.email.trim() || !req.body.password) {
    throw invalid('Email and password are required and must be text.');
  }
  if (req.body.email.length > 254 || Buffer.byteLength(req.body.password, 'utf8') > 72) {
    throw appError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  }
  const user = await User.findOne({ email: req.body.email.trim().toLowerCase() }).select('+password');
  if (!user || !await user.matchPassword(req.body.password)) throw appError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  return sendTokenResponse(user, 200, res);
}

function getMe(req, res) { return res.json({ success: true, data: req.user.toPublic() }); }
function logout(req, res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  return res.json({ success: true, data: null });
}

module.exports = { register, login, getMe, logout };
