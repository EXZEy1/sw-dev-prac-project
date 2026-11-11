function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let statusCode = error.statusCode || error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message;
  let fields = error.fields;
  if (error.code === 11000) {
    statusCode = 409;
    code = error.keyPattern?.user ? 'BOOKING_LIMIT_REACHED' : 'DUPLICATE_RECORD';
    message = code === 'BOOKING_LIMIT_REACHED' ? 'Only one booked appointment is allowed per user.' : 'This record already exists.';
  } else if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) {
    statusCode = 400; code = 'VALIDATION_ERROR'; message = 'Invalid input.';
    if (error.errors) fields = Object.fromEntries(Object.keys(error.errors).map((key) => [key, 'Invalid value.']));
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400; code = 'VALIDATION_ERROR'; message = 'Invalid JSON body.';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.';
  }
  if (statusCode >= 500) { code = 'INTERNAL_ERROR'; message = 'Unable to process the request.'; }
  const response = { success: false, message, code };
  if (fields && statusCode < 500) response.fields = fields;
  return res.status(statusCode).json(response);
}

module.exports = { errorHandler };
