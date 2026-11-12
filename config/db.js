const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is required.');
  // Atlas needs DNS SRV lookup and TLS, which can exceed 5 seconds on slower networks.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: uri.startsWith('mongodb+srv://') ? 20000 : 5000 });
  return mongoose.connection;
}

async function prepareIndexes() {
  const models = [
    require('../models/User'), require('../models/Dentist'), require('../models/Appointment'), require('../models/Questionnaire'),
    require('../models/QueueEntry'), require('../models/WaitlistEntry'),
  ];
  await Promise.all(models.map((model) => model.init()));
}

module.exports = { connectDB, prepareIndexes };
