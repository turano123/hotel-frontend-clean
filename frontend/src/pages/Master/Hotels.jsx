// src/pages/Master/Hotels.jsx
import React, { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import api from "../../api/axios";

const formatTRY = (n) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

export default function MasterHotels() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit] = useState(12); // backend limit <=100
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // _id | null

  const emptyForm = {
    code: "",
    name: "",
    city: "",
    adminEmail: "",
    adminPassword: "",
    currency: "TRY",
    timezone: "Europe/Istanbul",
    active: true,
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: q || "", // backend "search" bekliyor
      }).toString();
      const { data } = await api.get(`/hotels?${params}`);
      // backend { items, total, pages } döner
      setItems(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []);
      setTotal(Number.isFinite(data?.total) ? data.total : (data?.items?.length ?? 0));
      setPages(Number.isFinite(data?.pages) ? data.pages : 1);
    } catch (e) {
      setError(e?.response?.data?.message || "Oteller alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (h) => {
    setEditing(h._id);
    setForm({
      code: h.code || "",
      name: h.name || "",
      city: h.city || "",
      adminEmail: h.adminEmail || "",
      adminPassword: "", // boş bırakılırsa değişmez
      currency: h.currency || "TRY",
      timezone: h.timezone || "Europe/Istanbul",
      active: h.active !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        code: (form.code || "").trim().toUpperCase(),
        name: (form.name || "").trim(),
        city: (form.city || "").trim(),
        currency: form.currency || "TRY",
        timezone: form.timezone || "Europe/Istanbul",
        active: !!form.active,
        adminEmail: (form.adminEmail || "").trim(),
        adminPassword: form.adminPassword || "",
      };

      if (!payload.code || !payload.name) {
        return setError("Kod ve ad zorunlu.");
      }
      if (!editing && !payload.adminPassword) {
        return setError("Yeni otel için bir başlangıç şifresi gerekli.");
      }
      // düzenlemede şifre boşsa gönderme (değiştirme)
      if (editing && !payload.adminPassword) delete payload.adminPassword;

      if (editing) {
        await api.put(`/hotels/${editing}`, payload);
      } else {
        await api.post("/hotels", payload);
      }

      setForm(emptyForm);
      setEditing(null);
      // listeyi başa al
      setPage(1);
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.message || "Otel kaydedilemedi.");
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`${h.name} (${h.code}) silinsin mi?`)) return;
    try {
      await api.delete(`/hotels/${h._id}`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || "Silinemedi");
    }
  };

  const toggleActive = async (h) => {
    try {
      await api.put(`/hotels/${h._id}`, { active: !h.active });
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || "Durum değiştirilemedi");
    }
  };

  // Master -> Hotel impersonate
  const impersonate = async (h) => {
    if (!window.confirm(`${h.name} için yönetici olarak panele girmek istiyor musun?`)) return;
    try {
      // Backend rotası: POST /hotels/:id/impersonate
      const { data } = await api.post(`/hotels/${h._id}/impersonate`);
      const token = data?.token || data?.accessToken;
      if (!token) throw new Error("Token alınamadı");
      localStorage.setItem("token", token);
      localStorage.setItem("role", "HOTEL_ADMIN");
      localStorage.setItem("hotelId", String(h._id));
      window.location.href = "/";
    } catch (e) {
      alert(e?.response?.data?.message || "İmpersonate başarısız.");
    }
  };

  const filtered = useMemo(() => items, [items]);

  return (
    <div>
      <Header title="Oteller" subtitle="Portföy yönetimi • Yeni otel ekleme • İmpersonate • Aktif/Pasif" />

      {/* Form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          {editing ? "Otel Düzenle" : "Yeni Otel"}
        </div>

        {error && (
          <div
            className="card"
            style={{
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.35)",
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}

        <form className="form-grid" onSubmit={save}>
          <label className="field">
            <span className="field-label">Kod</span>
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Ad</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Şehir</span>
            <input
              className="input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>

          <label className="field">
            <span className="field-label">Admin E-posta</span>
            <input
              className="input"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              required={!editing}
            />
          </label>

          <label className="field">
            <span className="field-label">
              Admin Şifre{" "}
              {editing ? <span className="muted">(değiştirmek istemezsen boş bırak)</span> : null}
            </span>
            <input
              className="input"
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              placeholder={editing ? "(opsiyonel)" : ""}
            />
          </label>

          <label className="field">
            <span className="field-label">Para Birimi</span>
            <select
              className="select"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="TRY">TRY</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Zaman Dilimi</span>
            <select
              className="select"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              <option value="Europe/Istanbul">Europe/Istanbul</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="UTC">UTC</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Durum</span>
            <select
              className="select"
              value={form.active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
            >
              <option value="1">Aktif</option>
              <option value="0">Pasif</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" type="submit">
              {editing ? "Güncelle" : "Ekle"}
            </button>
            {editing && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Vazgeç
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Liste / arama */}
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          Oteller
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="input"
            placeholder="Ara: ad, kod, şehir…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
          />
          <button className="btn" onClick={() => (setPage(1), load())}>
            Ara
          </button>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn" onClick={startCreate}>
              + Yeni
            </button>
          </div>
        </div>

        {loading ? (
          "Yükleniyor…"
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Ad</th>
                  <th>Şehir</th>
                  <th>Durum</th>
                  <th>MTD Gelir</th>
                  <th style={{ width: 280 }}>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h._id}>
                    <td>{h.code}</td>
                    <td>{h.name}</td>
                    <td>{h.city || "—"}</td>
                    <td>{h.active !== false ? "Aktif" : "Pasif"}</td>
                    <td>{formatTRY(h.mtdRevenue || 0)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => startEdit(h)}>
                          Düzenle
                        </button>
                        <button className="btn" onClick={() => toggleActive(h)}>
                          {h.active !== false ? "Pasifleştir" : "Aktifleştir"}
                        </button>
                        <button className="btn" onClick={() => impersonate(h)}>
                          Otel olarak gir
                        </button>
                        <button className="btn danger" onClick={() => remove(h)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td className="muted" colSpan={6}>
                      Kayıt bulunamadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* sayfalama */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>
            Toplam {total} kayıt • Sayfa {page}/{pages}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Önceki
            </button>
            <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
