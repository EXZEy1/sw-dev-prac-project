const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const { bangkokDate, addDays } = require('../utils/validation');

const id = (suffix) => String(suffix).padStart(24, '0');
const IDS = Object.freeze({
  extraOwner: id(1), adminSubject: id(2), admin: id(3), queueOwner: id(4), waiterA: id(5), waiterB: id(6),
  dentist: id(101), secondDentist: id(102), thirdDentist: id(103),
  adminAppointment: id(202), extraAppointment: id(203), queueAppointment: id(204), cancelledAppointment: id(205),
});

function fixtureDates(now = new Date()) {
  const today = bangkokDate(now);
  return { bookingDate: addDays(today, 7), changedBookingDate: addDays(today, 8), extraBookingDate: today };
}

function validateDemoPassword(password) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('DEMO_PASSWORD must be 8–72 UTF-8 bytes.');
  }
}

async function seedFixtures(password, now = new Date()) {
  validateDemoPassword(password);
  const dates = fixtureDates(now);
  const users = [
    ['extraOwner', 'Extra Owner', 'extra-owner@example.test', 'user'],
    ['adminSubject', 'Admin Subject', 'admin-subject@example.test', 'user'],
    ['admin', 'Demo Admin', 'admin@example.test', 'admin'],
    ['queueOwner', 'Queue Owner', 'queue-owner@example.test', 'user'],
    ['waiterA', 'Waiter A', 'waiter-a@example.test', 'user'],
    ['waiterB', 'Waiter B', 'waiter-b@example.test', 'user'],
  ];
  await User.create(users.map(([key, name, email, role], index) => ({ _id: IDS[key], name, email, role, tel: `080000000${index + 1}`, password })));
  await Dentist.create([
    { _id: IDS.dentist, name: 'Demo Dentist 1', yearsOfExperience: 5, expertise: 'General dentistry' },
    { _id: IDS.secondDentist, name: 'Demo Dentist 2', yearsOfExperience: 8, expertise: 'Orthodontics' },
    { _id: IDS.thirdDentist, name: 'Demo Dentist 3', yearsOfExperience: 10, expertise: 'Endodontics' },
  ]);
  await Appointment.create([
    { _id: IDS.adminAppointment, user: IDS.adminSubject, dentist: IDS.secondDentist, bookingDate: dates.bookingDate },
    { _id: IDS.extraAppointment, user: IDS.extraOwner, dentist: IDS.dentist, bookingDate: dates.extraBookingDate },
    { _id: IDS.queueAppointment, user: IDS.queueOwner, dentist: IDS.dentist, bookingDate: dates.extraBookingDate },
    { _id: IDS.cancelledAppointment, user: IDS.adminSubject, dentist: IDS.thirdDentist, bookingDate: dates.extraBookingDate, status: 'cancelled', cancelledAt: now },
  ]);
  return { ids: IDS, dates };
}

module.exports = { IDS, fixtureDates, validateDemoPassword, seedFixtures };
