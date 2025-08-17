import mongoose from 'mongoose';

const ReservationSchema = new mongoose.Schema({
  hotel:     { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
  roomType:  { type: mongoose.Schema.Types.ObjectId, ref: 'RoomType' },

  guestName: { type: String, trim: true },
  guest:     { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },

  checkIn:   { type: Date, required: true, index: true },
  checkOut:  { type: Date, required: true, index: true },

  adults:    { type: Number, default: 2 },
  children:  { type: Number, default: 0 },
  rooms:     { type: Number, default: 1 },

  channel:   { type: String, enum: ['direct','airbnb','booking','etstur'], default: 'direct', index: true },
  status:    { type: String, enum: ['pending','confirmed','cancelled'], default: 'confirmed', index: true },

  // 💸 finans alanları
  totalPrice:     { type: Number, default: 0 },
  depositAmount:  { type: Number, default: 0 },
  paymentMethod:  { type: String, enum: ['', 'cash','pos','transfer','online'], default: '' },
  paymentStatus:  { type: String, enum: ['unpaid','partial','paid'], default: 'unpaid' },

  arrivalTime: { type: String, default: '' },
  notes:       { type: String, default: '' },
}, { timestamps: true });

ReservationSchema.index({ hotel: 1, status: 1, channel: 1 });
ReservationSchema.index({ hotel: 1, checkIn: 1 });
ReservationSchema.index({ hotel: 1, checkOut: 1 });

export default mongoose.model('Reservation', ReservationSchema);
