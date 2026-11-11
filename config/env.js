const path = require('node:path');
const dotenv = require('dotenv');

function loadEnv() {
  dotenv.config({ path: path.join(__dirname, 'config.env'), quiet: true });
}

function validateEnv() {
  const missing = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}. Run npm run setup:local.`);
  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  const port = Number(process.env.PORT || 5003);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { port, host: process.env.HOST || '127.0.0.1' };
}

module.exports = { loadEnv, validateEnv };
