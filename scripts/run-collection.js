const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { loadEnv } = require('../config/env');
const { IDS, fixtureDates } = require('./fixtures');

loadEnv();
const names = new Set(['p0', 'admin-core', 'queue-waitlist']);
const name = process.argv[2];
if (!names.has(name)) throw new Error('Unknown collection.');
if (!process.env.DEMO_PASSWORD) throw new Error('Run npm run setup:local first.');
if (name !== 'p0') console.log('B feature collection: reserved routes return 501 until B implements them.');
const postman = path.resolve(__dirname, '../postman');
const collection = JSON.parse(fs.readFileSync(path.join(postman, `${name}.collection.json`), 'utf8'));
const environment = JSON.parse(fs.readFileSync(path.join(postman, 'localhost.environment.example.json'), 'utf8'));
const baseUrl = process.env.DEMO_BASE_URL || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 5003}/api/v1`;
const variables = {
  ...fixtureDates(),
  baseUrl, serverUrl: baseUrl.replace(/\/api\/v1\/?$/, ''),
  demoPassword: process.env.DEMO_PASSWORD,
  dentistId: IDS.dentist, secondDentistId: IDS.secondDentist,
  adminAppointmentId: IDS.adminAppointment, extraAppointmentId: IDS.extraAppointment,
  queueAppointmentId: IDS.queueAppointment, cancelledAppointmentId: IDS.cancelledAppointment,
};
newman.run({
  collection, environment, envVar: Object.entries(variables).map(([key, value]) => ({ key, value })),
  reporters: ['cli'], bail: true, timeoutRequest: 5000,
}, (error, summary) => {
  if (error || !summary || summary.run.failures.length) process.exitCode = 1;
});
