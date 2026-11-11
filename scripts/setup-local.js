const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'config', 'config.env');
if (!fs.existsSync(configPath)) {
  const config = [
    'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=5003',
    'MONGO_URI=mongodb://127.0.0.1:27019/dentist_booking_demo',
    `JWT_SECRET=${randomBytes(32).toString('hex')}`, 'JWT_EXPIRE=1d',
    `DEMO_PASSWORD=${randomBytes(18).toString('base64url')}`,
    ...(process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync(process.env.MONGOMS_SYSTEM_BINARY)
      ? [`MONGOMS_SYSTEM_BINARY=${JSON.stringify(process.env.MONGOMS_SYSTEM_BINARY.replaceAll('\\', '/'))}`] : []), '',
  ].join('\n');
  fs.writeFileSync(configPath, config, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored local config with generated credentials.');
}
const config = dotenv.parse(fs.readFileSync(configPath));
if (!config.DEMO_PASSWORD || !config.JWT_SECRET) throw new Error('Set DEMO_PASSWORD and JWT_SECRET in config/config.env.');
const postman = path.join(projectRoot, 'postman');
fs.mkdirSync(postman, { recursive: true });
const target = path.join(postman, 'localhost.environment.local.json');
if (!fs.existsSync(target)) {
  const example = JSON.parse(fs.readFileSync(path.join(postman, 'localhost.environment.example.json'), 'utf8'));
  const values = example.values.map((entry) => ({ ...entry, value: entry.key === 'demoPassword' ? config.DEMO_PASSWORD : entry.value }));
  fs.writeFileSync(target, JSON.stringify({ ...example, name: 'Dentist Booking LOCAL (do not commit)', values }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Created ignored Postman local environment.');
}
console.log('Local setup ready. Credentials stay in local files; existing files were preserved.');
