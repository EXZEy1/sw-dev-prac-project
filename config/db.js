const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is required.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

async function prepareIndexes() {
  const models = [require('../models/User'), require('../models/Dentist'), require('../models/Appointment')];
  await Promise.all(models.map((model) => model.init()));
}

module.exports = { connectDB, prepareIndexes };
