const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  tel: { type: String, required: true, trim: true, match: /^[\d+() -]{8,20}$/ },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true, strict: 'throw' });

UserSchema.pre('validate', function () {
  if (this.isModified('password') && typeof this.password === 'string') {
    const length = Buffer.byteLength(this.password, 'utf8');
    if (length < 8 || length > 72) this.invalidate('password', 'Password must be 8–72 UTF-8 bytes.');
  }
});

UserSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});

UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this.id }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRE || '1d',
  });
};
UserSchema.methods.matchPassword = function (password) { return bcrypt.compare(password, this.password); };
UserSchema.methods.toPublic = function () {
  return { _id: this.id, name: this.name, tel: this.tel, email: this.email, role: this.role };
};
UserSchema.set('toJSON', { transform: (doc) => doc.toPublic() });

module.exports = mongoose.model('User', UserSchema);
