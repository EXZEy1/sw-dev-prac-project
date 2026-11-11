function appError(statusCode, code, message, fields) {
  const error = new Error(message);
  Object.assign(error, { statusCode, code });
  if (fields) error.fields = fields;
  return error;
}

module.exports = { appError };
