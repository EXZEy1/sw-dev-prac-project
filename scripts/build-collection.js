const fs = require('node:fs');
const path = require('node:path');

const postmanDirectory = path.resolve(__dirname, '../postman');
const groups = [
  ['p0', '00 Setup'],
  ['user-core', '01-08 User Core'],
  ['admin-core', '09-12 Admin Core'],
  ['questionnaire-qr', '15 Extra - Questionnaire and QR'],
  ['queue-waitlist', '15 Extra - Queue and Waiting List'],
];
const CORE_FOLDERS = groups.slice(0, 3).map(([, name]) => name);
const EXTRA_FOLDERS = groups.slice(3).map(([, name]) => name);

function buildCollection() {
  return {
    info: {
      name: 'Dentist Booking - Team Presentation',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Seed the demo database before each full run. Run the Core folders, pause for Class/Sequence slides, then run the Extra folders. Setup checks readiness and roles. Credentials come from the local environment. The queue/waiting-list demo cancels a booking; reset before repeating.',
    },
    item: groups.map(([file, name]) => {
      const source = JSON.parse(fs.readFileSync(path.join(postmanDirectory, `${file}.collection.json`), 'utf8'));
      return {
        name,
        description: source.info.description || source.info.name,
        ...(source.event && { event: source.event }),
        ...(source.auth && { auth: source.auth }),
        item: source.item,
      };
    }),
  };
}

if (require.main === module) {
  const file = path.join(postmanDirectory, 'dentist-booking.collection.json');
  fs.writeFileSync(file, JSON.stringify(buildCollection(), null, 2) + '\n');
  console.log('Built dentist-booking.collection.json from the five team collections.');
}

module.exports = { buildCollection, CORE_FOLDERS, EXTRA_FOLDERS };
