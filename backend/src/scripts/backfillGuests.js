import 'dotenv/config'
import { connectDB } from '../config/db.js'
import Reservation from '../models/Reservation.js'
import Guest from '../models/Guest.js'

await connectDB()

const targets = await Reservation.find({ $or: [ { guest: { $exists: false } }, { guest: null } ] })
let linked = 0
for (const r of targets) {
  const name = r.guestName || 'Misafir'
  const g = await Guest.create({ hotel: r.hotel, name })
  r.guest = g._id
  await r.save()
  linked++
}
console.log(`Bağlanan rezervasyon sayısı: ${linked}`)
process.exit(0)
