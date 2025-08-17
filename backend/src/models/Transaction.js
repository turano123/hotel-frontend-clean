import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  description: String,
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);