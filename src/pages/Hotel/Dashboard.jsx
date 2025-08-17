import React, { useEffect, useMemo, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'

/* ---------------- Utils ---------------- */
const iso = (d) => new Date(d).toISOString().slice(0,10)
const todayISO = () => iso(new Date())
const startOfMonthISO = () => {
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return iso(d)
}
const daysBetween = (a,b) => {
  const A = new Date(a); A.setHours(0,0,0,0)
  const B = new Date(b); B.setHours(0,0,0,0)
  return Math.max(0, Math.round((B - A) / 86400000))
}
const nightsBetween = (a,b) => Math.max(1, daysBetween(a,b)) // min 1 gece
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate()+n); return iso(d) }
const fmtDate = (d) => new Date(d).toLocaleDateString('tr-TR')
const TRYfmt = (n) =>
  new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0))

// Tarih aralığındaki günleri dizi olarak döndür
const eachDay = (startISO, endISOExclusive) => {
  const out=[], N=daysBetween(startISO, endISOExclusive)
  for(let i=0;i<N;i++) out.push(addDays(startISO,i))
  return out
}

// Overlap geceleri (exclusive end) bul
const overlapNights = (ci,co,rs,reExcl) => {
  const s = new Date(rs); const e = new Date(reExcl)
  const a = new Date(ci); const b = new Date(co)
  const start = new Date(Math.max(a.getTime(), s.getTime()))
  const end   = new Date(Math.min(b.getTime(), e.getTime()))
  if (end <= start) return 0
  return Math.round((end - start)/86400000)
}

// Güvenli fetchAll (limit=100, backend doğrulamasına uygun)
async function fetchAll(urlBase) {
  let out = []; let p = 1; const l = 100
  // dönen total’e göre sayfaları dolaş
  // urlBase ...&page=&limit= eklenecek şekilde gelmeli
  // ör: /reservations?status=confirmed&start=YYYY-MM-DD&end=YYYY-MM-DD
  // not: sort backend’e bırakıldı
  for(;;) {
    const { data } = await api.get(`${urlBase}&page=${p}&limit=${l}`)
    out = out.concat(data.items || [])
    if (out.length >= (data.total || out.length)) break
    p++
  }
  return out
}

/* --------------- Minicharts (SVG) --------------- */
function LineSpark({ points=[], height=80, stroke='rgba(94,234,212,.95)' }) {
  const width = Math.max(220, points.length*40)
  const max = Math.max(1, ...points)
  const step = width/(Math.max(1,points.length-1))
  const d = points.map((v,i)=>{
    const x = i*step
    const y = height - (v/max)*height
    return `${i===0?'M':'L'}${x},${y}`
  }).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{display:'block'}}>
      <path d={d||''} fill="none" stroke={stroke} strokeWidth="2.5" />
      {points.map((v,i)=>{
        const x=i*step, y=height-(v/max)*height
        return <circle key={i} cx={x} cy={y} r="2.8" fill={stroke}/>
      })}
    </svg>
  )
}

function Donut({ slices=[], size=180 }) {
  const total = slices.reduce((a,s)=>a+s.value,0) || 1
  const r = size/2 - 10, cx=size/2, cy=size/2
  let acc = 0
  const colors = [
    '#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#22d3ee','#fb7185','#f59e0b'
  ]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="18"/>
      {slices.map((s,idx)=>{
        const angle = (s.value/total)*Math.PI*2
        const x1 = cx + r*Math.cos(acc)
        const y1 = cy + r*Math.sin(acc)
        acc += angle
        const x2 = cx + r*Math.cos(acc)
        const y2 = cy + r*Math.sin(acc)
        const large = angle>Math.PI ? 1 : 0
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
        return <path key={idx} d={path} stroke={colors[idx%colors.length]} strokeWidth="18" fill="none" />
      })}
      <circle cx={cx} cy={cy} r={r-30} fill="rgba(255,255,255,.02)" />
    </svg>
  )
}

/* ------------------- Dashboard ------------------- */
export default function HotelDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kpi, setKpi] = useState({
    inhouse:0, arrivals:0, departures:0, mtdRevenue:0, mtdADR:0, mtdRevPAR:0, occToday:0, totalRooms:0
  })
  const [weekSeries, setWeekSeries] = useState([])  // son 7 gün gelir
  const [channels, setChannels] = useState([])      // 30g dağılım
  const [arrivalsToday, setArrivalsToday] = useState([])
  const [departuresToday, setDeparturesToday] = useState([])

  const today = todayISO()
  const mtdStart = startOfMonthISO()
  const weekStart = addDays(today, -6) // son 7 gün
  const last30 = addDays(today, -30)

  // Önce varsa /dashboard/overview dene; yoksa ayrıntılı hesapla
  useEffect(()=>{
    let mounted = true
    async function run(){
      setLoading(true); setError('')
      try {
        // 1) Oda sayısı
        const roomTypesRes = await api.get('/rooms/types')
        const totalRooms = (roomTypesRes.data||[]).reduce((a,x)=>a+Number(x.totalRooms||0),0)

        // 2) Eğer hazır özet varsa kullan
        try {
          const { data } = await api.get(`/dashboard/overview?from=${mtdStart}&to=${today}`)
          if (mounted && data && data.kpi) {
            setKpi({
              inhouse: data.kpi.inhouse||0,
              arrivals: data.kpi.arrivals||0,
              departures: data.kpi.departures||0,
              mtdRevenue: data.kpi.mtdRevenue||0,
              mtdADR: data.kpi.mtdADR||0,
              mtdRevPAR: data.kpi.mtdRevPAR||0,
              occToday: data.kpi.occToday||0,
              totalRooms,
            })
            setWeekSeries(data.weekSeries||[])
            setChannels(data.channels||[])
            setArrivalsToday(data.arrivalsToday||[])
            setDeparturesToday(data.departuresToday||[])
            setLoading(false)
            return
          }
        } catch { /* yoksa hesaplamaya düş */ }

        // 3) MANUEL HESAP
        const base = '/reservations?status=confirmed'
        const [resMTD, resWeek, resL30, resTodayArr, resTodayDep, resTodayIn] = await Promise.all([
          fetchAll(`${base}&start=${mtdStart}&end=${today}`),
          fetchAll(`${base}&start=${weekStart}&end=${today}`),
          fetchAll(`${base}&start=${last30}&end=${today}`),
          fetchAll(`${base}&start=${today}&end=${today}`), // overlap filtresi -> aynı gün geceleyecekler
          fetchAll(`${base}&start=${today}&end=${today}`), // depart/giriş için tabloyu aynı listeden süzeriz
          fetchAll(`${base}&start=${today}&end=${addDays(today,1)}`), // inhouse hesap
        ])

        // In-house (bugün oda adedi toplamı)
        const inhouse = resTodayIn.reduce((a,r)=>{
          const inside = (new Date(r.checkIn) <= new Date(today)) && (new Date(r.checkOut) > new Date(today))
          return a + (inside ? Number(r.rooms||1) : 0)
        },0)

        // Bugün giriş/çıkış sayıları + listeler
        const arrivalsList   = resTodayArr.filter(r => iso(r.checkIn)===today)
        const departuresList = resTodayDep.filter(r => iso(r.checkOut)===today)
        const arrivals = arrivalsList.reduce((a,r)=>a+Number(r.rooms||1),0)
        const departures = departuresList.reduce((a,r)=>a+Number(r.rooms||1),0)

        // MTD gelir/ADR/RevPAR (pro-rata: toplam fiyat gece sayısına bölünür, aralıkta düşen kadar alınır)
        const daysSoFar = daysBetween(mtdStart, addDays(today,1))
        const roomNightsSold = resMTD.reduce((a,r)=>{
          const totalN = nightsBetween(r.checkIn, r.checkOut)
          const overlapN = overlapNights(r.checkIn, r.checkOut, mtdStart, addDays(today,1))
          return a + (Number(r.rooms||1) * overlapN)
        },0)
        const mtdRevenue = resMTD.reduce((a,r)=>{
          const totalN = nightsBetween(r.checkIn, r.checkOut)
          const overlapN = overlapNights(r.checkIn, r.checkOut, mtdStart, addDays(today,1))
          const share = (Number(r.totalPrice||0) * (overlapN/totalN))
          return a + share
        },0)
        const mtdADR = roomNightsSold>0 ? (mtdRevenue / roomNightsSold) : 0
        const mtdRevPAR = (totalRooms>0 && daysSoFar>0) ? (mtdRevenue / (totalRooms * daysSoFar)) : 0

        // Bugün doluluk %
        const occToday = (totalRooms>0)
          ? Math.min(100, Math.round((inhouse/totalRooms)*100))
          : 0

        // Son 7 gün günlük gelir (pro-rata, gece başına)
        const weekDays = eachDay(weekStart, addDays(today,1))
        const series = weekDays.map(d=>{
          const next = addDays(d,1)
          const dayRevenue = resWeek.reduce((a,r)=>{
            const ov = overlapNights(r.checkIn, r.checkOut, d, next)
            if (ov<=0) return a
            const perNight = Number(r.totalPrice||0) / nightsBetween(r.checkIn, r.checkOut)
            return a + (perNight * ov)
          },0)
          return Math.round(dayRevenue)
        })

        // 30 gün kanal dağılımı
        const chanMap = {}
        resL30.forEach(r => {
          const c = r.channel || 'other'
          chanMap[c] = (chanMap[c]||0) + 1
        })
        const chanSlices = Object.entries(chanMap).map(([k,v])=>({label:k, value:v}))
          .sort((a,b)=>b.value-a.value).slice(0,8)

        if (!mounted) return
        setKpi({ inhouse, arrivals, departures, mtdRevenue, mtdADR, mtdRevPAR, occToday, totalRooms })
        setWeekSeries(series)
        setChannels(chanSlices)
        setArrivalsToday(arrivalsList.slice(0,6))
        setDeparturesToday(departuresList.slice(0,6))
        setLoading(false)
      } catch (e) {
        if (!mounted) return
        setError(e?.response?.data?.message || 'Bir şeyler ters gitti.')
        setLoading(false)
      }
    }
    run()
    return ()=>{ mounted=false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kpiCards = useMemo(()=>[
    { label:'İçeride (in-house)', value:kpi.inhouse },
    { label:'Bugün Giriş', value:kpi.arrivals },
    { label:'Bugün Çıkış', value:kpi.departures },
    { label:'MTD Gelir', value: TRYfmt(kpi.mtdRevenue) },
    { label:'MTD ADR', value: TRYfmt(kpi.mtdADR) },
    { label:'MTD RevPAR', value: TRYfmt(kpi.mtdRevPAR) },
    { label:'Doluluk % (bugün)', value: `${kpi.occToday}%` },
    { label:'Toplam Oda', value: kpi.totalRooms }
  ], [kpi])

  return (
    <div>
      <Header
        title="Otel Dashboard"
        subtitle="Bugün • Bu Hafta • MTD — gelir, doluluk, ADR/RevPAR, kanal dağılımı ve giriş-çıkış özetleri"
      />

      {/* KPIs */}
      <div className="kpis" style={{gridTemplateColumns:'repeat(4, minmax(0,1fr))'}}>
        {kpiCards.map((c,i)=>(
          <div key={i} className="card">
            <div className="label">{c.label}</div>
            <div className="value">{loading ? '—' : c.value}</div>
          </div>
        ))}
      </div>

      {/* Middle row */}
      <div style={{display:'grid', gridTemplateColumns:'1.6fr .8fr', gap:16, marginTop:16, alignItems:'stretch'}}>
        {/* Weekly Revenue */}
        <div className="card" style={{minHeight:220}}>
          <div className="label" style={{marginBottom:6}}>Bu Hafta Günlük Gelir</div>
          {loading ? (
            <div className="muted">Yükleniyor…</div>
          ) : (
            <div>
              <LineSpark points={weekSeries} />
              <div style={{display:'flex',justifyContent:'space-between',marginTop:6, color:'var(--muted)', fontSize:12}}>
                {eachDay(addDays(todayISO(),-6), addDays(todayISO(),1)).map((d,i)=>(
                  <span key={i} style={{width:28, textAlign:'center'}}>{new Date(d).toLocaleDateString('tr-TR',{weekday:'short'})}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Channel Distribution */}
        <div className="card" style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'center', minHeight:220}}>
          <div className="label" style={{gridColumn:'1 / -1'}}>Son 30 Gün Kanal Dağılımı</div>
          {loading ? (
            <div className="muted" style={{gridColumn:'1 / -1'}}>Yükleniyor…</div>
          ) : (
            <>
              <Donut slices={channels}/>
              <div>
                {(channels.length ? channels : [{label:'Kayıt yok', value:1}]).map((s,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span className="muted">{s.label}</span>
                    <b>{s.value}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Arrivals / Departures */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16}}>
        <div className="card">
          <div className="label" style={{marginBottom:8}}>Bugün Girişler</div>
          <table className="table">
            <thead>
              <tr><th>Misafir</th><th>Gece</th><th>Kanal</th><th>Giriş</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="muted" colSpan={4}>Yükleniyor…</td></tr>
              ) : arrivalsToday.length ? arrivalsToday.map(r=>(
                <tr key={r._id}>
                  <td>{r.guest?.name || r.guestName}</td>
                  <td>{nightsBetween(r.checkIn, r.checkOut)}</td>
                  <td className="muted">{r.channel||'—'}</td>
                  <td className="muted">{fmtDate(r.checkIn)}</td>
                </tr>
              )) : <tr><td className="muted" colSpan={4}>Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="label" style={{marginBottom:8}}>Bugün Çıkışlar</div>
          <table className="table">
            <thead>
              <tr><th>Misafir</th><th>Gece</th><th>Kanal</th><th>Çıkış</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="muted" colSpan={4}>Yükleniyor…</td></tr>
              ) : departuresToday.length ? departuresToday.map(r=>(
                <tr key={r._id}>
                  <td>{r.guest?.name || r.guestName}</td>
                  <td>{nightsBetween(r.checkIn, r.checkOut)}</td>
                  <td className="muted">{r.channel||'—'}</td>
                  <td className="muted">{fmtDate(r.checkOut)}</td>
                </tr>
              )) : <tr><td className="muted" colSpan={4}>Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error */}
      {!!error && (
        <div className="card" style={{marginTop:16, borderColor:'rgba(239,68,68,.35)', background:'rgba(239,68,68,.06)'}}>
          <div style={{fontWeight:700, marginBottom:6}}>Uyarı</div>
          {error}
        </div>
      )}
    </div>
  )
}
