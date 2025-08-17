# Hotel & Channel Management – Temel Yapı

İki ayrı proje ile gelir-gider, rezervasyon ve kanal yönetimi:
- `backend/` – Express + MongoDB API (JWT, çoklu kullanıcı, rol tabanlı erişim)
- `frontend/` – React + Vite arayüzü (Master Admin & Otel tarafı)

## Kurulum
Her klasörde bağımlılıkları kurun:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Backend
1. `.env.example` dosyasını `.env` olarak kopyalayın ve `MONGODB_URI` ile `JWT_SECRET` değerlerini girin.
2. Seed verileri yükleyin:
```bash
npm run seed
```
3. Başlatın:
```bash
npm start
```
API: http://localhost:5000

### Frontend
```bash
npm start
```
Arayüz: http://localhost:5173

### Demo Girişler
- Master: `master@demo.local` / `Master123!`
- Otel 1 Admin: `hotel1@demo.local` / `Demo123!`

> Not: Kanal bağlantıları (Airbnb/Booking/Etstur) demo adapter ile stub şeklindedir. Gerçek API anahtarları eklendikten sonra adapter katmanında geliştirme kolaydır.