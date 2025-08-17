import mongoose from 'mongoose';

const ChannelConnectionSchema = new mongoose.Schema({
  hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
  channel: { type: String, enum: ['airbnb', 'booking', 'etstur'], required: true },
  active: { type: Boolean, default: false },
  credentials: { type: Object, default: {} },
  lastSync: { type: Date, default: null }, // son senkron zamanı
}, { timestamps: true });

export default mongoose.model('ChannelConnection', ChannelConnectionSchema);
