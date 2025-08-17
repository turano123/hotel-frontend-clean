// backend/src/middleware/errorHandler.js
export default function errorHandler(err, req, res, next) {
  // Express bazen next(404) gibi sayısal hata alabilir
  let candidate =
    (typeof err === 'number' ? err : (err?.status ?? err?.statusCode)) ?? 500;

  let status = Number(candidate);
  if (!Number.isInteger(status) || status < 100 || status > 599) status = 500;

  const payload = {
    message: err?.message || 'İşlem başarısız.',
  };

  // extra bilgiler development'ta faydalı
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err?.stack;
    if (err?.errors) payload.errors = err.errors; // express-validator vs.
  }

  if (res.headersSent) return next(err);
  res.status(status).json(payload);
}
