// backend/src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'

import { connectDB } from './config/db.js'
import authRoutes from './routes/auth.js'
import hotelRoutes from './routes/hotels.js'
import reservationRoutes from './routes/reservations.js'
import financeRoutes from './routes/finance.js'
import channelRoutes from './routes/channels.js'
import dashboardRoutes from './routes/dashboard.js'
import roomsRoutes from './routes/rooms.js'
import guestsRoutes from './routes/guests.js'
import errorHandler from './middleware/errorHandler.js'

const app = express()

/* ---------------- Core app setup ---------------- */
app.disable('x-powered-by')
app.set('trust proxy', 1)

// CORS: tek origin veya virgül ile ayrılmış çoklu origin
// .env içinde CORS_ORIGIN=https://www.tatillenofficial.com yazdık
const RAW_ORIGINS = process.env.CORS_ORIGIN || 'http://localhost:5173'
const ORIGIN_LIST = RAW_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // CLI/SSR istekleri
    if (ORIGIN_LIST.includes('*')) return cb(null, true)
    if (ORIGIN_LIST.includes(origin)) return cb(null, true)
    return cb(new Error(`CORS engellendi: ${origin}`))
  },
  credentials: false, // cookie kullanmıyoruz
  methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept'
  ],
  exposedHeaders: ['Content-Length','X-Request-Id'],
  optionsSuccessStatus: 204
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'))

/* ---------------- Security / Rate limit ---------------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api', apiLimiter)

/* ---------------- Healthcheck ---------------- */
app.get('/', (_req, res) => res.json({ ok: true, name: 'Tatillenofficial HMS Backend' }))
app.get('/api/healthz', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
    mongo: mongoose.connection.readyState, // 1 = connected
    allowedOrigins: ORIGIN_LIST
  })
})

/* ---------------- Routes ---------------- */
app.use('/api/auth', authRoutes)
app.use('/api/hotels', hotelRoutes)
app.use('/api/reservations', reservationRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/channels', channelRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/guests', guestsRoutes)

/* ---------------- 404 (yalnızca /api altında) ---------------- */
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }))

/* ---------------- Error handler ---------------- */
app.use(errorHandler)

/* ---------------- Start & graceful shutdown ---------------- */
const PORT = process.env.PORT || 5000
let server

connectDB()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`✅ HMS API running on port ${PORT}`)
      console.log(`🌍 Allowed Origins: ${ORIGIN_LIST.join(', ')}`)
    })
  })
  .catch((err) => {
    console.error('DB connection error:', err)
    process.exit(1)
  })

const shutdown = async (signal) => {
  try {
    console.log(`\n${signal} alındı, kapanıyor...`)
    if (server) await new Promise((resolve) => server.close(resolve))
    await mongoose.connection.close()
    console.log('🔌 Kapatıldı')
    process.exit(0)
  } catch (e) {
    console.error('Kapanış hatası:', e)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})
