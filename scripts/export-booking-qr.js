const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assertId } = require('../utils/validation');

function exportBookingQr(dataUrl, reference, outputDirectory = path.resolve(__dirname, '../artifacts')) {
  const id = assertId(reference, 'bookingReference');
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('The current API response did not contain a PNG QR code.');
  const png = Buffer.from(match[1], 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error('The QR response is not a PNG.');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const file = path.join(outputDirectory, `booking-${id}-${randomUUID()}.png`);
  fs.writeFileSync(file, png, { flag: 'wx' });
  return file;
}

module.exports = { exportBookingQr };
