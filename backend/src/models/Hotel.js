// backend/src/models/Hotel.js
import mongoose from 'mongoose'

const HotelSchema = new mongoose.Schema(
  {
    /* Zorunlu kimlik alanları */
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // hem create hem update'de normalize eder (hook’lar da var)
      index: true,
    },
    name: { type: String, required: true, trim: true },

    /* Genel bilgiler */
    city:    { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone:   { type: String, trim: true, default: '' },

    /* Operasyonel */
    currency: {
      type: String,
      trim: true,
      default: 'TRY',
      enum: ['TRY', 'USD', 'EUR', 'GBP'], // FE ile uyumlu
    },
    timezone: { type: String, trim: true, default: 'Europe/Istanbul' },
    active:   { type: Boolean, default: true }, // ana gerçek alan

    /* Bilgi amaçlı admin iletişim / başlangıç şifresi (opsiyonel).
       Parola dışarı çıkmasın diye select:false. */
    adminEmail:     { type: String, trim: true, lowercase: true, default: '' },
    adminPassword:  { type: String, default: '', select: false },

    /* Dashboard için yardımcı (asıl kaynak RoomType toplamı) */
    totalRooms: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
)

/* ---------------- Indexler ---------------- */
HotelSchema.index({ name: 1 })
HotelSchema.index({ city: 1 })

/* ---------------- Sanal Alanlar ---------------- */
// FE tarafından isActive okunup/yazılabilsin:
HotelSchema.virtual('isActive')
  .get(function () { return !!this.active })
  .set(function (v) { this.active = !!v })

/* ---------------- Normalize Hook'ları ---------------- */
function normalize(update) {
  if (!update) return
  if (update.code)     update.code     = String(update.code).trim().toUpperCase()
  if (update.currency) update.currency = String(update.currency).trim().toUpperCase()
}

HotelSchema.pre('save', function (next) {
  if (this.isModified('code') && this.code) this.code = this.code.trim().toUpperCase()
  if (this.isModified('currency') && this.currency) this.currency = this.currency.trim().toUpperCase()
  next()
})

HotelSchema.pre('findOneAndUpdate', function (next) {
  normalize(this.getUpdate())
  next()
})

/* ---------------- JSON dönüşümü ---------------- */
HotelSchema.set('toJSON', {
  virtuals: true, // isActive dahil
  transform: (_doc, ret) => {
    ret.id = String(ret._id)
    delete ret._id
    delete ret.__v
    delete ret.adminPassword // güvenlik için ekstra garanti
    return ret
  },
})

export default mongoose.model('Hotel', HotelSchema)
