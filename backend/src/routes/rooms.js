// backend/src/routes/rooms.js
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import { body, query, param, validationResult } from 'express-validator';
import RoomType from '../models/RoomType.js';
import Inventory from '../models/Inventory.js';
import Reservation from '../models/Reservation.js';

const router = express.Router();
const DAY = 24*60*60*1000;
const sod = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

const validate = (runs) => [
  ...runs,
  (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ message: 'Doğrulama hatası', errors: errs.array() });
    next();
  }
];

function hotelFrom(req){
  if (req.user.role === 'MASTER_ADMIN') return req.query.hotelId || req.body.hotelId;
  return req.user.hotel?._id;
}

/* =========================
   ROOM TYPE — LIST
   GET /api/rooms/types
========================= */
router.get('/types',
  auth,
  async (req, res) => {
    const hotel = hotelFrom(req);
    const items = await RoomType.find({ hotel }).sort({ createdAt: -1 });
    res.json(items);
  }
);

/* =========================
   ROOM TYPE — CREATE
   POST /api/rooms/types
========================= */
router.post('/types',
  auth, requireRole('HOTEL_ADMIN'),
  validate([
    body('code').isString().trim().notEmpty(),
    body('name').isString().trim().notEmpty(),
    body('basePrice').optional().isFloat({ min:0 }),
    body('capacityAdults').optional().isInt({ min:1 }),
    body('capacityChildren').optional().isInt({ min:0 }),
    body('totalRooms').optional().isInt({ min:0 }),
  ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    const payload = { ...req.body, hotel };
    const created = await RoomType.create(payload);
    res.status(201).json(created);
  }
);

/* =========================
   ROOM TYPE — UPDATE
   PUT /api/rooms/types/:id
========================= */
router.put('/types/:id',
  auth, requireRole('HOTEL_ADMIN'),
  validate([
    param('id').isMongoId(),
    body('code').optional().isString().trim(),
    body('name').optional().isString().trim(),
  ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    const updated = await RoomType.findOneAndUpdate(
      { _id: req.params.id, hotel }, req.body, { new:true }
    );
    if (!updated) return res.status(404).json({ message:'Oda tipi bulunamadı' });
    res.json(updated);
  }
);

/* =========================
   ROOM TYPE — DELETE
   DELETE /api/rooms/types/:id
   (temel güvenlik: rezervasyon varsa engelle)
========================= */
router.delete('/types/:id',
  auth, requireRole('HOTEL_ADMIN'),
  validate([ param('id').isMongoId() ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    // Bu tipte aktif rezervasyon var mı?
    const hasRes = await Reservation.exists({ hotel, roomType: req.params.id, status: { $ne: 'cancelled' } });
    if (hasRes) return res.status(400).json({ message:'Bu oda tipine bağlı aktif rezervasyonlar var. Silemezsiniz.' });

    await Inventory.deleteMany({ hotel, roomType: req.params.id });
    const del = await RoomType.findOneAndDelete({ _id: req.params.id, hotel });
    if (!del) return res.status(404).json({ message:'Oda tipi bulunamadı' });
    res.json({ ok:true });
  }
);

/* =========================
   INVENTORY — GET
   GET /api/rooms/inventory?roomType&start&end
========================= */
router.get('/inventory',
  auth,
  validate([
    query('roomType').isMongoId(),
    query('start').isISO8601(),
    query('end').isISO8601(),
  ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    const { roomType, start, end } = req.query;
    const s = sod(new Date(start)), e = sod(new Date(end));
    const items = await Inventory.find({
      hotel, roomType, date: { $gte: s, $lt: e }
    }).sort({ date: 1 }).lean();

    res.json(items);
  }
);

/* =========================
   INVENTORY — BULK UPSERT
   POST /api/rooms/inventory/bulk
   body: { roomType, start(YYYY-MM-DD), end(YYYY-MM-DD), price?, allotment?, stopSell? }
========================= */
router.post('/inventory/bulk',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    body('roomType').isMongoId(),
    body('start').isISO8601(),
    body('end').isISO8601(),
    body('price').optional().isFloat({ min:0 }),
    body('allotment').optional().isInt({ min:0 }),
    body('stopSell').optional().isBoolean(),
  ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    const { roomType, start, end, price, allotment, stopSell } = req.body;
    const s = sod(new Date(start)), e = sod(new Date(end));
    if (!(e > s)) return res.status(400).json({ message:'end, start tarihinden sonra olmalı' });

    const toSet = {};
    if (price !== undefined) toSet.price = price;
    if (allotment !== undefined) toSet.allotment = allotment;
    if (stopSell !== undefined) toSet.stopSell = stopSell;

    let count = 0;
    for (let t = s.getTime(); t < e.getTime(); t += DAY) {
      const d = new Date(t);
      await Inventory.updateOne(
        { hotel, roomType, date: d },
        { $set: { hotel, roomType, date: d, ...toSet } },
        { upsert: true }
      );
      count++;
    }
    res.json({ ok:true, days: count });
  }
);

/* =========================
   AVAILABILITY QUOTE (daha önce eklediğimiz)
   GET /api/rooms/availability/quote?roomType&start&end&rooms=1
========================= */
router.get('/availability/quote',
  auth,
  validate([
    query('roomType').isMongoId(),
    query('start').isISO8601(),
    query('end').isISO8601(),
    query('rooms').optional().isInt({ min:1 })
  ]),
  async (req,res) => {
    const hotel = hotelFrom(req);
    const { roomType, start, end } = req.query;
    const rooms = Number(req.query.rooms || 1);

    const rt = await RoomType.findOne({ _id: roomType, hotel });
    if (!rt) return res.status(404).json({ message:'Oda tipi bulunamadı' });

    const s = sod(new Date(start)), e = sod(new Date(end));
    if (!(e > s)) return res.status(400).json({ message:'end, start tarihinden sonra olmalı' });

    const days = []; for (let t=s.getTime(); t<e.getTime(); t+=DAY) days.push(new Date(t));

    const invList = await Inventory.find({ hotel, roomType, date: { $gte: s, $lt: e } }).lean();

    const usedAgg = await Reservation.aggregate([
      { $match: { hotel, roomType: rt._id, status: 'confirmed', checkIn: { $lt: e }, checkOut: { $gt: s } } },
      { $project: { rooms: '$rooms', checkIn: 1, checkOut: 1 } }
    ]);

    const usedByDay = new Map();
    for (const r of usedAgg) {
      const ci = sod(r.checkIn), co = sod(r.checkOut);
      for (let t=ci.getTime(); t<co.getTime(); t+=DAY) {
        if (t < s.getTime() || t >= e.getTime()) continue;
        const key = new Date(t).toISOString();
        usedByDay.set(key, (usedByDay.get(key)||0) + (r.rooms||1));
      }
    }

    let available = true, suggested = 0;
    const remainingPerDay = days.map(d => {
      const inv = invList.find(x => sod(x.date).getTime() === d.getTime());
      const allotment = inv?.stopSell ? 0 : (inv?.allotment ?? (rt.totalRooms || 0));
      const used = usedByDay.get(d.toISOString()) || 0;
      const remaining = Math.max(0, allotment - used);
      if (remaining < rooms) available = false;

      const pricePerNight = (inv?.price ?? rt.basePrice ?? 0);
      suggested += pricePerNight;

      return { date: d, allotment, used, remaining, price: pricePerNight, stopSell: !!inv?.stopSell };
    });

    const nights = remainingPerDay.length;
    const suggestedTotalPrice = suggested * rooms;

    res.json({ nights, remainingPerDay, available, suggestedTotalPrice });
  }
);

export default router;
