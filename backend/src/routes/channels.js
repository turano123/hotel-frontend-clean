import express from 'express';
import ChannelConnection from '../models/ChannelConnection.js';
import { auth, requireRole } from '../middleware/auth.js';
import * as airbnb from '../utils/channelAdapters/airbnb.js';
import * as booking from '../utils/channelAdapters/booking.js';
import * as etstur from '../utils/channelAdapters/etstur.js';

const router = express.Router();

/**
 * Master: ?hotelId=...
 * Hotel Admin/Staff: kendi oteli
 */
router.get('/', auth, requireRole('MASTER_ADMIN', 'HOTEL_ADMIN', 'HOTEL_STAFF'), async (req, res) => {
  let hotel;
  if (req.user.role === 'MASTER_ADMIN') {
    hotel = req.query.hotelId;
    if (!hotel) return res.status(400).json({ message: 'hotelId gereklidir (MASTER için)' });
  } else {
    hotel = req.user.hotel?._id;
  }
  const items = await ChannelConnection.find({ hotel });
  res.json(items);
});

/**
 * Bağla/Güncelle
 * Master: body.hotelId veya ?hotelId
 */
router.post('/connect', auth, requireRole('MASTER_ADMIN', 'HOTEL_ADMIN'), async (req, res) => {
  const hotel = req.user.role === 'MASTER_ADMIN'
    ? (req.body.hotelId || req.query.hotelId)
    : req.user.hotel?._id;

  if (!hotel) return res.status(400).json({ message: 'hotelId bulunamadı' });
  const { channel, credentials } = req.body;
  if (!channel) return res.status(400).json({ message: 'channel gereklidir' });

  const updated = await ChannelConnection.findOneAndUpdate(
    { hotel, channel },
    { hotel, channel, credentials: credentials || {}, active: true },
    { upsert: true, new: true }
  );
  res.json(updated);
});

/**
 * Senkron (demo)
 * Master: ?hotelId
 */
router.post('/:channel/sync', auth, requireRole('MASTER_ADMIN', 'HOTEL_ADMIN'), async (req, res) => {
  const hotel = req.user.role === 'MASTER_ADMIN'
    ? (req.query.hotelId)
    : req.user.hotel?._id;

  if (!hotel) return res.status(400).json({ message: 'hotelId bulunamadı' });

  const { channel } = req.params;
  let result;
  if (channel === 'airbnb') result = await airbnb.sync(hotel);
  else if (channel === 'booking') result = await booking.sync(hotel);
  else if (channel === 'etstur') result = await etstur.sync(hotel);
  else return res.status(400).json({ message: 'Bilinmeyen kanal' });

  const conn = await ChannelConnection.findOneAndUpdate(
    { hotel, channel },
    { $set: { active: true, lastSync: new Date() } },
    { upsert: true, new: true }
  );

  res.json({ ok: true, result, connection: conn });
});

export default router;
