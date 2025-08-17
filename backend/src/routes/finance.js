import express from 'express';
import fetch from 'node-fetch';
import { auth, requireRole } from '../middleware/auth.js';
import { body, param, query, validationResult } from 'express-validator';
import FinanceEntry from '../models/FinanceEntry.js';


const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- helpers ---------------- */
const validate = (runs) => [
  ...runs,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Doğrulama hatası', errors: errors.array() });
    next();
  },
];

const parseDate = (d, endOfDay = false) => {
  if (!d) return undefined;
  const x = new Date(d);
  if (Number.isNaN(+x)) return undefined;
  if (endOfDay) x.setHours(23, 59, 59, 999);
  else x.setHours(0, 0, 0, 0);
  return x;
};

const toUpper = (v, def = '') => (v ? String(v).trim().toUpperCase() : def);
const toLower = (v, def = '') => (v ? String(v).trim().toLowerCase() : def);

/* ---- method/source canonicalization ---- */
const METHOD_CANON = {
  cash: 'cash', nakit: 'cash', 'cash ': 'cash',
  pos: 'pos', card: 'pos', kart: 'pos', 'kredi kartı': 'pos',
  transfer: 'transfer', havale: 'transfer', eft: 'transfer', wire: 'transfer', bank: 'transfer',
  online: 'online', virtualpos: 'online', stripe: 'online', paypal: 'online', iyzico: 'online',
  other: 'other',
};
const normMethod = (v) => {
  const k = toLower(v, 'other');
  return METHOD_CANON[k] || (['cash','pos','transfer','online','other'].includes(k) ? k : 'other');
};

/* FinanceEntry enum: manual | res_payment | res_balance | res_refund | system */
const SOURCE_CANON = {
  manual: 'manual', system: 'system',
  'reservation-payment': 'res_payment', res_payment: 'res_payment', payment: 'res_payment',
  'reservation-refund':  'res_refund',  res_refund:  'res_refund',  refund:  'res_refund',
  'reservation-balance': 'res_balance', res_balance: 'res_balance', balance: 'res_balance',
  'reservation-planned': 'res_balance', res_planned: 'res_balance', planned: 'res_balance',
};
const normSource = (v) => SOURCE_CANON[toLower(v, 'manual')] || 'manual';

/* ---------------- RATES (cached proxy) ---------------- */
const rateCache = new Map();
const RATE_TTL_MS = 30 * 60 * 1000;

router.get(
  '/rates',
  auth,
  validate([query('base').optional().isString(), query('symbols').optional().isString()]),
  ah(async (req, res) => {
    const base = toUpper(req.query.base || 'TRY');
    const symbols = toUpper(req.query.symbols || 'USD,EUR,GBP,TRY').split(',').filter(Boolean).join(',');
    const key = `${base}:${symbols}`;
    const now = Date.now();
    const cached = rateCache.get(key);
    if (cached && now - cached.ts < RATE_TTL_MS) return res.json(cached.data);

    const url = `https://api.exchangerate.host/latest?base=${base}&symbols=${symbols}`;
    let data;
    try {
      const r = await fetch(url, { timeout: 10_000 });
      data = await r.json();
      if (!data || !data.rates) throw new Error('invalid');
    } catch {
      data = { base, rates: { USD: 0.03, EUR: 0.03, GBP: 0.025, TRY: 1 } };
    }
    rateCache.set(key, { ts: now, data });
    res.json(data);
  })
);

/* ---------------- LIST ---------------- */
router.get(
  '/entries',
  auth,
  validate([
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 200 }),
    query('type').optional().isIn(['income', 'expense']),
    query('method').optional().isString(),
    query('category').optional().isString(),
    query('q').optional().isString(),
    query('start').optional().isISO8601(),
    query('end').optional().isISO8601(),
  ]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const { page = 1, limit = 15, type, method, category, q } = req.query;
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end, true);

    const filter = { hotel };
    if (type) filter.type = type;
    if (method) filter.method = normMethod(method);
    if (category) filter.category = category;
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = start;
      if (end) filter.date.$lte = end;
    }
    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ note: rx }, { category: rx }, { ref: rx }];
    }

    const p = Number(page), l = Number(limit);

    // <-- kritik: amountTry boşsa amount*fxRate kullan
    const amountTryExpr = {
      $multiply: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$fxRate', 1] }]
    };

    const [items, total, sums] = await Promise.all([
      FinanceEntry.find(filter).sort({ date: -1, _id: -1 }).skip((p - 1) * l).limit(l),
      FinanceEntry.countDocuments(filter),
      FinanceEntry.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            incomeTry:  { $sum: { $cond: [{ $eq: ['$type', 'income']  }, amountTryExpr, 0] } },
            expenseTry: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, amountTryExpr, 0] } },
          },
        },
      ]),
    ]);

    const { incomeTry = 0, expenseTry = 0 } = sums[0] || {};
    res.json({
      items,
      total,
      page: p,
      pages: Math.ceil(total / l),
      summary: { incomeTry, expenseTry, netTry: incomeTry - expenseTry },
    });
  })
);

/* ---------------- GET ONE ---------------- */
router.get(
  '/entries/:id',
  auth,
  validate([param('id').isMongoId()]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const item = await FinanceEntry.findOne({ _id: req.params.id, hotel });
    if (!item) return res.status(404).json({ message: 'Bulunamadı' });
    res.json(item);
  })
);

/* ---------------- CREATE ---------------- */
router.post(
  '/entries',
  auth,
  requireRole('HOTEL_ADMIN', 'HOTEL_STAFF'),
  validate([
    body('type').isIn(['income', 'expense']),
    body('amount').isFloat({ min: 0 }),
    body('date').optional().isISO8601(),
    body('method').optional().isString(),
    body('category').optional().isString(),
    body('currency').optional().isString(),
    body('fxRate').optional().isFloat({ min: 0 }),
    body('uniqueKey').optional().isString(),
    body('source').optional().isString(),
  ]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const b = req.body || {};
    const currency = toUpper(b.currency || 'TRY');
    const payload = {
      hotel,
      type: b.type,
      method: normMethod(b.method),
      category: b.category || 'Genel',
      amount: Number(b.amount || 0),
      currency,
      fxRate: Number(b.fxRate ?? (currency === 'TRY' ? 1 : b.fxRate || 1)),
      date: b.date ? new Date(b.date) : new Date(),
      note: b.note || '',
      ref: b.ref || '',
      uniqueKey: b.uniqueKey || undefined,
      source: normSource(b.source),
      reservation: b.reservation || undefined,
      guestName: b.guestName || undefined,
      channel: b.channel || undefined,
    };

    const created = payload.uniqueKey
      ? await FinanceEntry.upsertByUniqueKey(payload)
      : await FinanceEntry.create(payload);

    res.status(201).json(created);
  })
);

/* ---------------- BULK (idempotent) ---------------- */
router.post(
  '/entries/bulk',
  auth,
  requireRole('HOTEL_ADMIN', 'HOTEL_STAFF'),
  validate([body('entries').isArray({ min: 1 })]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const docs = (req.body.entries || []).map((e) => {
      const currency = toUpper(e.currency || 'TRY');
      return {
        hotel,
        type: e.type,
        method: normMethod(e.method),
        category: e.category || 'Genel',
        amount: Number(e.amount || 0),
        currency,
        fxRate: Number(e.fxRate ?? (currency === 'TRY' ? 1 : e.fxRate || 1)),
        date: e.date ? new Date(e.date) : new Date(),
        note: e.note || '',
        ref: e.ref || '',
        uniqueKey: e.uniqueKey || undefined,
        source: normSource(e.source),
        reservation: e.reservation || undefined,
        guestName: e.guestName || undefined,
        channel: e.channel || undefined,
      };
    });

    const withKey = docs.filter((d) => d.uniqueKey);
    const noKey = docs.filter((d) => !d.uniqueKey);

    let upserted = 0;
    if (withKey.length) {
      const ops = withKey.map((d) => ({
        updateOne: { filter: { uniqueKey: d.uniqueKey }, update: { $setOnInsert: d }, upsert: true }
      }));
      const r = await FinanceEntry.bulkWrite(ops, { ordered: false });
      upserted = (r?.upsertedCount || 0) + (r?.modifiedCount || 0);
    }

    let inserted = 0;
    if (noKey.length) {
      const r = await FinanceEntry.insertMany(noKey, { ordered: false });
      inserted = r.length;
    }

    res.status(201).json({ ok: true, upserted, inserted });
  })
);

/* ---------------- REPEAT ---------------- */
router.post(
  '/entries/repeat',
  auth,
  requireRole('HOTEL_ADMIN', 'HOTEL_STAFF'),
  validate([
    body('seed').isObject(),
    body('repeat.every').isIn(['daily', 'weekly', 'monthly']),
    body('repeat.times').isInt({ min: 1, max: 100 }),
    body('repeat.step').optional().toInt().isInt({ min: 1, max: 12 }),
  ]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const { seed, repeat } = req.body;
    const step = repeat.step || 1;

    const currency = toUpper(seed.currency || 'TRY');
    const base = {
      hotel,
      type: seed.type,
      method: normMethod(seed.method),
      category: seed.category || 'Genel',
      amount: Number(seed.amount || 0),
      currency,
      fxRate: Number(seed.fxRate ?? (currency === 'TRY' ? 1 : seed.fxRate || 1)),
      date: seed.date ? new Date(seed.date) : new Date(),
      note: seed.note || '',
      ref: seed.ref || '',
      source: normSource(seed.source),
    };

    const docs = [];
    for (let i = 0; i < repeat.times; i += 1) {
      const d = new Date(base.date);
      if (repeat.every === 'daily') d.setDate(d.getDate() + i * step);
      if (repeat.every === 'weekly') d.setDate(d.getDate() + i * 7 * step);
      if (repeat.every === 'monthly') d.setMonth(d.getMonth() + i * step);
      docs.push({ ...base, date: d });
    }

    const created = await FinanceEntry.insertMany(docs);
    res.status(201).json({ ok: true, count: created.length });
  })
);

/* ---------------- UPDATE ---------------- */
router.put(
  '/entries/:id',
  auth,
  requireRole('HOTEL_ADMIN', 'HOTEL_STAFF'),
  validate([
    param('id').isMongoId(),
    body('type').optional().isIn(['income', 'expense']),
    body('amount').optional().isFloat({ min: 0 }),
    body('date').optional().isISO8601(),
  ]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const b = req.body || {};

    const update = {};
    const fields = ['type','category','note','ref','reservation','guestName','channel'];
    fields.forEach((k) => (k in b ? (update[k] = b[k]) : null));
    if ('method'   in b) update.method   = normMethod(b.method);
    if ('source'   in b) update.source   = normSource(b.source);
    if ('amount'   in b) update.amount   = Number(b.amount);
    if ('currency' in b) update.currency = toUpper(b.currency);
    if ('fxRate'   in b) update.fxRate   = Number(b.fxRate);
    if ('date'     in b) update.date     = new Date(b.date);

    const updated = await FinanceEntry.findOneAndUpdate({ _id: req.params.id, hotel }, update, { new: true });
    if (!updated) return res.status(404).json({ message: 'Bulunamadı' });
    res.json(updated);
  })
);

/* ---------------- DELETE ---------------- */
router.delete(
  '/entries/:id',
  auth,
  requireRole('HOTEL_ADMIN', 'HOTEL_STAFF'),
  validate([param('id').isMongoId()]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const del = await FinanceEntry.findOneAndDelete({ _id: req.params.id, hotel });
    if (!del) return res.status(404).json({ message: 'Bulunamadı' });
    res.json({ ok: true });
  })
);

/* ---------------- SUMMARY (kategori / yöntem) ---------------- */
router.get(
  '/entries/summary',
  auth,
  validate([
    query('groupBy').optional().isIn(['category', 'method']),
    query('start').optional().isISO8601(),
    query('end').optional().isISO8601(),
    query('type').optional().isIn(['income', 'expense']),
  ]),
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const groupBy = req.query.groupBy || 'category';
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end, true);

    const match = { hotel };
    if (req.query.type) match.type = req.query.type;
    if (start || end) {
      match.date = {};
      if (start) match.date.$gte = start;
      if (end) match.date.$lte = end;
    }

    const amountTryExpr = {
      $multiply: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$fxRate', 1] }]
    };

    const rows = await FinanceEntry.aggregate([
      { $match: match },
      { $group: { _id: `$${groupBy}`, totalTry: { $sum: amountTryExpr }, count: { $sum: 1 } } },
      { $sort: { totalTry: -1 } },
    ]);

    res.json({ groupBy, rows });
  })
);

/* ---------------- EXPORT CSV ---------------- */
router.get(
  '/entries/export.csv',
  auth,
  ah(async (req, res) => {
    const hotel = req.user.hotel?._id;
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end, true);
    const filter = { hotel };
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = start;
      if (end) filter.date.$lte = end;
    }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.method) filter.method = normMethod(req.query.method);

    const items = await FinanceEntry.find(filter).sort({ date: -1, _id: -1 }).lean();

    const rows = [
      ['Tarih','Tip','Yöntem','Kategori','Tutar','Para','Kur','Tutar(TRY)','Not','Ref'],
      ...items.map((e) => [
        new Date(e.date).toISOString().slice(0,10),
        e.type,
        e.method,
        e.category,
        String(e.amount ?? 0).replace('.', ','),
        e.currency || 'TRY',
        String(e.fxRate ?? 1).replace('.', ','),
        String((e.amountTry ?? ((e.amount || 0) * (e.fxRate || 1)))).replace('.', ','),
        (e.note || '').replace(/\r?\n/g, ' '),
        e.ref || '',
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="finance_export.csv"');
    res.send(csv);
  })
);

export default router;
