// backend/src/routes/auth.js
import express from 'express'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body, param, validationResult } from 'express-validator'

import User from '../models/User.js'
import Hotel from '../models/Hotel.js'
import { auth, requireRole } from '../middleware/auth.js'
import asyncHandler from '../middleware/asyncHandler.js'

const router = express.Router()

/* -------------------- yardımcılar -------------------- */
const JWT_SECRET = process.env.JWT_SECRET || 'dev'
const signToken = (payload, exp = '7d') =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: exp })

const validate = (runs) => [
  ...runs,
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ message: 'Doğrulama hatası', errors: errors.array() })
    }
    next()
  },
]

// tek tip user nesnesi
const serializeUser = (userDoc) => ({
  id: userDoc?._id || null,
  name: userDoc?.name || null,
  email: userDoc?.email || null,
  role: userDoc?.role || null,
  hotelId: userDoc?.hotel?._id || null,
  hotelName: userDoc?.hotel?.name || null,
  hotelCode: userDoc?.hotel?.code || null,
})

/* Daha sıkı login rate limit (genel limitten bağımsız) */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 dk
  max: 20, // 20 deneme
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.' },
})

/* -------------------- LOGIN -------------------- */
router.post(
  '/login',
  loginLimiter,
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 3 }).trim(),
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body

    const user = await User.findOne({ email }).populate('hotel')
    if (!user) return res.status(400).json({ message: 'Email veya şifre hatalı' })

    const ok = await user.compare(password)
    if (!ok) return res.status(400).json({ message: 'Email veya şifre hatalı' })

    // (opsiyonel) pasif kullanıcı kontrolü
    if (user.status === 'disabled' || user.active === false) {
      return res.status(403).json({ message: 'Hesap pasif' })
    }

    const token = signToken({
      userId: user._id,
      role: user.role,
      hotel: user.hotel
        ? { _id: user.hotel._id, name: user.hotel.name, code: user.hotel.code }
        : null,
    })

    res.json({ token, user: serializeUser(user) })
  })
)

/* -------------------- ME (profil) -------------------- */
router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.user?.id || req.user?._id

    // İmpersonate token’ında userId olmayabilir; bu durumda minimal profil döndür.
    if (!userId && req.user?.role === 'HOTEL_ADMIN' && req.user?.hotel) {
      return res.json({
        id: null,
        name: 'Impersonated',
        email: null,
        role: 'HOTEL_ADMIN',
        hotelId: req.user.hotel._id,
        hotelName: req.user.hotel.name,
        hotelCode: req.user.hotel.code,
      })
    }

    const user = await User.findById(userId).populate('hotel')
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' })

    res.json(serializeUser(user))
  })
)

/* -------------------- MASTER: Impersonate -------------------- */
/* Frontend iki yolu da kullanabilsin diye POST ve GET sağlıyoruz. */

/** POST /api/auth/impersonate  => body.hotelId veya ?hotelId= */
router.post(
  '/impersonate',
  auth,
  requireRole('MASTER_ADMIN'),
  validate([body('hotelId').optional().isMongoId()]),
  asyncHandler(async (req, res) => {
    const hotelId = req.body?.hotelId || req.query?.hotelId
    if (!hotelId) return res.status(400).json({ message: 'hotelId gerekli' })

    const hotel = await Hotel.findById(hotelId).lean()
    if (!hotel) return res.status(404).json({ message: 'Bulunamadı' })

    const token = signToken(
      {
        role: 'HOTEL_ADMIN',
        hotel: { _id: hotel._id, name: hotel.name, code: hotel.code },
        impersonatedBy: req.user?.id || req.user?._id || null,
      },
      '8h'
    )

    res.json({
      token,
      role: 'HOTEL_ADMIN',
      hotelId: String(hotel._id),
      hotel: { _id: hotel._id, name: hotel.name, code: hotel.code },
    })
  })
)

/** GET /api/auth/impersonate/:id */
router.get(
  '/impersonate/:id',
  auth,
  requireRole('MASTER_ADMIN'),
  validate([param('id').isMongoId()]),
  asyncHandler(async (req, res) => {
    const hotel = await Hotel.findById(req.params.id).lean()
    if (!hotel) return res.status(404).json({ message: 'Bulunamadı' })

    const token = signToken(
      {
        role: 'HOTEL_ADMIN',
        hotel: { _id: hotel._id, name: hotel.name, code: hotel.code },
        impersonatedBy: req.user?.id || req.user?._id || null,
      },
      '8h'
    )

    res.json({
      token,
      role: 'HOTEL_ADMIN',
      hotelId: String(hotel._id),
      hotel: { _id: hotel._id, name: hotel.name, code: hotel.code },
    })
  })
)

/* -------------------- LOGOUT -------------------- */
/* Sunucu tarafında state yok; sadece OK döner (FE token’ı siler). */
router.post('/logout', auth, (_req, res) => res.json({ ok: true }))

export default router
