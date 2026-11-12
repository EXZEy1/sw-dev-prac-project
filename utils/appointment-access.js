const { getAppointment } = require('./booking');
const { appError } = require('./errors');

async function getAccessibleAppointment(id, user, { includeCancelled = false, allowAdmin = false } = {}) {
  const appointment = await getAppointment(id, { includeCancelled });
  if (appointment.user._id !== user.id && !(allowAdmin && user.role === 'admin')) {
    throw appError(404, 'NOT_FOUND', 'Appointment not found.');
  }
  return appointment;
}

module.exports = { getAccessibleAppointment };
