const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { loadEnv } = require('../config/env');

async function createMongo({ persistent = false, port } = {}) {
  loadEnv(); // Lets tests and db:demo share an optional local binary path.
  const local = path.resolve(__dirname, '../.local');
  const instance = { ip: '127.0.0.1', storageEngine: 'wiredTiger' };
  if (persistent) {
    const dbPath = path.join(local, 'mongo');
    fs.mkdirSync(dbPath, { recursive: true });
    Object.assign(instance, { dbPath, port, dbName: 'dentist_booking_demo', portGeneration: false });
  }
  return MongoMemoryServer.create({
    instance,
    binary: { version: '8.2.6', downloadDir: path.join(local, 'mongodb-binaries') },
  });
}

module.exports = { createMongo };
