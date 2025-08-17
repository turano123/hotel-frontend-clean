// backend/src/models/FinanceTransaction.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/* ---------------- Canonicals & helpers ---------------- */
const METHOD_CANON = {
  cash: 'cash', nakit: 'cash', 'cash ': 'cash',
  pos: 'pos', card: 'pos', kart: 'pos', 'kredi kartı': 'pos',
  transfer: 'transfer', havale: 'transfer', eft: 'transfer', wire: 'transfer', bank: 'transfer',
  online: 'online', virtualpos: 'online', stripe: 'online', paypal: 'online', iyzico: 'online',
  other: 'other',
};
const METHOD_ENUM = ['cash', 'pos', 'transfer', 'online', 'other'];
const TYPE_ENUM   = ['income', 'expense'];
const CURR_ENUM   = ['TRY', 'USD', 'EUR', 'GBP'];

const SOURCE_CANON = {
  manual: 'manual', system: 'system', import: 'import', adjustment: 'adjustment',
  // rezervasyon hareketleri – tüm varyasyonları aynı kanoniğe map’ler
  'reservation-payment': 'reservation-payment',
  res_payment: 'reservation-payment', payment: 'reservation-payment',

  'reservation-refund': 'reservation-refund',
  res_refund: 'reservation-refund', refund: 'reservation-refund',

  'reservation-balance': 'reservation-balance',
  res_balance: 'reservation-balance', balance: 'reservation-balance',

  'reservation-planned': 'reservation-planned',
  res_planned: 'reservation-planned', planned: 'reservation-planned',

  'channel-payout': 'channel-payout', channel_payout: 'channel-payout', ota: 'channel-payout',

  'transfer-in': 'transfer-in',  transfer_in: 'transfer-in',
  'transfer-out': 'transfer-out', transfer_out: 'transfer-out',

  'opening-balance': 'opening-balance', opening_balance: 'opening-balance',
  'closing-balance': 'closing-balance', closing_balance: 'closing-balance',
};
const SOURCE_ENUM = Object.values({
  manual:1, system:1, import:1, adjustment:1,
  'reservation-payment':1, 'reservation-refund':1,
  'reservation-balance':1, 'reservation-planned':1,
  'channel-payout':1, 'transfer-in':1, 'transfer-out':1,
  'opening-balance':1, 'closing-balance':1,
});

const lower = (v, d = '') => (v == null ? d : String(v).trim().toLowerCase());
const upper = (v, d = '') => (v == null ? d : String(v).trim().toUpperCase());
const normMethod = (v) => {
  const k = lower(v, 'other');
  return METHOD_CANON[k] || (METHOD_ENUM.includes(k) ? k : 'other');
};
const normSource = (v) => SOURCE_CANON[lower(v, 'manual')] || 'manual';

/* ---------------- Schema ---------------- */
const FinanceTransactionSchema = new Schema(
  {
    hotel:  { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },

    type:   { type: String, enum: TYPE_ENUM, required: true, set: (v) => lower(v) , index: true },
    method: { type: String, enum: METHOD_ENUM, default: 'other', set: normMethod },
    category: { type: String, default: 'Genel', trim: true, index: true },

    date:   { type: Date, default: Date.now, index: true },

    // tutar + kur + TRY karşılığı
    amount:    { type: Number, required: true, min: 0 },
    currency:  { type: String, enum: CURR_ENUM, default: 'TRY', set: (v) => upper(v, 'TRY') },
    fxRate:    { type: Number, default: 1, min: 0 },
    amountTry: { type: Number, default: 0 },

    note: { type: String, default: '', trim: true },

    // Dış referans/kimlikler
    ref:    { type: String, default: '', trim: true },
    source: { type: String, enum: SOURCE_ENUM, default: 'manual', set: normSource, index: true },

    // Rezervasyon bağlantıları (opsiyonel)
    reservation:  { type: Schema.Types.ObjectId, ref: 'Reservation' },
    resPaymentId: { type: Schema.Types.ObjectId },
    guestName:    { type: String, default: '', trim: true },
    channel:      { type: String, default: '', trim: true },

    // idempotency
    uniqueKey: { type: String, index: { unique: true, sparse: true } },
  },
  { timestamps: true }
);

/* ---------------- Index’ler ---------------- */
FinanceTransactionSchema.index({ hotel: 1, date: -1, type: 1 });
FinanceTransactionSchema.index({ hotel: 1, method: 1, date: -1 });
FinanceTransactionSchema.index({ hotel: 1, category: 1, date: -1 });
FinanceTransactionSchema.index({ reservation: 1 });
FinanceTransactionSchema.index({ hotel: 1, source: 1, ref: 1 });

/* ---------------- Normalize & TRY hesap ---------------- */
FinanceTransactionSchema.pre('validate', function (next) {
  if (upper(this.currency) === 'TRY' && (this.isModified('currency') || this.fxRate === undefined)) {
    this.fxRate = 1;
  }
  next();
});

FinanceTransactionSchema.pre('save', function (next) {
  const amt  = Number(this.amount || 0);
  const rate = Number(this.fxRate || 1);
  this.amountTry = Math.round(amt * rate * 100) / 100; // 2 ondalık
  next();
});

// findOneAndUpdate güvenli güncelleme (+ normalize + tekrar hesap)
FinanceTransactionSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  if (!update.$set) update.$set = {};
  const $set = update.$set;

  if (update.type || $set.type) $set.type = lower($set.type ?? update.type);
  if (update.method || $set.method) $set.method = normMethod($set.method ?? update.method);
  if (update.source || $set.source) $set.source = normSource($set.source ?? update.source);

  if (update.currency || $set.currency) {
    const cur = upper($set.currency ?? update.currency, 'TRY');
    $set.currency = cur;
    if (cur === 'TRY' && $set.fxRate === undefined && update.fxRate === undefined) $set.fxRate = 1;
  }

  const amt  = $set.amount ?? update.amount;
  const rate = $set.fxRate ?? update.fxRate;
  if (amt !== undefined || rate !== undefined) {
    const a = amt  !== undefined ? Number(amt)  : 0;
    const r = rate !== undefined ? Number(rate) : 1;
    $set.amountTry = Math.round(a * r * 100) / 100;
  }

  this.setUpdate(update);
  next();
});

/* ---------------- JSON görünümü ---------------- */
FinanceTransactionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

/* ---------------- Convenience statics ---------------- */
FinanceTransactionSchema.statics.upsertByUniqueKey = async function (doc) {
  if (!doc.uniqueKey) return this.create(doc);
  try {
    return await this.create(doc);
  } catch (e) {
    if (e?.code === 11000) return this.findOne({ uniqueKey: doc.uniqueKey });
    throw e;
  }
};

// Rezervasyon hareketlerinden kolay kayıt üretme (payment/refund/balance/planned)
FinanceTransactionSchema.statics.fromReservation = function ({
  hotel, reservation, guestName, channel,
  kind = 'payment',                // 'payment' | 'refund' | 'balance' | 'planned'
  amount, currency = 'TRY', fxRate = 1,
  direction = 'income',            // income/expense (refund: expense)
  method = 'cash',
  category = 'Rezervasyon',
  date = new Date(),
  note = '', uniqueKey, ref,
}) {
  const kindMap = {
    payment: 'reservation-payment',
    refund:  'reservation-refund',
    balance: 'reservation-balance',
    planned: 'reservation-planned',
  };
  return {
    hotel,
    type: direction,
    method,
    category,
    date,
    amount,
    currency,
    fxRate,
    note,
    reservation,
    guestName,
    channel,
    uniqueKey,
    ref,
    source: kindMap[kind] || 'reservation-payment',
  };
};

export default mongoose.model('FinanceTransaction', FinanceTransactionSchema);
