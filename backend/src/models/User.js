import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['MASTER_ADMIN', 'HOTEL_ADMIN', 'HOTEL_STAFF'], default: 'HOTEL_STAFF' },
  hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', default: null },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.compare = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model('User', UserSchema);