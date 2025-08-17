// backend/src/routes/reservations.js
import express from 'express'
import mongoose from 'mongoose'
import { body, query, param, validationResult } from 'express-validator'

import Reservation from '../models/Reservation.js'
import Guest from '../models/Guest.js'
import { auth, requireRole } from '../middleware/auth.js'
import asyncHandler from '../middleware/asyncHandler.js'
import { ensureAvailability } from '../utils/availability.js'

const router = express.Router()

/* ---------------- helpers ---------------- */
const isObjId = (v) => mongoose.Types.ObjectId.isValid(String(v))
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x }
const escRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const num = (v, def=0) => (Number.isFinite(Number(v)) ? Number(v) : def)

const validate = (runs) => [
  ...runs,
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ message:'Doğrulama hatası', errors: errors.array() })
    next()
  }
]

/** Otel kapsamı: Hotel kullanıcıları kendi otelini, Master ?hotelId verdiyse onu; yoksa tümü */
function scopeFilter(req) {
  const role = req.user?.role
  const tokenHotel = req.user?.hotel?._id || req.user?.hotel
  const queryHotel = req.query?.hotelId

  if (role !== 'MASTER_ADMIN') {
    return tokenHotel && isObjId(tokenHotel) ? { hotel: new mongoose.Types.ObjectId(tokenHotel) } : { hotel: null }
  }
  if (queryHotel && isObjId(queryHotel)) return { hotel: new mongoose.Types.ObjectId(queryHotel) }
  return {} // master tüm oteller
}

/* =================================================================== */
/* GET /api/reservations                                               */
/* =================================================================== */
router.get(
  '/',
  auth,
  validate([
    query('page').optional().toInt().isInt({ min:1 }),
    query('limit').optional().toInt().isInt({ min:1, max:100 }),
    query('start').optional().isISO8601().toDate(),
    query('end').optional().isISO8601().toDate(),
    query('status').optional().isString(),
    query('channel').optional().isString(),
    query('guest').optional().isString(),
    query('hotelId').optional().custom((v)=> isObjId(v) || v==='').withMessage('Geçersiz hotelId')
  ]),
  asyncHandler(async (req, res) => {
    const { page=1, limit=20, status, channel } = req.query
    const filter = { ...scopeFilter(req) }

    // Tarih çakışma filtresi
    if (req.query.start || req.query.end) {
      const s = req.query.start ? startOfDay(req.query.start) : null
      const e = req.query.end   ? endOfDay(req.query.end)     : null
      filter.$and = []
      if (e) filter.$and.push({ checkIn: { $lte: e } })
      if (s) filter.$and.push({ checkOut: { $gte: s } })
      if (!filter.$and.length) delete filter.$and
    }

    if (status)  filter.status  = status
    if (channel) filter.channel = channel

    // Misafir araması: guestName + Guest tablosunda name/email/phone
    if (req.query.guest && String(req.query.guest).trim()) {
      const regex = new RegExp(escRegex(req.query.guest.trim()), 'i')
      const or = [{ guestName: { $regex: regex } }]

      const guestMatch = { $or: [{ name: regex }, { email: regex }, { phone: regex }] }
      // Hotel kapsamı varsa Guest aramasını da o kapsamda yap
      const scopedGuestMatch = filter.hotel ? { ...guestMatch, hotel: filter.hotel } : guestMatch
      const guests = await Guest.find(scopedGuestMatch).select('_id').lean()
      if (guests.length) or.push({ guest: { $in: guests.map(g => g._id) } })
      filter.$or = or
    }

    const p = Number(page), l = Number(limit)
    const [items, total] = await Promise.all([
      Reservation.find(filter)
        .populate('roomType')
        .populate('guest')
        .sort({ checkIn: -1, createdAt: -1 })
        .skip((p-1)*l).limit(l),
      Reservation.countDocuments(filter),
    ])

    res.json({ items, total, page:p, pages: Math.ceil(total / l) })
  })
)

/* =================================================================== */
/* POST /api/reservations                                              */
/* =================================================================== */
router.post(
  '/',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    body().custom((val)=> {
      const inline = val?.guestName && String(val.guestName).trim()
      const nested = val?.guest?.name && String(val.guest.name).trim()
      if (inline || nested) return true
      throw new Error('Misafir adı zorunludur (guestName veya guest.name)')
    }),
    body('checkIn').isISO8601().toDate(),
    body('checkOut').isISO8601().toDate(),
    body('rooms').optional().toInt().isInt({ min:1 }),
    body('roomType').optional().isMongoId(),
    body('totalPrice').optional().isFloat({ min:0 }),
    body('depositAmount').optional().isFloat({ min:0 }),
  ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' })

    const payload = { ...req.body }
    if (new Date(payload.checkOut) <= new Date(payload.checkIn)) {
      return res.status(400).json({ message: 'Çıkış tarihi girişten sonra olmalı' })
    }

    // sayısal alanlar
    payload.rooms         = num(payload.rooms || 1, 1)
    payload.adults        = num(payload.adults || 0, 0)
    payload.children      = num(payload.children || 0, 0)
    payload.totalPrice    = num(payload.totalPrice || 0, 0)
    payload.depositAmount = num(payload.depositAmount || 0, 0)
    payload.hotel         = hotel
    payload.status        = payload.status || 'confirmed'

    // guest upsert/bind
    let guestId = payload.guestId
    let guestNameCandidate = payload.guestName

    if (!guestId && payload.guest && payload.guest.name) {
      const { name, email, phone, country, documentNo } = payload.guest
      let g = null
      if (email || phone) {
        g = await Guest.findOne({ hotel, $or: [ ...(email?[{email}]:[]), ...(phone?[{phone}]:[]) ] })
      }
      if (g) { g.set({ name, email, phone, country, documentNo }); await g.save() }
      else  { g = await Guest.create({ hotel, name, email, phone, country, documentNo }) }
      guestId = g._id
      guestNameCandidate = guestNameCandidate || name
    }
    if (guestId) payload.guest = guestId
    if (!payload.guestName) payload.guestName = guestNameCandidate || 'Misafir'

    // uygunluk
    if (payload.roomType) {
      await ensureAvailability({
        hotel,
        roomType: payload.roomType,
        checkIn:  payload.checkIn,
        checkOut: payload.checkOut,
        rooms:    payload.rooms || 1
      })
    }

    const created = await Reservation.create(payload)
    const populated = await Reservation.findById(created._id).populate('roomType').populate('guest')
    res.status(201).json(populated)
  })
)

/* =================================================================== */
/* PUT /api/reservations/:id                                           */
/* =================================================================== */
router.put(
  '/:id',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    param('id').isMongoId(),
    body('guestName').optional().isString().trim(),
    body('checkIn').optional().isISO8601().toDate(),
    body('checkOut').optional().isISO8601().toDate(),
    body('rooms').optional().toInt().isInt({ min:1 }),
    body('roomType').optional().isMongoId(),
    body('totalPrice').optional().isFloat({ min:0 }),
    body('depositAmount').optional().isFloat({ min:0 }),
  ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' })

    const current = await Reservation.findOne({ _id: req.params.id, hotel })
    if (!current) return res.status(404).json({ message: 'Bulunamadı' })

    const next = { ...req.body }
    // numerikler
    if ('rooms'         in next) next.rooms         = num(next.rooms, 1)
    if ('adults'        in next) next.adults        = num(next.adults, 0)
    if ('children'      in next) next.children      = num(next.children, 0)
    if ('totalPrice'    in next) next.totalPrice    = num(next.totalPrice, 0)
    if ('depositAmount' in next) next.depositAmount = num(next.depositAmount, 0)

    // guest upsert (opsiyonel)
    if (next.guestId) {
      next.guest = next.guestId
    } else if (next.guest && next.guest.name) {
      const { name, email, phone, country, documentNo } = next.guest
      let g = null
      if (email || phone) {
        g = await Guest.findOne({ hotel, $or: [ ...(email?[{email}]:[]), ...(phone?[{phone}]:[]) ] })
      }
      if (g) { g.set({ name, email, phone, country, documentNo }); await g.save() }
      else  { g = await Guest.create({ hotel, name, email, phone, country, documentNo }) }
      next.guest = g._id
      if (!next.guestName) next.guestName = name
    }

    const ci = next.checkIn  || current.checkIn
    const co = next.checkOut || current.checkOut
    const rt = next.roomType || current.roomType
    const rm = 'rooms' in next ? next.rooms : current.rooms

    if (new Date(co) <= new Date(ci)) {
      return res.status(400).json({ message: 'Çıkış tarihi girişten sonra olmalı' })
    }

    if (rt) {
      await ensureAvailability({
        hotel, roomType: rt, checkIn: ci, checkOut: co, rooms: rm, excludeResId: current._id
      })
    }

    const updated = await Reservation.findOneAndUpdate(
      { _id: current._id },
      next,
      { new: true }
    ).populate('roomType').populate('guest')

    res.json(updated)
  })
)

/* =================================================================== */
/* PATCH /api/reservations/:id/status                                  */
/* =================================================================== */
router.patch(
  '/:id/status',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([ param('id').isMongoId(), body('status').isIn(['pending','confirmed','cancelled']) ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' })

    const updated = await Reservation.findOneAndUpdate(
      { _id: req.params.id, hotel },
      { status: req.body.status },
      { new: true }
    ).populate('roomType').populate('guest')

    if (!updated) return res.status(404).json({ message: 'Bulunamadı' })
    res.json(updated)
  })
)

/* =================================================================== */
/* DELETE /api/reservations/:id                                        */
/* =================================================================== */
router.delete(
  '/:id',
  auth, requireRole('HOTEL_ADMIN'),
  validate([ param('id').isMongoId() ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' })

    const deleted = await Reservation.findOneAndDelete({ _id: req.params.id, hotel })
    if (!deleted) return res.status(404).json({ message: 'Bulunamadı' })
    res.json({ ok: true })
  })
)

export default router
