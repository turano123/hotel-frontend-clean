import axios from "axios";

/* -------------------------------------------------------
   API URL çözümü (fallback öncelik sırası)
   -------------------------------------------------------
   1) .env → VITE_API_URL
   2) window.__API_URL__ (runtime override)
   3) Dev (localhost:5173) → backend 5000
   4) Prod → aynı origin üzerinden /api
------------------------------------------------------- */
const fromEnv = import.meta?.env?.VITE_API_URL || "";
const fromWindow = typeof window !== "undefined" ? window.__API_URL__ : "";
const isDev = typeof window !== "undefined" && window.location.port === "5173";

const API_URL =
  fromEnv ||
  fromWindow ||
  (isDev ? "http://localhost:5000/api" : "/api");

/* -------------------------------------------------------
   Basit toast pub/sub
------------------------------------------------------- */
let toastCb = null;
export function bindToast(cb) {
  toastCb = cb;
}
function toast(msg, type = "info") {
  if (toastCb) toastCb({ msg, type });
}

/* -------------------------------------------------------
   Axios instance
------------------------------------------------------- */
const api = axios.create({
  baseURL: API_URL,
  withCredentials: false,
  timeout: 20000, // 20s daha güvenli
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

/* -------------------------------------------------------
   Request Interceptor → Token ekle
------------------------------------------------------- */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* -------------------------------------------------------
   Response Interceptor → Hata yönetimi
------------------------------------------------------- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!err.response) {
      toast("Sunucuya ulaşılamadı. İnternet/CORS kontrol edin.", "error");
      return Promise.reject(err);
    }

    const { status, data, statusText } = err.response;

    // Hata mesajını çıkar
    let message = "";
    try {
      if (data instanceof Blob) {
        const text = await data.text();
        message = JSON.parse(text)?.message || text;
      } else if (typeof data === "string") {
        message = data;
      } else {
        message = data?.message || statusText || "Hata";
      }
    } catch {
      message = "Hata";
    }

    // Validation hataları
    if (Array.isArray(data?.errors) && data.errors.length) {
      const first = data.errors[0];
      toast(
        `Doğrulama hatası: ${(first?.path ? `${first.path}: ` : "") + (first?.msg || first?.message || "")}`,
        "error"
      );
      return Promise.reject(err);
    }

    // Status bazlı aksiyonlar
    const statusMap = {
      401: () => {
        toast("Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "warn");
        localStorage.clear();
        setTimeout(() => (window.location.href = "/login"), 400);
      },
      403: () => toast("Bu işlem için yetkiniz yok.", "error"),
      409: () => toast(message || "Çakışma/uygunsuzluk hatası.", "error"),
      400: () => toast(message || "Geçersiz istek.", "error"),
      422: () => toast(message || "Geçersiz istek.", "error"),
    };

    if (statusMap[status]) statusMap[status]();
    else toast(message || "Beklenmeyen hata.", "error");

    return Promise.reject(err);
  }
);

export default api;
