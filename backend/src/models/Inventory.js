import mongoose from 'mongoose';

const InventorySchema = new mongoose.Schema({
  hotel:    { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
  roomType: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomType', required: true, index: true },
  date:     { type: Date, required: true, index: true },
  price:    { type: Number, default: 0 },
  allotment:{ type: Number, default: 0 },   // o güne açılan oda sayısı
  stopSell: { type: Boolean, default: false }
}, { timestamps: true });

InventorySchema.index({ hotel: 1, roomType: 1, date: 1 }, { unique: true });

export default mongoose.model('Inventory', InventorySchema);
