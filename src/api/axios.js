import axios from "axios";

/* -------------------------------------------------------
   API URL çözümü (sorunsuz fallsbacks)
   -------------------------------------------------------
   1) VITE_API_URL (.env)
   2) window.__API_URL__ (runtime override istersek)
   3) Dev: :5173 ise backend 5000’e gider
   4) Prod: aynı origin üzerinden /api
------------------------------------------------------- */
const fromEnv =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "";

const fromWindow =
  typeof window !== "undefined" && window.__API_URL__
    ? window.__API_URL__
    : "";

const isDev5173 =
  typeof window !== "undefined" && window.location && window.location.port === "5173";

const API_URL = fromEnv || fromWindow || (isDev5173 ? "http://localhost:5000/api" : "/api");

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
  timeout: 15000,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

/* -------------------------------------------------------
   Request: Authorization taşı
------------------------------------------------------- */
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

/* -------------------------------------------------------
   Response: Hata yakalama (401/403/409/422/400/network)
------------------------------------------------------- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Network/CORS
    if (!err.response) {
      toast("Sunucuya ulaşılamadı. İnternet/CORS kontrol edin.", "error");
      return Promise.reject(err);
    }

    const { status, data, statusText } = err.response;

    // Blob JSON ise mesajı çözmeye çalış
    let message = "";
    try {
      if (data instanceof Blob) {
        const text = await data.text();
        try {
          const parsed = JSON.parse(text);
          message = parsed?.message || statusText || "Hata";
        } catch {
          message = text || statusText || "Hata";
        }
      } else if (typeof data === "string") {
        message = data;
      } else {
        message = data?.message || statusText || "Hata";
      }
    } catch {
      message = "Hata";
    }

    // express-validator tarzı validation detayları
    const valErrs = Array.isArray(data?.errors) ? data.errors : null;
    if (valErrs && valErrs.length) {
      const first = valErrs[0];
      const det =
        (first?.path ? `${first.path}: ` : "") + (first?.msg || first?.message || "");
      toast(`Doğrulama hatası: ${det || message}`, "error");
      return Promise.reject(err);
    }

    // Status bazlı aksiyonlar
    if (status === 401) {
      toast("Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "warn");
      try { localStorage.clear(); } catch {}
      setTimeout(() => (window.location.href = "/login"), 400);
      return Promise.reject(err);
    }

    if (status === 403) {
      toast("Bu işlem için yetkiniz yok.", "error");
      return Promise.reject(err);
    }

    if (status === 409) {
      toast(message || "Çakışma/uygunsuzluk hatası.", "error");
      return Promise.reject(err);
    }

    if (status === 422 || status === 400) {
      toast(message || "Geçersiz istek.", "error");
      return Promise.reject(err);
    }

    // Diğer durumlar
    toast(message || "Beklenmeyen hata.", "error");
    return Promise.reject(err);
  }
);

export default api;
