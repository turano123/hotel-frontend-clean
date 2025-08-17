import mongoose from 'mongoose';

const GuestSchema = new mongoose.Schema({
  hotel:     { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
  firstName: { type: String, trim: true },
  lastName:  { type: String, trim: true },
  name:      { type: String, trim: true, required: true }, // tam ad (zorunlu)
  email:     { type: String, trim: true, lowercase: true, index: true, sparse: true },
  phone:     { type: String, trim: true, index: true, sparse: true }, // +90…
  country:   { type: String, trim: true },
  documentNo:{ type: String, trim: true },
  tags:      [{ type: String, trim: true }],
  vip:       { type: Boolean, default: false },
  blacklist: { type: Boolean, default: false },
  notes:     { type: String, trim: true },
  marketingOptIn: { type: Boolean, default: false },
}, { timestamps: true });

GuestSchema.index({ hotel: 1, email: 1 }, { unique: false, sparse: true });
GuestSchema.index({ hotel: 1, phone: 1 }, { unique: false, sparse: true });

export default mongoose.model('Guest', GuestSchema);
