import express from 'express';
import { auth } from '../middleware/auth.js';
import Guest from '../models/Guest.js';
import Reservation from '../models/Reservation.js';

const router = express.Router();

function hotelFrom(req){
  if (req.user.role === 'MASTER_ADMIN') return req.query.hotelId || req.body.hotelId;
  return req.user.hotel?._id;
}

// Ad/telefon/e-posta arama
router.get('/search', auth, async (req, res) => {
  const hotel = hotelFrom(req);
  const q = (req.query.q || '').trim();
  if (!hotel || q.length < 2) return res.json([]); // 2+ karakter

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const items = await Guest.find({
    hotel, $or:[ {name: regex}, {email: regex}, {phone: regex} ]
  }).sort({ updatedAt: -1 }).limit(20);

  res.json(items);
});

// Kart: misafir + özet
router.get('/:id', auth, async (req, res) => {
  const hotel = hotelFrom(req);
  const g = await Guest.findOne({ _id: req.params.id, hotel });
  if (!g) return res.status(404).json({ message: 'Misafir bulunamadı' });

  const rs = await Reservation.find({ hotel, guest: g._id }).sort({ checkIn: -1 });
  const nights = (r) => Math.max(1, Math.round((new Date(r.checkOut)-new Date(r.checkIn))/(24*60*60*1000)));
  const totalNights = rs.reduce((a,r)=> a + nights(r), 0);
  const totalRevenue = rs.reduce((a,r)=> a + (r.totalPrice||0), 0);
  const lastStay = rs[0] || null;
  const nextStay = rs.find(r => r.checkIn > new Date()) || null;

  res.json({ guest: g, stats: { stays: rs.length, totalNights, totalRevenue, lastStay, nextStay } });
});

export default router;
