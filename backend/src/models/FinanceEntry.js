// backend/src/models/FinanceEntry.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/* helpers */
const METHOD_CANON = {
  cash:'cash', nakit:'cash', 'cash ':'cash',
  pos:'pos', card:'pos', kart:'pos', 'kredi kartı':'pos',
  transfer:'transfer', havale:'transfer', eft:'transfer', wire:'transfer', bank:'transfer',
  online:'online', virtualpos:'online', stripe:'online', paypal:'online', iyzico:'online',
  other:'other',
};
const normMethod = (v) => {
  if (!v) return 'cash';
  const k = String(v).toLowerCase().trim();
  return METHOD_CANON[k] || (['cash','pos','transfer','online','other'].includes(k) ? k : 'other');
};
const upper = (v, def='') => (v ? String(v).trim().toUpperCase() : def);
const lower = (v, def='') => (v ? String(v).trim().toLowerCase() : def);

const FinanceEntrySchema = new Schema({
  hotel: { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },

  type:   { type: String, required: true, enum: ['income','expense'], set: v => lower(v) },
  method: { type: String, required: true, enum: ['cash','pos','transfer','online','other'], set: normMethod, default: 'cash' },
  category: { type: String, required: true, trim: true },

  amount:   { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'TRY', set: v => upper(v,'TRY') },
  fxRate:   { type: Number, default: 1, min: 0 },
  amountTry:{ type: Number, default: 0 },   // amount * fxRate

  date: { type: Date, required: true, index: true },
  note: { type: String, default: '', trim: true },

  source: {
    type: String,
    default: 'manual',
    enum: ['manual','res_payment','res_balance','res_refund','system'],
    index: true,
  },
  reservation:  { type: Schema.Types.ObjectId, ref: 'Reservation' },
  resPaymentId: { type: Schema.Types.ObjectId },

  guestName: { type: String, default: '', trim: true },
  channel:   { type: String, default: '', trim: true },

  uniqueKey: { type: String, index: { unique: true, sparse: true } },
}, { timestamps: true });

/* indexler */
FinanceEntrySchema.index({ hotel: 1, date: -1 });
FinanceEntrySchema.index({ hotel: 1, type: 1, date: -1 });
FinanceEntrySchema.index({ reservation: 1 });
FinanceEntrySchema.index({ hotel: 1, category: 1 });

/* TRY normalize + hesap */
FinanceEntrySchema.pre('validate', function(next){
  if (upper(this.currency) === 'TRY' && (this.isModified('currency') || this.fxRate === undefined)) {
    this.fxRate = 1;
  }
  next();
});

FinanceEntrySchema.pre('save', function(next){
  const rate = Number(this.fxRate || 1);
  const amt  = Number(this.amount || 0);
  this.amountTry = +(amt * rate);
  next();
});

/* insertMany için de hesapla (bulk) */
FinanceEntrySchema.pre('insertMany', function(next, docs){
  if (!Array.isArray(docs)) return next();
  for (const d of docs) {
    d.currency = upper(d.currency || 'TRY', 'TRY');
    if (d.currency === 'TRY' && (d.fxRate === undefined || d.fxRate === null)) d.fxRate = 1;
    const a = Number(d.amount || 0);
    const r = Number(d.fxRate || 1);
    d.amountTry = +(a * r);
  }
  next();
});

/* findOneAndUpdate’da amountTry yeniden hesap */
FinanceEntrySchema.pre('findOneAndUpdate', function(next){
  const u = this.getUpdate() || {};
  const $set = u.$set || (this._update.$set = {});

  if (u.currency || $set.currency) {
    const cur = upper($set.currency ?? u.currency);
    $set.currency = cur;
    if (cur === 'TRY' && ($set.fxRate === undefined && u.fxRate === undefined)) {
      $set.fxRate = 1;
    }
  }

  const amt = $set.amount ?? u.amount;
  const rate = $set.fxRate ?? u.fxRate;
  if (amt !== undefined || rate !== undefined) {
    const a = amt !== undefined ? Number(amt) : 0;
    const r = rate !== undefined ? Number(rate) : 1;
    $set.amountTry = +(a * r);
  }
  next();
});

/* JSON görünümü – _id'yi KORU + ayrıca id ver */
FinanceEntrySchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

/* idempotent create */
FinanceEntrySchema.statics.upsertByUniqueKey = async function(doc) {
  if (!doc.uniqueKey) return this.create(doc);
  try {
    return await this.create(doc);
  } catch (e) {
    if (e?.code === 11000) return this.findOne({ uniqueKey: doc.uniqueKey });
    throw e;
  }
};

export default mongoose.model('FinanceEntry', FinanceEntrySchema);
