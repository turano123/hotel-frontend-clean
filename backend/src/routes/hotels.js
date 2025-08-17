// backend/src/routes/hotels.js
import express from 'express'
import jwt from 'jsonwebtoken'
import { body, param, query, validationResult } from 'express-validator'

import { auth, requireRole } from '../middleware/auth.js'
import Hotel from '../models/Hotel.js'
import RoomType from '../models/RoomType.js'
import Reservation from '../models/Reservation.js'

const router = express.Router()

/* ---------------- helpers ---------------- */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x }
const clamp = (n, lo, hi) => Math.min(Math.max(Number(n || 0), lo), hi)

function mtdRange () {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start: startOfDay(start), end: endOfDay(now) }
}
const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Doğrulama hatası', errors: errors.array() })
    }
    next()
  }
]

/* ================= LIST: GET /api/hotels =================
   ?page=1&limit=20&q=kuLe   (q veya search)
========================================================== */
router.get(
  '/',
  auth, requireRole('MASTER_ADMIN'),
  validate([
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1 }), // üst sınırı biz clamp’liyoruz
    query('q').optional().isString(),
    query('search').optional().isString()
  ]),
  asyncH(async (req, res) => {
    const page  = clamp(req.query.page, 1, 1e9)
    const limit = clamp(req.query.limit ?? 20, 1, 1000) // büyük listeler için 1000’e kadar izin
    const raw   = (req.query.q ?? req.query.search ?? '').toString().trim()

    const filter = {}
    if (raw) {
      filter.$or = [
        { name: { $regex: raw, $options: 'i' } },
        { code: { $regex: raw, $options: 'i' } },
        { city: { $regex: raw, $options: 'i' } },
      ]
    }

    const [items, total] = await Promise.all([
      Hotel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Hotel.countDocuments(filter)
    ])

    const ids = items.map(h => h._id)
    const { start, end } = mtdRange()

    // MTD gelir
    const mtdAgg = ids.length
      ? await Reservation.aggregate([
          { $match: {
            hotel: { $in: ids },
            status: { $ne: 'cancelled' },
            checkIn:  { $lte: end  },
            checkOut: { $gte: start },
          }},
          { $group: { _id: '$hotel', total: { $sum: { $ifNull: ['$totalPrice', 0] } } } }
        ])
      : []
    const mtdMap = new Map(mtdAgg.map(a => [String(a._id), a.total || 0]))

    // Toplam oda
    const roomAgg = ids.length
      ? await RoomType.aggregate([
          { $match: { hotel: { $in: ids } } },
          { $group: { _id: '$hotel', rooms: { $sum: { $ifNull: ['$totalRooms', 0] } } } }
        ])
      : []
    const roomMap = new Map(roomAgg.map(r => [String(r._id), r.rooms || 0]))

    const withTotals = items.map(h => ({
      ...h,
      totalRooms: roomMap.get(String(h._id)) || 0,
      mtdRevenue: mtdMap.get(String(h._id)) || 0,
    }))

    res.json({ items: withTotals, total, page, pages: Math.ceil(total / limit) })
  })
)

/* ================= GET ONE: /api/hotels/:id ================= */
router.get(
  '/:id',
  auth, requireRole('MASTER_ADMIN'),
  validate([param('id').isMongoId()]),
  asyncH(async (req, res) => {
    const h = await Hotel.findById(req.params.id).lean()
    if (!h) return res.status(404).json({ message: 'Bulunamadı' })

    const [{ rooms = 0 } = {}] = await RoomType.aggregate([
      { $match: { hotel: h._id } },
      { $group: { _id: null, rooms: { $sum: { $ifNull: ['$totalRooms', 0] } } } }
    ])

    const { start, end } = mtdRange()
    const [{ total = 0 } = {}] = await Reservation.aggregate([
      { $match: { hotel: h._id, status: { $ne: 'cancelled' }, checkIn: { $lte: end }, checkOut: { $gte: start } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPrice', 0] } } } }
    ])

    res.json({ ...h, totalRooms: rooms, mtdRevenue: total })
  })
)

/* ================= CREATE: POST /api/hotels =================
   FE alias’ları: email -> adminEmail, isActive -> active
============================================================= */
router.post(
  '/',
  auth, requireRole('MASTER_ADMIN'),
  validate([
    body('code').isString().trim().isLength({ min: 1, max: 20 }), // 1 karakter de kabul
    body('name').isString().trim().isLength({ min: 1 }),
    body('city').optional().isString().trim(),
    body('currency').optional().isString().trim(),
    body('timezone').optional().isString().trim(),
    body('active').optional().isBoolean(),
    body('isActive').optional().isBoolean(),          // FE uyumu
    body('adminEmail').optional().isEmail(),
    body('email').optional().isEmail(),               // FE uyumu
    body('adminPassword').optional().isString().isLength({ min: 6 }),
  ]),
  asyncH(async (req, res) => {
    const payload = { ...req.body }

    // alias mapping
    if (payload.email && !payload.adminEmail) payload.adminEmail = payload.email
    if (typeof payload.isActive === 'boolean' && payload.active === undefined) {
      payload.active = payload.isActive
    }

    // normalize
    payload.code = String(payload.code).trim().toUpperCase()
    payload.name = String(payload.name).trim()
    payload.city = (payload.city || '').trim()
    payload.currency = (payload.currency || 'TRY').trim().toUpperCase()
    payload.timezone = (payload.timezone || 'Europe/Istanbul').trim()
    payload.active = payload.active !== undefined ? !!payload.active : true

    // unique kontrol
    const exists = await Hotel.findOne({ code: payload.code })
    if (exists) return res.status(409).json({ message: 'Bu kod zaten mevcut' })

    delete payload.adminPassword // modele yazmıyoruz

    const created = await Hotel.create(payload)
    res.status(201).json(created)
  })
)

/* ================= UPDATE: PUT /api/hotels/:id ================= */
router.put(
  '/:id',
  auth, requireRole('MASTER_ADMIN'),
  validate([
    param('id').isMongoId(),
    body('name').optional().isString().trim(),
    body('city').optional().isString().trim(),
    body('currency').optional().isString().trim(),
    body('timezone').optional().isString().trim(),
    body('active').optional().isBoolean(),
    body('isActive').optional().isBoolean(),      // FE uyumu
    body('code').optional().isString().trim().isLength({ min: 1, max: 20 }),
    body('adminEmail').optional().isEmail(),
    body('email').optional().isEmail(),           // FE uyumu
  ]),
  asyncH(async (req, res) => {
    const update = {}
    const pick = ['name','city','currency','timezone','active','code','adminEmail']
    for (const k of pick) if (k in req.body) update[k] = req.body[k]

    // alias’lar
    if ('email' in req.body && !('adminEmail' in update)) update.adminEmail = req.body.email
    if ('isActive' in req.body && !('active' in update)) update.active = !!req.body.isActive

    if (update.code) {
      update.code = String(update.code).trim().toUpperCase()
      const clash = await Hotel.findOne({ _id: { $ne: req.params.id }, code: update.code })
      if (clash) return res.status(409).json({ message: 'Kod başka bir otelde kullanılıyor' })
    }
    if (update.currency) update.currency = String(update.currency).trim().toUpperCase()

    const updated = await Hotel.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!updated) return res.status(404).json({ message: 'Bulunamadı' })
    res.json(updated)
  })
)

/* ================= STATUS: PATCH /api/hotels/:id/status ================= */
router.patch(
  '/:id/status',
  auth, requireRole('MASTER_ADMIN'),
  validate([param('id').isMongoId(), body('active').isBoolean()]),
  asyncH(async (req, res) => {
    const updated = await Hotel.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true })
    if (!updated) return res.status(404).json({ message: 'Bulunamadı' })
    res.json(updated)
  })
)

/* ================= DELETE: DELETE /api/hotels/:id ================= */
router.delete(
  '/:id',
  auth, requireRole('MASTER_ADMIN'),
  validate([param('id').isMongoId()]),
  asyncH(async (req, res) => {
    const ok = await Hotel.findByIdAndDelete(req.params.id)
    if (!ok) return res.status(404).json({ message: 'Bulunamadı' })
    res.json({ ok: true })
  })
)

/* ================= IMPERSONATE: /api/hotels/:id/impersonate ================= */
router.post(
  '/:id/impersonate',
  auth, requireRole('MASTER_ADMIN'),
  validate([param('id').isMongoId()]),
  asyncH(async (req, res) => {
    const hotel = await Hotel.findById(req.params.id).lean()
    if (!hotel) return res.status(404).json({ message: 'Bulunamadı' })

    const token = jwt.sign({
      role: 'HOTEL_ADMIN',
      hotel: { _id: hotel._id, name: hotel.name, code: hotel.code },
      impersonatedBy: req.user?.id || req.user?._id || null
    }, process.env.JWT_SECRET || 'dev', { expiresIn: '8h' })

    res.json({
      token,
      role: 'HOTEL_ADMIN',
      hotelId: String(hotel._id),
      hotel: { _id: hotel._id, name: hotel.name, code: hotel.code }
    })
  })
)

export default router
