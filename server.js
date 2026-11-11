const express = require('express');
const mongoose = require('mongoose');
const { loadEnv, validateEnv } = require('./config/env');
const { connectDB, prepareIndexes } = require('./config/db');
const { appError } = require('./utils/errors');
const { errorHandler } = require('./middleware/error');

// Keep the Assignment 7 layout: app setup and startup live in server.js.
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/health', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, phase: 'P0', database: ready ? 'ready' : 'unavailable' });
});
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/dentists', require('./routes/dentists'));
app.use('/api/v1/appointments', require('./routes/appointments'));
app.use('/api/v1/admin/appointments', require('./routes/adminAppointments'));
app.use('/api/v1/queues', require('./routes/queues'));
app.use('/api/v1/waiting-list', require('./routes/waitingList'));
app.use((req, res, next) => next(appError(404, 'NOT_FOUND', 'Route not found.')));
app.use(errorHandler);

async function start() {
  loadEnv();
  const { host, port } = validateEnv();
  await connectDB();
  await prepareIndexes();
  const server = app.listen(port, host, () => console.log(`Dentist Booking P0: http://${host}:${port}`));
  server.on('error', async (error) => {
    console.error(`Cannot start server (${error.code || 'unknown error'}).`);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  const shutdown = () => server.close(async () => { await mongoose.disconnect(); process.exitCode = 0; });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start().catch(async () => {
  console.error('Startup failed. Check config/config.env, MongoDB availability and indexes; server was not opened.');
  await mongoose.disconnect();
  process.exitCode = 1;
});

module.exports = app;
module.exports.start = start;
