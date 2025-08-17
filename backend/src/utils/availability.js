// backend/src/utils/availability.js
import mongoose from 'mongoose'
import Reservation from '../models/Reservation.js'
import RoomType from '../models/RoomType.js'

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x }

/** checkIn dahil, checkOut hariç gece başına diziyi döndürür */
function dateRangeNights(ci, co) {
  const out = []
  let cur = startOfDay(ci)
  const end = startOfDay(co)
  while (cur < end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/**
 * İstekteki rezervasyon geceleri için mevcut doluluğu toplar, kapasiteyi aşarsa Error fırlatır.
 * @param {Object} args
 * @param {string|ObjectId} args.hotel
 * @param {string|ObjectId} args.roomType
 * @param {Date|string} args.checkIn
 * @param {Date|string} args.checkOut
 * @param {number} args.rooms
 * @param {string|ObjectId} [args.excludeResId]  // update senaryosu için mevcut rezervasyon hariç
 */
export async function ensureAvailability({
  hotel,
  roomType,
  checkIn,
  checkOut,
  rooms = 1,
  excludeResId = null,
}) {
  if (!hotel || !roomType) throw new Error('Hotel/RoomType eksik')
  const ci = new Date(checkIn)
  const co = new Date(checkOut)
  if (!(ci < co)) throw new Error('Çıkış tarihi girişten sonra olmalı')

  // Kapasite bul
  const rt = await RoomType.findOne({ _id: roomType, hotel }).lean()
  if (!rt) throw new Error('Oda tipi bulunamadı')
  const capacity = Number(rt.totalRooms || 0)
  if (capacity <= 0) {
    // İstersen burada hata atabilirsin: throw new Error('Oda tipinin toplam oda sayısı ayarlı değil')
    // Geliştirme kolaylığı için kapasite yoksa limiti sonsuz sayıyoruz:
    return
  }

  // Bu aralığa çakışan rezervasyonları çek (cancelled hariç)
  const match = {
    hotel: new mongoose.Types.ObjectId(hotel),
    roomType: new mongoose.Types.ObjectId(roomType),
    status: { $ne: 'cancelled' },
    checkIn:  { $lt: co },   // ci..co) aralığına çakışanlar
    checkOut: { $gt: ci },
  }
  if (excludeResId) match._id = { $ne: new mongoose.Types.ObjectId(excludeResId) }

  const existing = await Reservation.find(match).select('checkIn checkOut rooms').lean()

  // Gece bazında doluluk haritası
  const nights = dateRangeNights(ci, co)              // isteğin geceleri
  const fmt = (d) => d.toISOString().slice(0,10)      // YYYY-MM-DD
  const load = new Map(nights.map(d => [fmt(d), 0]))

  for (const r of existing) {
    const rr = dateRangeNights(r.checkIn, r.checkOut)
    for (const d of rr) {
      const key = fmt(d)
      if (load.has(key)) load.set(key, load.get(key) + Number(r.rooms || 1))
    }
  }

  // Her gün için kapasite kontrolü
  for (const d of nights) {
    const key = fmt(d)
    const used = load.get(key) || 0
    if (used + Number(rooms) > capacity) {
      const kalan = Math.max(capacity - used, 0)
      throw new Error(`Yetersiz allotment (${key}): istenen ${rooms}, kalan ${kalan}, kapasite ${capacity}`)
    }
  }
}
