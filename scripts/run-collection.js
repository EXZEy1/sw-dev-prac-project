const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { loadEnv } = require('../config/env');
const { IDS, fixtureDates } = require('./fixtures');
const { exportBookingQr } = require('./export-booking-qr');
const { CORE_FOLDERS, EXTRA_FOLDERS } = require('./build-collection');

loadEnv();
const names = new Set(['p0', 'user-core', 'questionnaire-qr', 'admin-core', 'queue-waitlist', 'dentist-booking']);
const name = process.argv[2];
const scope = process.argv[3];
if (!names.has(name)) throw new Error('Unknown collection.');
if (scope && (name !== 'dentist-booking' || !['core', 'extras'].includes(scope))) throw new Error('Scope must be core or extras for the combined collection.');
const folder = scope === 'core' ? CORE_FOLDERS : scope === 'extras' ? EXTRA_FOLDERS : undefined;
if (!process.env.DEMO_PASSWORD) throw new Error('Run npm run setup:local first.');
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
  collection, environment, ...(folder && { folder }), envVar: Object.entries(variables).map(([key, value]) => ({ key, value })),
  reporters: ['cli'], bail: true, timeoutRequest: 5000,
}, (error, summary) => {
  if (error || !summary || summary.run.failures.length) { process.exitCode = 1; return; }
  if (name === 'questionnaire-qr' || (name === 'dentist-booking' && scope !== 'core')) {
    try {
      const file = exportBookingQr(summary.environment.get('bookingQrDataUrl'), summary.environment.get('bookingQrReference'));
      console.log(`QR from this run: ${file}`);
    } catch (exportError) {
      console.error(exportError.message);
      process.exitCode = 1;
    }
  }
});
