import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import Header from "../../components/Header";

/* ---------- yardımcılar ---------- */
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const todayISO = () => iso(new Date());
const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const nfTRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});
const safeNum = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

/* gelen veri {items:[]} veya [] olabilir → her durumda diziye çevir */
const toArray = (x) =>
  Array.isArray(x) ? x : (Array.isArray(x?.items) ? x.items : []);

/* localStorage mini hook */
function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(v));
  }, [key, v]);
  return [v, setV];
}

/* ---------- minik çizim bileşenleri (bağımlılıksız) ---------- */
function SparkLine({ points = [], height = 48, stroke = "#22c55e" }) {
  const width = Math.max(points.length * 20, 160);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const pad = 6;

  const path = points
    .map((v, i) => {
      const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
      const y =
        pad +
        (1 - (safeNum(v) - min) / Math.max(max - min || 1, 1)) *
          (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="8"
        fill="rgba(255,255,255,.03)"
        stroke="rgba(255,255,255,.06)"
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function BarList({ items = [], valueKey = "value", labelKey = "label", total: t }) {
  const computed = items.reduce((a, b) => a + safeNum(b[valueKey]), 0);
  const total = (t ?? computed) || 1; // karışık operatörler için parantez!
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it, i) => {
        const v = safeNum(it[valueKey]);
        const pct = Math.round((v / total) * 100);
        return (
          <div key={i}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span className="muted">{it[labelKey]}</span>
              <span>
                <b>{pct}%</b> &nbsp;
                <span className="muted">({nfTRY.format(v)})</span>
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,.06)",
                borderRadius: 999,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--brand), var(--brand-2))",
                }}
              />
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div className="muted">Kayıt yok</div>}
    </div>
  );
}

/* ---------- Sayfa ---------- */
export default function MasterDashboard() {
  /* filtreler */
  const [filters, setFilters] = useLocal("master.filters", {
    start: addDays(todayISO(), -6),
    end: todayISO(),
    hotelId: "",
  });

  /* veri */
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [hotels, setHotels] = useState([]); // daima dizi

  // dashboard payload
  const [data, setData] = useState({
    totals: { hotels: 0, rooms: 0 },
    today: { inhouse: 0, arrivals: 0, departures: 0, occupancyPct: 0 },
    mtd: { revenue: 0, adr: 0, revpar: 0 },
    weeklyRevenue: [],      // [{date,total}]
    channelLast30: [],      // [{label,value}]
    topHotelsByRevenue: [], // [{label,value}]
    todayArrivals: [],
    todayDepartures: [],
  });

  /* quick picker */
  const setToday = () =>
    setFilters((f) => ({ ...f, start: todayISO(), end: todayISO() }));
  const setThisWeek = () =>
    setFilters((f) => ({ ...f, start: addDays(todayISO(), -6), end: todayISO() }));
  const setThisMonth = () => {
    const d = new Date();
    const start = iso(new Date(d.getFullYear(), d.getMonth(), 1));
    setFilters((f) => ({ ...f, start, end: todayISO() }));
  };

  /* load hotels + data */
  useEffect(() => {
    api
      .get("/hotels?page=1&limit=1000")        // backend her durumda {items:[]} döndürür
      .then((res) => setHotels(toArray(res.data)))
      .catch(() => setHotels([]));
  }, []);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const p = new URLSearchParams();
      p.set("start", filters.start);
      p.set("end", filters.end);
      if (filters.hotelId) p.set("hotelId", filters.hotelId);

      const res = await api.get(`/dashboard/master?${p.toString()}`);
      const d = res.data || {};

      setData({
        totals: {
          hotels: safeNum(d?.totals?.hotels),
          rooms: safeNum(d?.totals?.rooms),
        },
        today: {
          inhouse: safeNum(d?.today?.inhouse),
          arrivals: safeNum(d?.today?.arrivals),
          departures: safeNum(d?.today?.departures),
          occupancyPct: safeNum(d?.today?.occupancyPct),
        },
        mtd: {
          revenue: safeNum(d?.mtd?.revenue),
          adr: safeNum(d?.mtd?.adr),
          revpar: safeNum(d?.mtd?.revpar),
        },
        weeklyRevenue:
          d?.weeklyRevenue?.map?.((x) => ({
            date: x.date || new Date(),
            total: safeNum(x.total),
          })) || [],
        channelLast30:
          d?.channelLast30?.map?.((x) => ({
            label: x.label || x.channel || "—",
            value: safeNum(x.value ?? x.count),
          })) || [],
        topHotelsByRevenue:
          d?.topHotelsByRevenue?.map?.((x) => ({
            label: x.label || x.name || x.hotel || "—",
            value: safeNum(x.value ?? x.total),
          })) || [],
        todayArrivals:
          d?.todayArrivals?.map?.((r) => ({
            guest: r.guest?.name || r.guestName || "Misafir",
            nights: r.nights ?? 0,
            channel: r.channel || "-",
            checkIn: r.checkIn || "",
          })) || [],
        todayDepartures:
          d?.todayDepartures?.map?.((r) => ({
            guest: r.guest?.name || r.guestName || "Misafir",
            nights: r.nights ?? 0,
            channel: r.channel || "-",
            checkOut: r.checkOut || "",
          })) || [],
      });
    } catch (e) {
      setErr(
        e?.response?.data?.message ||
          e?.message ||
          "Veri alınamadı. Lütfen tekrar deneyin."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.start, filters.end, filters.hotelId]);

  /* sparkline verisi */
  const weeklyPoints = useMemo(
    () => data.weeklyRevenue.map((x) => x.total),
    [data.weeklyRevenue]
  );

  /* csv export (bugüne ait giriş/çıkışlar) */
  const exportCsv = () => {
    const rows = [
      ["Tip", "Misafir", "Gece", "Kanal", "Tarih"],
      ...data.todayArrivals.map((r) => [
        "Giriş",
        r.guest,
        r.nights,
        r.channel,
        iso(r.checkIn || new Date()),
      ]),
      ...data.todayDepartures.map((r) => [
        "Çıkış",
        r.guest,
        r.nights,
        r.channel,
        iso(r.checkOut || new Date()),
      ]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const hotelList = toArray(hotels);

  return (
    <div>
      <Header
        title="Master Dashboard"
        subtitle="Tüm otellerin özet metrikleri • kanal dağılımı • en iyi oteller • bugünün hareketleri"
      />

      {/* filtre bar */}
      <div
        className="card"
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}
      >
        <button className="btn" onClick={setToday}>Bugün</button>
        <button className="btn" onClick={setThisWeek}>Bu Hafta</button>
        <button className="btn" onClick={setThisMonth}>Bu Ay</button>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            className="input"
            type="date"
            value={filters.start}
            onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
          />
          <input
            className="input"
            type="date"
            value={filters.end}
            onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
          />
          <select
            className="select"
            value={filters.hotelId}
            onChange={(e) => setFilters((f) => ({ ...f, hotelId: e.target.value }))}
          >
            <option value="">Otel (hepsi)</option>
            {hotelList.map((h) => (
              <option key={h._id} value={h._id}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
          <button className="btn" onClick={exportCsv}>CSV</button>
        </div>
      </div>

      {/* KPI'lar */}
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="label">Toplam Otel</div>
          <div className="value">{data.totals.hotels}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Toplam oda: <b>{data.totals.rooms}</b>
          </div>
        </div>

        <div className="card">
          <div className="label">Bugün İçeride (In-house)</div>
          <div className="value">{data.today.inhouse}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Doluluk: <b>{Math.round(data.today.occupancyPct)}%</b>
          </div>
        </div>

        <div className="card">
          <div className="label">MTD Gelir</div>
          <div className="value">{nfTRY.format(data.mtd.revenue)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            ADR: <b>{nfTRY.format(data.mtd.adr)}</b> • RevPAR:{" "}
            <b>{nfTRY.format(data.mtd.revpar)}</b>
          </div>
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <div className="label">Bu Hafta Günlük Gelir</div>
          <SparkLine points={weeklyPoints} />
        </div>
      </div>

      {/* orta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12, alignItems: "start" }}>
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Son 30 Gün Kanal Dağılımı
          </div>
          <BarList items={data.channelLast30} />
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Gelire Göre En İyi Oteller
          </div>
          <BarList items={data.topHotelsByRevenue} />
        </div>
      </div>

      {/* bugün giriş/çıkış listeleri */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "start",
          marginTop: 12,
        }}
      >
        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Bugün Girişler
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Misafir</th>
                <th>Gece</th>
                <th>Kanal</th>
                <th>Giriş</th>
              </tr>
            </thead>
            <tbody>
              {data.todayArrivals.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.guest}</td>
                  <td>{r.nights}</td>
                  <td>{r.channel}</td>
                  <td>{r.checkIn ? new Date(r.checkIn).toLocaleDateString("tr-TR") : "-"}</td>
                </tr>
              ))}
              {data.todayArrivals.length === 0 && (
                <tr>
                  <td colSpan="4" className="muted">
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Bugün Çıkışlar
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Misafir</th>
                <th>Gece</th>
                <th>Kanal</th>
                <th>Çıkış</th>
              </tr>
            </thead>
            <tbody>
              {data.todayDepartures.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.guest}</td>
                  <td>{r.nights}</td>
                  <td>{r.channel}</td>
                  <td>{r.checkOut ? new Date(r.checkOut).toLocaleDateString("tr-TR") : "-"}</td>
                </tr>
              ))}
              {data.todayDepartures.length === 0 && (
                <tr>
                  <td colSpan="4" className="muted">
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* hata bandı */}
      {err && (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderColor: "rgba(239,68,68,.5)",
            boxShadow: "0 0 0 1px rgba(239,68,68,.25) inset",
          }}
        >
          <div style={{ color: "#fecaca" }}>Hata: {err}</div>
        </div>
      )}

      {/* yükleniyor overlay'i */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.25)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div className="card">Yükleniyor…</div>
        </div>
      )}
    </div>
  );
}
