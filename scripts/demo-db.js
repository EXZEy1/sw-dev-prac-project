const { loadEnv } = require('../config/env');
const { createMongo } = require('./mongo');

async function main() {
  loadEnv();
  const uri = new URL(process.env.MONGO_URI || 'mongodb://127.0.0.1:27019/dentist_booking_demo');
  if (uri.hostname !== '127.0.0.1' || uri.pathname !== '/dentist_booking_demo') {
    throw new Error('db:demo only supports the local dentist_booking_demo database. Use your existing MongoDB for another URI.');
  }
  const port = Number(uri.port || 27019);
  const mongo = await createMongo({ persistent: true, port });
  console.log(`Demo MongoDB running at 127.0.0.1:${port}; data stays in ignored .local/mongo.`);
  const stop = async () => { await mongo.stop({ doCleanup: false }); process.exitCode = 0; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) main().catch(() => {
  console.error('Cannot start demo MongoDB. Check the port/binary; set MONGOMS_SYSTEM_BINARY to use an installed mongod.');
  process.exitCode = 1;
});
