import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import Hotel from './models/Hotel.js';
import User from './models/User.js';
import Reservation from './models/Reservation.js';
import Transaction from './models/Transaction.js';
import ChannelConnection from './models/ChannelConnection.js';

const run = async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Hotel.deleteMany({}),
    Reservation.deleteMany({}),
    Transaction.deleteMany({}),
    ChannelConnection.deleteMany({}),
  ]);

  const master = await User.create({
    name: 'Master Admin',
    email: 'master@demo.local',
    password: 'Master123!',
    role: 'MASTER_ADMIN',
  });

  const h1 = await Hotel.create({ name: 'Kule Sapanca', code: 'KULE', address: 'Sapanca', phone: '+90 500 000 00 00', createdBy: master._id });
  const h2 = await Hotel.create({ name: 'Iotape Hotel', code: 'IOTAPE', address: 'Alanya', phone: '+90 500 000 00 01', createdBy: master._id });

  const u1 = await User.create({ name: 'Hotel 1 Admin', email: 'hotel1@demo.local', password: 'Demo123!', role: 'HOTEL_ADMIN', hotel: h1._id });
  const u2 = await User.create({ name: 'Hotel 2 Admin', email: 'hotel2@demo.local', password: 'Demo123!', role: 'HOTEL_ADMIN', hotel: h2._id });

  // sample reservations & transactions
  const today = new Date();
  const res1 = await Reservation.create({
    hotel: h1._id,
    channel: 'direct',
    guestName: 'Ali Veli',
    checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
    checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2),
    adults: 2,
    children: 0,
    totalPrice: 4500,
    currency: 'TRY',
    status: 'confirmed',
  });

  await Transaction.create({
    hotel: h1._id,
    type: 'income',
    date: new Date(),
    amount: 4500,
    category: 'Room',
    description: 'Reservation income',
    reservation: res1._id,
    createdBy: u1._id,
  });

  await Transaction.create({
    hotel: h1._id,
    type: 'expense',
    date: new Date(),
    amount: 800,
    category: 'Cleaning',
    description: 'Housekeeping supplies',
    createdBy: u1._id,
  });

  await ChannelConnection.create({ hotel: h1._id, channel: 'airbnb', active: false });
  await ChannelConnection.create({ hotel: h1._id, channel: 'booking', active: false });
  await ChannelConnection.create({ hotel: h1._id, channel: 'etstur', active: false });

  console.log('✅ Seed tamam');
  await mongoose.connection.close();
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});