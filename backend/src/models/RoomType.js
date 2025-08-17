import mongoose from 'mongoose';

const RoomTypeSchema = new mongoose.Schema({
  hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },

  // Kimlik
  code: { type: String, required: true, trim: true },  // STD, DLX...
  name: { type: String, required: true, trim: true },

  // Fiyat/Kapasite
  basePrice: { type: Number, default: 0, min: 0 },
  capacityAdults: { type: Number, default: 2, min: 1 },
  capacityChildren: { type: Number, default: 0, min: 0 },

  // 🔙 Legacy destek (eski "capacity" kullanan yerleri bozmamak için)
  capacity: { type: Number, default: 2, min: 1, select: false },

  // Fiziksel envanter
  totalRooms: { type: Number, default: 0, min: 0 },

  // Açıklayıcı
  bedType: { type: String, trim: true },   // Double/Twin/French
  sizeSqm: { type: Number, default: 0, min: 0 },
  smoking: { type: Boolean, default: false },

  // 🔥 Yeni: Özellik taksonomisi
  amenities: [{ type: String, trim: true }],      // wifi, ac, tv, minibar, kettle, safe, work_desk...
  scenicViews: [{ type: String, trim: true }],    // sea, lake, mountain, forest, garden, city
  hasPool: { type: Boolean, default: false },
  hasJacuzzi: { type: Boolean, default: false },

  // Mutfak
  hasKitchen: { type: Boolean, default: false },
  kitchenFeatures: [{ type: String, trim: true }], // stove, oven, cooktop, dishwasher, fridge, microwave

  // Konaklama tipi (villa/bungalov/glamping/tinyhouse için ekstra alanlar)
  propertyType: {
    type: String,
    enum: ['room','suite','villa','bungalow','glamping','tinyhouse'],
    default: 'room'
  },
  unitBedrooms: { type: Number, default: 0, min: 0 },
  unitBathrooms:{ type: Number, default: 0, min: 0 },
  unitBeds:     { type: Number, default: 0, min: 0 },

  description: { type: String, trim: true },
  images: [{ type: String, trim: true }],

  // Kanal haritaları (opsiyonel)
  channelCodes: {
    direct:  { type: String, trim: true },
    airbnb:  { type: String, trim: true },
    booking: { type: String, trim: true },
    etstur:  { type: String, trim: true },
  },
}, { timestamps: true });

RoomTypeSchema.index({ hotel: 1, code: 1 }, { unique: true });

RoomTypeSchema.virtual('capacityTotal').get(function () {
  return Number(this.capacityAdults || 0) + Number(this.capacityChildren || 0);
});

// Legacy "capacity" -> adults'a yansıt
RoomTypeSchema.pre('save', function (next) {
  if ((this.isModified('capacity') || this.isNew) && !this.isModified('capacityAdults') && this.capacity != null) {
    this.capacityAdults = this.capacity;
  }
  if (this.code) this.code = this.code.trim().toUpperCase();
  if (this.name) this.name = this.name.trim();
  next();
});

export default mongoose.model('RoomType', RoomTypeSchema);
