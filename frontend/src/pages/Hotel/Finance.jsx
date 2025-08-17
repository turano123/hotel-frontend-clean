// frontend/src/pages/Hotel/Finance.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'
import Drawer from '../../components/Drawer.jsx'
import { jsPDF } from 'jspdf'

/* ---------- sabitler ---------- */
const TYPES = [
  { value: 'income', label: 'Gelir' },
  { value: 'expense', label: 'Gider' },
]
const METHODS = [
  { value: 'cash',     label: 'Nakit' },
  { value: 'pos',      label: 'POS' },
  { value: 'transfer', label: 'Havale/EFT' },
  { value: 'online',   label: 'Online' },
]
const CURRENCIES = ['TRY', 'USD', 'EUR']
const INCOME_CATS  = ['Rezervasyon Ödemesi','Ekstra Harcama','Restoran/Bar','Mini Bar','Spa','Diğer Gelir']
const EXPENSE_CATS = ['Maaş/SGK','Tedarikçi','Elektrik/Su/Doğalgaz','Vergi/Harç','Bakım-Onarım','Komisyon','İade/İptal','Diğer Gider']
const catsForType = (t) => (t === 'expense' ? EXPENSE_CATS : INCOME_CATS)

/* ---------- id helper (tek kaynak) ---------- */
const getId = (x) => (x && (x._id || x.id)) || ''

/* ---------- tarih / format helpers ---------- */
const iso      = (d) => new Date(d).toISOString().slice(0,10)
const todayISO = () => iso(new Date())
const startOfWeekISO = () => { const d=new Date(); const day=d.getDay()||7; d.setDate(d.getDate()-day+1); return iso(d) }
const startOfMonthISO = () => { const d=new Date(); d.setDate(1); return iso(d) }
const formatTRY = (n) => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n||0))

/* ---------- localStorage helper ---------- */
const useLocal = (key, initial) => {
  const [v,setV] = useState(()=>{ try{const s=localStorage.getItem(key); return s?JSON.parse(s):initial }catch{return initial}})
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)) }, [key,v])
  return [v,setV]
}

/* ---------- küçük sparkline ---------- */
function Sparkline({ data=[], height=40 }) {
  if (!data.length) return <div className="muted">Veri yok</div>
  const w = Math.max(120, data.length*14)
  const max = Math.max(...data,1), min = Math.min(...data,0)
  const range = max - min || 1
  const pts = data.map((v,i)=>{
    const x = (i/(data.length-1))*(w-4)+2
    const y = height-4 - ((v-min)/range)*(height-8)
    return `${x},${y}`
  }).join(' ')
  return <svg width={w} height={height}><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85"/></svg>
}

/* ---------- tekrar sihirbazı için ---------- */
const addDays = (d, n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x }
const addMonths = (d, n) => { const x=new Date(d); x.setMonth(x.getMonth()+n); return x }
function expandRecurrence({ startDate, frequency, count }) {
  const dates = []
  let cur = new Date(startDate)
  for (let i=0;i<count;i++) {
    dates.push(iso(cur))
    if (frequency==='daily') cur = addDays(cur, 1)
    else if (frequency==='weekly') cur = addDays(cur, 7)
    else cur = addMonths(cur, 1)
  }
  return dates
}

/* ---------- Rezervasyon -> Finans eşlemesi ---------- */
const norm = (s='') => String(s||'').toLowerCase()
const mapMethod = (m) => {
  const x = norm(m)
  if (x.includes('nakit') || x.includes('cash')) return 'cash'
  if (x.includes('pos') || x.includes('card') || x.includes('kredi') || x.includes('kart')) return 'pos'
  if (x.includes('online') || x.includes('stripe') || x.includes('iyzico') || x.includes('virtual') || x.includes('pay')) return 'online'
  if (x.includes('havale') || x.includes('eft') || x.includes('transfer')) return 'transfer'
  return 'transfer'
}
const toUpper = (v, def='') => (v ? String(v).trim().toUpperCase() : def)

/* ====================================================== */

export default function Finance() {
  /* liste */
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useLocal('fin.page', 1)
  const [pages, setPages] = useState(1)
  const [limit] = useState(12)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ incomeTry: 0, expenseTry: 0, netTry: 0 })

  /* filtreler */
  const [filters, setFilters] = useLocal('fin.filters', {
    start: startOfMonthISO(), end: todayISO(), type:'', method:'', category:'', q:''
  })
  const [sort, setSort] = useLocal('fin.sort', { by:'date', dir:'desc' })

  /* form */
  const blank = {
    type:'expense', amount:'', method:'cash',
    currency:'TRY', fxRate:1, category: EXPENSE_CATS[EXPENSE_CATS.length-1],
    date: todayISO(), note:'',
    recurring: { enabled:false, frequency:'monthly', count:3 }
  }
  const [form, setForm] = useState(blank)

  /* seçim & drawer */
  const [selected, setSelected] = useState([]) // sadece id listesi
  const [edit, setEdit] = useState(null)
  const [drawer, setDrawer] = useState(false)

  /* Rezervasyon eşitleme seçenekleri */
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncOpts, setSyncOpts] = useLocal('fin.sync.opts', {
    includePayments: true,
    includePlannedBalance: true,
    onlyConfirmed: true
  })

  const debounce = useRef(null)

  /* nakit akışı serisi (TRY bazında) */
  const series = useMemo(()=>{
    const map = new Map()
    const from = new Date(filters.start||todayISO())
    const to   = new Date(filters.end||todayISO())
    for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)) map.set(iso(d), 0)
    items.forEach(e=>{
      const k = iso(e.date||e.createdAt||new Date())
      const v = Number(e.amountTry ?? ((e.amount||0)*(e.fxRate||1))) * (e.type==='income'?1:-1)
      map.set(k, (map.get(k)||0)+v)
    })
    return Array.from(map.values())
  }, [items, filters.start, filters.end])

  /* api: liste */
  const buildQuery = () => {
    const p = new URLSearchParams()
    p.set('page', page); p.set('limit', limit)
    if (filters.start) p.set('start', filters.start)
    if (filters.end) p.set('end', filters.end)
    if (filters.type) p.set('type', filters.type)
    if (filters.method) p.set('method', filters.method)
    if (filters.category) p.set('category', filters.category)
    if (filters.q) p.set('q', filters.q)
    return p.toString()
  }

  const load = async () => {
    setLoading(true)
    try {
      const qs = buildQuery()
      const { data } = await api.get(`/finance/entries?${qs}`)
      const sorted = [...(data.items||[])].sort((a,b)=>{
        const va = a[sort.by], vb = b[sort.by]
        const normV = (x) => sort.by==='date' ? new Date(x).getTime() : (typeof x==='string'?x.toLowerCase():Number(x||0))
        const fa = normV(va), fb = normV(vb)
        return sort.dir==='asc' ? (fa-fb) : (fb-fa)
      })
      setItems(sorted)
      setTotal(data.total || sorted.length)
      setPages(data.pages || 1)
      setSummary({
        incomeTry: Number(data?.summary?.incomeTry || 0),
        expenseTry: Number(data?.summary?.expenseTry || 0),
        netTry: Number(data?.summary?.netTry || 0),
      })
    } catch (e) {
      alert(e?.response?.data?.message || 'Liste alınamadı.')
    } finally {
      setLoading(false)
      setSelected([])
    }
  }
  useEffect(()=>{ load() }, [page, sort.by, sort.dir]) // eslint-disable-line

  /* filtre değişimi */
  const onFilterChange = (fn) => {
    setFilters(f=>fn(f))
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(()=>{ setPage(1); load() }, 400)
  }
  const quick = {
    today: () => onFilterChange(f => ({ ...f, start: todayISO(),       end: todayISO() })),
    week:  () => onFilterChange(f => ({ ...f, start: startOfWeekISO(),  end: todayISO() })),
    month: () => onFilterChange(f => ({ ...f, start: startOfMonthISO(), end: todayISO() })),
  }

  /* kur getir */
  const fetchRate = async (curr) => {
    if (curr==='TRY') { setForm(f=>({ ...f, fxRate:1 })); return }
    try {
      const { data } = await api.get(`/finance/rates?base=${curr}&symbols=TRY`)
      const r = Number(data?.rates?.TRY || 0) || 0
      setForm(f=>({ ...f, fxRate: r || 1 }))
    } catch {
      setForm(f=>({ ...f, fxRate: 1 }))
    }
  }

  /* oluştur (tek / tekrarlı) */
  const create = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount || 0)
    if (amount <= 0) return alert('Tutar 0’dan büyük olmalı.')

    try {
      if (form.recurring.enabled) {
        const dates = expandRecurrence({
          startDate: form.date,
          frequency: form.recurring.frequency,
          count: Number(form.recurring.count || 1)
        })
        const entries = dates.map(d => ({
          type: form.type, method: form.method, category: form.category,
          amount, currency: form.currency, fxRate: form.fxRate,
          date: d, note: form.note, source: 'manual'
        }))
        await api.post('/finance/entries/bulk', { entries })
      } else {
        await api.post('/finance/entries', {
          type: form.type, method: form.method, category: form.category,
          amount, currency: form.currency, fxRate: form.fxRate,
          date: form.date, note: form.note, source: 'manual'
        })
      }
      setForm({ ...blank, type: form.type, currency: form.currency, category: catsForType(form.type)[0] })
      setPage(1); await load()
    } catch (err) {
      alert(err?.response?.data?.message || 'Kayıt oluşturulamadı.')
    }
  }

  /* düzenle */
  const openEdit = (row) => {
    setEdit({
      ...row,
      _id: getId(row),
      date: iso(row.date || row.createdAt),
      currency: row.currency || 'TRY',
      fxRate: Number(row.fxRate || 1),
      amount: Number(row.amount || 0)
    })
    setDrawer(true)
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    const id = getId(edit)
    if (!id) return alert('Kayıt kimliği bulunamadı.')
    try {
      await api.put(`/finance/entries/${id}`, {
        type: edit.type, method: edit.method, category: edit.category,
        amount: Number(edit.amount||0), currency: edit.currency, fxRate: Number(edit.fxRate||1),
        date: edit.date, note: edit.note||''
      })
      setDrawer(false); await load()
    } catch (err) {
      alert(err?.response?.data?.message || 'Güncelleme başarısız.')
    }
  }

  /* silme / toplu silme */
  const remove = async (row) => {
    const id = getId(row)
    if (!id) return alert('Kayıt kimliği bulunamadı.')
    if (!window.confirm('Bu kaydı silmek istiyor musun?')) return
    await api.delete(`/finance/entries/${id}`)
    await load()
  }
  const bulkRemove = async () => {
    if (!selected.length) return
    if (!window.confirm(`${selected.length} kayıt silinsin mi?`)) return
    await Promise.all(selected.filter(Boolean).map(id => api.delete(`/finance/entries/${id}`)))
    await load()
  }

  /* toplu atamalar */
  const bulkSetMethod = async () => {
    if (!selected.length) return
    const val = prompt(`Yöntem (${METHODS.map(m=>m.value).join(', ')}):`)
    if (!val || !METHODS.some(m=>m.value===val)) return alert('Geçersiz yöntem.')
    await Promise.all(selected.map(id=>api.put(`/finance/entries/${id}`, { method: val })))
    await load()
  }
  const bulkSetCategory = async () => {
    if (!selected.length) return
    const val = prompt('Kategori girin:')
    if (!val) return
    await Promise.all(selected.map(id=>api.put(`/finance/entries/${id}`, { category: val })))
    await load()
  }

  /* CSV */
  const exportCsv = async () => {
    const qs = buildQuery(); let all=[]; let p=1; const l=500
    while(true){
      const res = await api.get(`/finance/entries?${qs}&page=${p}&limit=${l}`)
      all = all.concat(res.data.items||[])
      if (all.length >= (res.data.total||all.length)) break
      p++
    }
    const rows = [
      ['Date','Type','Method','Category','Amount','Currency','FX Rate','Amount(TRY)','Note'],
      ...all.map(r=>[
        iso(r.date||r.createdAt),
        r.type, r.method, r.category,
        String(r.amount||0).replace('.',','),
        r.currency || 'TRY',
        String(r.fxRate||1).replace('.',','),
        String((Number(r.amountTry ?? (r.amount||0)*(r.fxRate||1)))||0).replace('.',','),
        r.note || ''
      ])
    ]
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`finance_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a)
    a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  /* PDF: tek fiş */
  const pdfReceipt = (row) => {
    const doc = new jsPDF()
    const hotelName = localStorage.getItem('hotelName') || 'Otel'
    doc.setFontSize(14); doc.text(`${hotelName} - Gelir/Gider Fişi`, 14, 18)
    doc.setFontSize(11)
    const lines = [
      ['Tarih', new Date(row.date||row.createdAt).toLocaleString('tr-TR')],
      ['Tip', row.type==='income'?'Gelir':'Gider'],
      ['Yöntem', METHODS.find(m=>m.value===row.method)?.label || row.method],
      ['Kategori', row.category],
      ['Tutar', `${row.amount} ${row.currency||'TRY'}`],
      ['Kur', `${row.fxRate || 1}`],
      ['Tutar (TRY)', formatTRY(row.amountTry ?? (row.amount||0)*(row.fxRate||1))],
      ['Not', row.note || '-'],
    ]
    let y = 32
    lines.forEach(([k,v])=>{ doc.text(`${k}:`,14,y); doc.text(String(v), 60, y); y+=8 })
    doc.line(14, y, 196, y); y+=10
    doc.setFontSize(10); doc.text('Otomatik oluşturulmuştur.', 14, y)
    doc.save(`fis_${iso(row.date||row.createdAt)}.pdf`)
  }

  /* PDF: günlük/filtre PDF özeti */
  const pdfDaily = () => {
    const doc = new jsPDF()
    const hotelName = localStorage.getItem('hotelName') || 'Otel'
    doc.setFontSize(14); doc.text(`${hotelName} - Özet (${filters.start} ~ ${filters.end})`, 14, 18)
    doc.setFontSize(11)
    let y = 26
    doc.text(`Gelir: ${formatTRY(summary.incomeTry)}   Gider: ${formatTRY(summary.expenseTry)}   Net: ${formatTRY(summary.netTry)}`, 14, y)
    y+=8; doc.line(14,y,196,y); y+=6

    doc.setFontSize(10)
    doc.text('Tarih', 14, y); doc.text('Tip', 40, y); doc.text('Yöntem', 63, y); doc.text('Kategori', 96, y); doc.text('Tutar', 160, y, { align:'right' })
    y+=5; doc.line(14,y,196,y); y+=4
    items.forEach(r=>{
      if (y>280) { doc.addPage(); y = 18 }
      doc.text(new Date(r.date||r.createdAt).toLocaleDateString('tr-TR'), 14, y)
      doc.text(r.type==='income'?'Gelir':'Gider', 40, y)
      doc.text(METHODS.find(m=>m.value===r.method)?.label || r.method, 63, y)
      doc.text(String(r.category||''), 96, y)
      doc.text(`${(r.amount||0)} ${r.currency||'TRY'}`, 196, y, {align:'right'})
      y+=6
    })
    doc.save(`ozet_${filters.start}_${filters.end}.pdf`)
  }

  /* tablo kolonları */
  const headers = useMemo(()=>[
    { key:'select',   label:'' },
    { key:'date',     label:'Tarih' },
    { key:'type',     label:'Tip' },
    { key:'method',   label:'Yöntem' },
    { key:'category', label:'Kategori' },
    { key:'amount',   label:'Tutar' },
    { key:'fx',       label:'Kur' },
    { key:'try',      label:'Tutar (TRY)' },
    { key:'note',     label:'Not' },
    { key:'actions',  label:'Aksiyon' },
  ],[])
  const onSort = (k) => {
    if (['select','actions','note','fx','try'].includes(k)) return
    setSort(s => s.by===k ? ({by:k,dir:s.dir==='asc'?'desc':'asc'}) : ({by:k,dir:'asc'}))
  }

  const toggleAll = (e)=> setSelected(e.target.checked ? items.map(getId).filter(Boolean) : [])
  const toggleOne = (id)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s,id])

  /* ================= Rezervasyonlardan çekme ================= */

  const buildEntriesFromReservations = (reservations, opts) => {
    const out = []
    reservations.forEach(r => {
      const rid = r._id || r.id
      const guestName = r.guest?.name || r.guestName || r.primaryGuest || 'Misafir'
      const channel = r.channel || r.source || '-'
      const checkIn = r.checkIn || r.arrivalDate || r.startDate

      const total = Number(r.totalPrice ?? r.total ?? 0) || 0
      const payments = Array.isArray(r.payments) ? r.payments
        : Array.isArray(r.paymentHistory) ? r.paymentHistory
        : Array.isArray(r.transactions) ? r.transactions
        : []

      // 1) gerçek ödemeler (income) ve iadeler (expense)
      if (opts.includePayments) {
        payments.forEach(p => {
          const amt = Number(p.amount || p.total || 0) || 0
          const cur = toUpper(p.currency || 'TRY', 'TRY')
          const fx  = Number(p.fxRate || p.rate || 1) || 1
          const dt  = p.date || p.createdAt || checkIn || new Date()
          const m   = mapMethod(p.method || p.type || '')
          const isRefund = amt < 0 || norm(p.kind).includes('refund') || norm(p.type).includes('refund') || norm(p.type).includes('iade')

          out.push({
            type: isRefund ? 'expense' : 'income',
            method: m,
            category: isRefund ? 'İade/İptal' : 'Rezervasyon Ödemesi',
            amount: Math.abs(amt),
            currency: cur,
            fxRate: fx,
            date: iso(dt),
            note: `${isRefund?'İade':'Ödeme'} • ${guestName} • ${channel}`,
            uniqueKey: `res:${rid}:pay:${p._id || iso(dt)}:${Math.abs(amt)}`,
            source: isRefund ? 'res_refund' : 'res_payment',
            reservation: rid,
            guestName,
            channel
          })
        })
      }

      // 2) check-in günündeki kalan bakiye (planlanan gelir)
      if (opts.includePlannedBalance) {
        const paid = payments.reduce((s,p)=> s + Math.max(0, Number(p.amount||0)), 0)
        const balance = Math.max(0, total - paid)
        if (balance > 0 && checkIn) {
          out.push({
            type: 'income',
            method: 'transfer',
            category: 'Rezervasyon Ödemesi',
            amount: balance,
            currency: 'TRY',
            fxRate: 1,
            date: iso(checkIn),
            note: `Check-in kalan tahsilat • ${guestName} • ${channel}`,
            uniqueKey: `res:${rid}:balance:${iso(checkIn)}:${balance}`,
            source: 'res_balance',
            reservation: rid,
            guestName,
            channel
          })
        }
      }
    })
    return out
  }

  const syncFromReservations = async () => {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (filters.start) p.set('start', filters.start)
      if (filters.end)   p.set('end', filters.end)
      if (syncOpts.onlyConfirmed) p.set('status', 'confirmed')

      const { data } = await api.get(`/reservations?${p.toString()}`)
      const reservations = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
      if (!reservations.length) { alert('Seçilen aralıkta rezervasyon bulunamadı.'); return }

      const entries = buildEntriesFromReservations(reservations, syncOpts)
      if (!entries.length) { alert('Eklenecek hareket bulunamadı.'); return }

      const res = await api.post('/finance/entries/bulk', { entries })
      const c = (res.data?.upserted || 0) + (res.data?.inserted || 0)
      alert(`Rezervasyonlardan aktarılan: ${c} hareket`)
      await load()
    } catch (e) {
      alert(e?.response?.data?.message || 'Eşitleme başarısız.')
    } finally {
      setLoading(false)
    }
  }

  /* ====== UI ====== */
  return (
    <div>
      <Header title="Gelir & Gider" subtitle="Kayıt ekle • Döviz • Tekrarlı • CSV/PDF • Özet • Nakit akışı • Rezervasyon entegrasyonu" />

      {/* üst bar */}
      <div className="card" style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <button className="btn" onClick={quick.today}>Bugün</button>
        <button className="btn" onClick={quick.week}>Bu Hafta</button>
        <button className="btn" onClick={quick.month}>Bu Ay</button>

        <div style={{marginLeft:'auto',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={()=>setSyncOpen(true)}>Rezervasyonlardan getir</button>
          {selected.length>0 && (
            <>
              <button className="btn" onClick={bulkSetMethod}>Toplu: Yöntem</button>
              <button className="btn" onClick={bulkSetCategory}>Toplu: Kategori</button>
              <button className="btn danger" onClick={bulkRemove}>Seçili Sil ({selected.length})</button>
            </>
          )}
          <button className="btn" onClick={pdfDaily}>PDF (günlük/filtre)</button>
          <button className="btn" onClick={exportCsv}>CSV</button>
        </div>
      </div>

      {/* filtreler + özet */}
      <div className="card" style={{marginBottom:16}}>
        <form className="form-grid" onSubmit={(e)=>{e.preventDefault(); setPage(1); load()}}>
          <label className="field"><span className="field-label">Başlangıç</span>
            <input className="input" type="date" value={filters.start} onChange={e=>onFilterChange(f=>({...f,start:e.target.value}))}/>
          </label>
          <label className="field"><span className="field-label">Bitiş</span>
            <input className="input" type="date" value={filters.end} onChange={e=>onFilterChange(f=>({...f,end:e.target.value}))}/>
          </label>
          <label className="field"><span className="field-label">Tip</span>
            <select className="select" value={filters.type} onChange={e=>onFilterChange(f=>({...f,type:e.target.value, category:''}))}>
              <option value="">Hepsi</option>
              {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Yöntem</span>
            <select className="select" value={filters.method} onChange={e=>onFilterChange(f=>({...f,method:e.target.value}))}>
              <option value="">Hepsi</option>
              {METHODS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Kategori</span>
            <select className="select" value={filters.category} onChange={e=>onFilterChange(f=>({...f,category:e.target.value}))}>
              <option value="">Hepsi</option>
              {(filters.type? catsForType(filters.type) : [...INCOME_CATS, ...EXPENSE_CATS]).map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{gridColumn:'1 / span 2'}}><span className="field-label">Ara</span>
            <input className="input" placeholder="Not, kategori…" value={filters.q} onChange={e=>onFilterChange(f=>({...f,q:e.target.value}))}/>
          </label>
          <div style={{display:'flex',alignItems:'end'}}><button className="btn">Filtrele</button></div>
        </form>

        {/* özet kartları (TRY) */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginTop:12}}>
          <div className="card" style={{padding:'10px'}}><div className="label">Gelir</div><div className="value">{formatTRY(summary.incomeTry)}</div></div>
          <div className="card" style={{padding:'10px'}}><div className="label">Gider</div><div className="value">{formatTRY(summary.expenseTry)}</div></div>
          <div className="card" style={{padding:'10px'}}><div className="label">Net</div><div className="value">{formatTRY(summary.netTry)}</div></div>
          <div className="card" style={{padding:'6px 10px'}}><div className="label">Nakit Akışı</div><Sparkline data={series} /></div>
        </div>
      </div>

      {/* yeni kayıt formu */}
      <div className="card" style={{marginBottom:16}}>
        <div className="label" style={{marginBottom:8}}>Yeni Kayıt</div>
        <form className="form-grid" onSubmit={create}>
          <label className="field"><span className="field-label">Tip</span>
            <select className="select" value={form.type} onChange={e=>setForm(f=>({ ...f, type:e.target.value, category: catsForType(e.target.value)[0] }))}>
              {TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <label className="field"><span className="field-label">Tutar</span>
            <input className="input" type="number" min="0" placeholder="Örn. 1200" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
          </label>

          <label className="field"><span className="field-label">Para Birimi</span>
            <select className="select" value={form.currency} onChange={async e=>{ const val=e.target.value; setForm({...form, currency:val}); await fetchRate(val) }}>
              {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="field"><span className="field-label">Kur (1 {form.currency} = ? TRY)</span>
            <input className="input" type="number" step="0.0001" value={form.fxRate} onChange={e=>setForm({...form,fxRate:e.target.value})}/>
          </label>

          <label className="field"><span className="field-label">Yöntem</span>
            <select className="select" value={form.method} onChange={e=>setForm({...form,method:e.target.value})}>
              {METHODS.map(m=> <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <label className="field"><span className="field-label">Kategori</span>
            <select className="select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              {catsForType(form.type).map(c=> <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="field"><span className="field-label">Tarih</span>
            <input className="input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
          </label>

          <label className="field" style={{gridColumn:'1 / -1'}}><span className="field-label">Not</span>
            <textarea className="input" rows={2} placeholder="Opsiyonel" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
          </label>

          {/* Tekrarlı kayıt sihirbazı */}
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Tekrarlı</span>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <label style={{display:'inline-flex',alignItems:'center',gap:8}}>
                <input type="checkbox" checked={form.recurring.enabled} onChange={e=>setForm({...form,recurring:{...form.recurring,enabled:e.target.checked}})} />
                Etkin
              </label>
              <select className="select" style={{width:160}} disabled={!form.recurring.enabled}
                value={form.recurring.frequency} onChange={e=>setForm({...form,recurring:{...form.recurring,frequency:e.target.value}})}>
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </select>
              <input className="input" style={{width:160}} disabled={!form.recurring.enabled} type="number" min="1"
                value={form.recurring.count} onChange={e=>setForm({...form,recurring:{...form.recurring,count:e.target.value}})} />
              <span className="muted">adet olarak oluştur</span>
            </div>
          </div>

          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <div className="muted">TRY karşılığı: <b>{formatTRY(Number(form.amount||0) * Number(form.fxRate||1))}</b></div>
            <button className="btn primary">Ekle</button>
          </div>
        </form>
      </div>

      {/* liste */}
      <div className="card" style={{position:'relative', overflowX:'auto'}}>
        {loading && <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.2)', borderRadius:12}}>Yükleniyor…</div>}
        <table className="table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.length===items.length && items.length>0} onChange={toggleAll} /></th>
              {headers.slice(1).map(h=>(
                <th key={h.key} onClick={()=>onSort(h.key)} style={{cursor:(['actions','note','fx','try'].includes(h.key))?'default':'pointer'}}>
                  {h.label}{(sort.by===h.key)?(sort.dir==='asc'?' ▲':' ▼'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r)=>(
              <tr key={getId(r)}>
                <td><input type="checkbox" checked={selected.includes(getId(r))} onChange={()=>toggleOne(getId(r))} /></td>
                <td>{new Date(r.date||r.createdAt).toLocaleDateString('tr-TR')}</td>
                <td>
                  <span className="badge" style={{
                    padding:'4px 8px', borderRadius:999,
                    background: r.type==='income'?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)',
                    border: `1px solid ${r.type==='income'?'rgba(34,197,94,.35)':'rgba(239,68,68,.35)'}`
                  }}>{r.type==='income'?'Gelir':'Gider'}</span>
                </td>
                <td>{METHODS.find(m=>m.value===r.method)?.label || r.method}</td>
                <td>{r.category}</td>
                <td style={{fontWeight:700}}>{(r.amount||0)} {r.currency||'TRY'}</td>
                <td>{Number(r.fxRate||1).toFixed(4)}</td>
                <td style={{fontWeight:700, color: r.type==='income'?'#10b981':'#ef4444'}}>{formatTRY(r.amountTry ?? (r.amount||0)*(r.fxRate||1))}</td>
                <td className="muted" style={{maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={r.note || ''}>{r.note || '—'}</td>
                <td>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="btn" onClick={()=>pdfReceipt(r)}>Fiş PDF</button>
                    <button className="btn" onClick={()=>openEdit(r)}>Düzenle</button>
                    <button className="btn" onClick={()=>remove(r)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length===0 && !loading && <tr><td colSpan={headers.length} className="muted">Kayıt bulunamadı</td></tr>}
          </tbody>
        </table>

        {/* sayfalama */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <div className="muted" style={{fontSize:12}}>Toplam {total} kayıt • Sayfa {page}/{pages}</div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Önceki</button>
            <button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Sonraki</button>
          </div>
        </div>
      </div>

      {/* Drawer: düzenle */}
      <Drawer open={drawer} onClose={()=>setDrawer(false)} title="Gelir/Gider Düzenle">
        {edit && (
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="field"><span className="field-label">Tip</span>
              <select className="select" value={edit.type} onChange={e=>setEdit(m=>({...m,type:e.target.value, category: catsForType(e.target.value)[0]}))}>
                {TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Tutar</span>
              <input className="input" type="number" min="0" value={edit.amount} onChange={e=>setEdit(m=>({...m,amount:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Para Birimi</span>
              <select className="select" value={edit.currency} onChange={async e=>{ const v=e.target.value; setEdit(m=>({...m,currency:v})); try{ const {data}=await api.get(`/finance/rates?base=${v}&symbols=TRY`); const r=Number(data?.rates?.TRY||1)||1; setEdit(m=>({...m,fxRate:r})) }catch{} }}>
                {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Kur</span>
              <input className="input" type="number" step="0.0001" value={edit.fxRate} onChange={e=>setEdit(m=>({...m,fxRate:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Yöntem</span>
              <select className="select" value={edit.method} onChange={e=>setEdit(m=>({...m,method:e.target.value}))}>
                {METHODS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Kategori</span>
              <select className="select" value={edit.category} onChange={e=>setEdit(m=>({...m,category:e.target.value}))}>
                {catsForType(edit.type).map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Tarih</span>
              <input className="input" type="date" value={edit.date} onChange={e=>setEdit(m=>({...m,date:e.target.value}))}/>
            </label>
            <label className="field" style={{gridColumn:'1 / -1'}}><span className="field-label">Not</span>
              <textarea className="input" rows={3} value={edit.note||''} onChange={e=>setEdit(m=>({...m,note:e.target.value}))}/>
            </label>
            <div className="muted">TRY karşılığı: <b>{formatTRY(Number(edit.amount||0)*Number(edit.fxRate||1))}</b></div>
            <button className="btn primary">Kaydet</button>
          </form>
        )}
      </Drawer>

      {/* Drawer: Rezervasyonlardan getir */}
      <Drawer open={syncOpen} onClose={()=>setSyncOpen(false)} title="Rezervasyonlardan Gelir/Gider Aktar">
        <div className="muted" style={{marginBottom:8}}>
          Seçilen tarih aralığındaki rezervasyonlardan ödemeleri ve opsiyonel olarak check-in günündeki kalan tahsilatı maliyete aktarır.
          Kayıtlar <b>uniqueKey</b> ile idempotenttir; aynı dönemi birden çok kez çalıştırmak yinelenen hareket oluşturmaz.
        </div>
        <div className="form-grid">
          <label className="field"><span className="field-label">Tarih aralığı</span>
            <div style={{display:'flex',gap:8}}>
              <input className="input" type="date" value={filters.start} onChange={e=>onFilterChange(f=>({...f,start:e.target.value}))}/>
              <input className="input" type="date" value={filters.end} onChange={e=>onFilterChange(f=>({...f,end:e.target.value}))}/>
            </div>
          </label>

          <label className="field"><span className="field-label">Opsiyonlar</span>
            <div style={{display:'grid',gap:8}}>
              <label style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="checkbox" checked={syncOpts.includePayments} onChange={e=>setSyncOpts(o=>({...o,includePayments:e.target.checked}))}/>
                Rezervasyon ödeme/iade hareketlerini aktar
              </label>
              <label style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="checkbox" checked={syncOpts.includePlannedBalance} onChange={e=>setSyncOpts(o=>({...o,includePlannedBalance:e.target.checked}))}/>
                Check-in gününde kalan bakiyeyi planlanan gelir olarak ekle
              </label>
              <label style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="checkbox" checked={syncOpts.onlyConfirmed} onChange={e=>setSyncOpts(o=>({...o,onlyConfirmed:e.target.checked}))}/>
                Sadece onaylı rezervasyonlar
              </label>
            </div>
          </label>

          <div style={{display:'flex',gap:8}}>
            <button className="btn primary" onClick={syncFromReservations}>Aktarımı Başlat</button>
            <button className="btn" onClick={()=>setSyncOpen(false)}>Kapat</button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
