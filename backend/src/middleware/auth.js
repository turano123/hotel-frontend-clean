// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev';

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // payload id alanını esnek karşıla
    const id =
      payload.userId ||
      payload.id ||
      payload.sub ||
      payload._id ||
      null;

    req.user = {
      id,
      role: payload.role || 'HOTEL_ADMIN',
      hotel: payload.hotel || null,
      raw: payload,
    };

    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
