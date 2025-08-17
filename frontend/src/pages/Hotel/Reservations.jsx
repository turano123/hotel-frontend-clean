import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'
import GuestPicker from '../../components/GuestPicker.jsx'
import GuestCard from '../../components/GuestCard.jsx'
import Drawer from '../../components/Drawer.jsx'
import MiniTimeline from '../../components/MiniTimeline.jsx'

/* ------------------- sabitler ------------------- */
const STATUS   = ['confirmed', 'pending', 'cancelled']
const CHANNELS = ['direct', 'airbnb', 'booking', 'etstur']

const fmtDate   = (d) => new Date(d).toLocaleDateString('tr-TR')
const iso       = (d) => new Date(d).toISOString().slice(0,10)
const todayISO  = () => iso(new Date())
const nightsBetween = (a, b) => {
  const A = new Date(a); A.setHours(0,0,0,0)
  const B = new Date(b); B.setHours(0,0,0,0)
  return Math.max(1, Math.round((B - A) / 86400000))
}
const formatTRY = (n) => new Intl.NumberFormat('tr-TR', {
  style:'currency', currency:'TRY', minimumFractionDigits:0, maximumFractionDigits:0
}).format(Number(n || 0))

/* localStorage hook */
const useLocal = (key, initial) => {
  const [v,setV] = useState(()=> {
    try { const x = localStorage.getItem(key); return x ? JSON.parse(x) : initial }
    catch { return initial }
  })
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)) }, [key,v])
  return [v,setV]
}

export default function Reservations({ forceHotelIdForMaster }) {
  const role = localStorage.getItem('role')
  const isMaster = role === 'MASTER_ADMIN'
  const masterViewing = !!forceHotelIdForMaster

  /* liste state */
  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useLocal('resv.page', 1)
  const [pages, setPages] = useState(1)
  const [limit] = useState(10)
  const [loading, setLoading] = useState(false)

  const [filters, setFilters] = useLocal('resv.filters', {
    start: '', end: '', status: '', channel: '', guest: '',
    hotelId: (isMaster && !masterViewing) ? '' : (localStorage.getItem('hotelId') || '')
  })
  const [sort, setSort] = useLocal('resv.sort', { by: 'checkIn', dir: 'desc' })

  const [hotels, setHotels] = useState([])
  const [roomTypes, setRoomTypes] = useState([])

  /* form state */
  const emptyForm = {
    guestId:'', guest:null, guestName:'',
    checkIn:'', checkOut:'', adults:2, children:0, rooms:1,
    roomType:'', channel:'direct', status:'confirmed',
    arrivalTime:'', paymentMethod:'', paymentStatus:'unpaid',
    notes:'',
    totalPrice:'',           // toplam tutar
    depositAmount:'',        // kapora
  }
  const [form, setForm] = useState(emptyForm)

  /* akıllı asistan */
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  /* drawer & seçim */
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editModel, setEditModel] = useState(null)
  const [selected, setSelected] = useState([])

  /* saved views */
  const [views, setViews] = useLocal('resv.views', [])

  /* --------- yardımcı hesaplar (UI) --------- */
  const nights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0
  const rooms = Number(form.rooms || 1)
  const totalAmount = Number(form.totalPrice || 0)
  const deposit = Number(form.depositAmount || 0)
  const balance = Math.max(0, totalAmount - deposit)
  const adr = nights > 0 ? totalAmount / nights / rooms : 0

  const invalidDates = form.checkIn && form.checkOut && new Date(form.checkOut) <= new Date(form.checkIn)
  const overDeposit  = deposit > totalAmount

  /* master için oteller + oda tipleri */
  useEffect(() => {
    if (isMaster && !masterViewing) api.get('/hotels').then(res => setHotels(res.data))
    api.get('/rooms/types').then(res => setRoomTypes(res.data))
  }, [isMaster, masterViewing])

  /* --------- listeyi getir --------- */
  const buildQuery = () => {
    const p = new URLSearchParams()
    p.set('page', page); p.set('limit', limit)
    if (filters.start) p.set('start', filters.start)
    if (filters.end) p.set('end', filters.end)
    if (filters.status) p.set('status', filters.status)
    if (filters.channel) p.set('channel', filters.channel)
    if (filters.guest) p.set('guest', filters.guest)
    if (masterViewing) p.set('hotelId', forceHotelIdForMaster)
    else if (isMaster && filters.hotelId) p.set('hotelId', filters.hotelId)
    return p.toString()
  }

  const load = async () => {
    setLoading(true)
    const qs = buildQuery()
    const { data } = await api.get(`/reservations?${qs}`)
    const sorted = [...data.items].sort((a,b) => {
      const getV = (k, v) =>
        (k==='checkIn'||k==='checkOut') ? new Date(v).getTime()
        : (typeof v === 'string' ? v.toLowerCase() : Number(v||0))
      const fa = getV(sort.by, a[sort.by]); const fb = getV(sort.by, b[sort.by])
      return sort.dir === 'asc' ? (fa - fb) : (fb - fa)
    })
    setItems(sorted); setTotalCount(data.total); setPages(data.pages)
    setSelected([]); setLoading(false)
  }
  useEffect(() => { load() }, [page, sort.by, sort.dir]) // eslint-disable-line

  /* filtre değişince (debounce) */
  const debounce = useRef(null)
  const onFilterSubmit = async (e) => { e.preventDefault(); setPage(1); await load() }
  const onFilterChange = (fn) => {
    setFilters(f => { const next = fn(f); return next })
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(()=> { setPage(1); load() }, 450)
  }

  /* hızlı filtreler */
  const quick = {
    arrivals:   () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO(), status:'', channel:'', guest:''})),
    departures: () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO()})),
    inhouse:    () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO(), status:'confirmed'})),
  }

  /* oluştur */
  const create = async (e) => {
    e.preventDefault()
    if (invalidDates) { alert('Çıkış tarihi, giriş tarihinden sonra olmalı.'); return }
    if (overDeposit)  { alert('Kapora toplam tutarı aşamaz.'); return }

    const payload = {
      ...form,
      totalPrice: Number(form.totalPrice || 0),
      depositAmount: Number(form.depositAmount || 0),
      rooms: Number(form.rooms || 1),
      adults: Number(form.adults || 0),
      children: Number(form.children || 0),
      guestId: form.guestId || undefined,
      guest:   form.guest   || undefined,
    }
    await api.post('/reservations', payload)
    setForm(emptyForm)
    setPage(1); await load()
  }

  /* durum değiştir */
  const changeStatus = async (id, status) => {
    await api.patch(`/reservations/${id}/status`, { status })
    await load()
  }

  /* drawer aç / kaydet */
  const openDrawer = (row) => {
    setEditModel({
      ...row,
      checkIn: row.checkIn?.slice(0,10),
      checkOut: row.checkOut?.slice(0,10),
      totalPrice: row.totalPrice ?? '',
      depositAmount: row.depositAmount ?? '',
    })
    setDrawerOpen(true)
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    const endBeforeStart = new Date(editModel.checkOut) <= new Date(editModel.checkIn)
    if (endBeforeStart) { alert('Çıkış tarihi, girişten sonra olmalı.'); return }
    if (Number(editModel.depositAmount||0) > Number(editModel.totalPrice||0)) { alert('Kapora toplamı aşamaz.'); return }

    const id = editModel._id
    const payload = {
      guestName: editModel.guest?.name || editModel.guestName,
      checkIn: editModel.checkIn, checkOut: editModel.checkOut,
      adults: Number(editModel.adults || 0),
      children: Number(editModel.children || 0),
      totalPrice: Number(editModel.totalPrice || 0),
      depositAmount: Number(editModel.depositAmount || 0),
      channel: editModel.channel, status: editModel.status,
      roomType: editModel.roomType?._id || editModel.roomType || '',
      rooms: Number(editModel.rooms || 1),
      arrivalTime: editModel.arrivalTime || '',
      paymentMethod: editModel.paymentMethod || '',
      paymentStatus: editModel.paymentStatus || 'unpaid',
      notes: editModel.notes || ''
    }
    await api.put(`/reservations/${id}`, payload)
    setDrawerOpen(false); await load()
  }

  /* sil */
  const remove = async (id) => {
    if (!window.confirm('Bu rezervasyonu silmek istediğine emin misin?')) return
    await api.delete(`/reservations/${id}`)
    await load()
  }

  /* toplu iptal / csv / ics */
  const bulkCancel = async () => {
    if (!selected.length) return
    if (!window.confirm(`${selected.length} rezervasyon iptal edilsin mi?`)) return
    await Promise.all(selected.map(id => api.patch(`/reservations/${id}/status`, { status:'cancelled' })))
    await load()
  }

  const exportCsv = async () => {
    const qs = buildQuery(); let all = []; let p=1; const l=500
    while (true) {
      const res = await api.get(`/reservations?${qs}&page=${p}&limit=${l}`)
      all = all.concat(res.data.items)
      if (all.length >= res.data.total) break; p++
    }
    const rows = [
      ['Guest','Phone','Email','CheckIn','CheckOut','Nights','RoomType','Rooms','Channel','Status','Total','Deposit','Balance'],
      ...all.map(r=>{
        const dep = Number(r.depositAmount || 0)
        const tot = Number(r.totalPrice || 0)
        const bal = Math.max(0, tot - dep)
        return [
          r.guest?.name || r.guestName, r.guest?.phone || '', r.guest?.email || '',
          iso(r.checkIn), iso(r.checkOut), nightsBetween(r.checkIn,r.checkOut),
          r.roomType ? `${r.roomType.name} (${r.roomType.code})` : '',
          r.rooms ?? 1, r.channel, r.status,
          String(tot).replace('.',','), String(dep).replace('.',','), String(bal).replace('.',',')
        ]
      })
    ]
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`reservations_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const exportIcsSelected = () => {
    if (!selected.length) return
    const sel = items.filter(i=>selected.includes(i._id))
    const pads = n => String(n).padStart(2,'0')
    const dt = d => `${d.getUTCFullYear()}${pads(d.getUTCMonth()+1)}${pads(d.getUTCDate())}T${pads(d.getUTCHours())}${pads(d.getUTCMinutes())}00Z`
    const toICS = (r) => {
      const ci = new Date(r.checkIn); ci.setHours(14,0,0,0)
      const co = new Date(r.checkOut); co.setHours(12,0,0,0)
      const dep = Number(r.depositAmount || 0)
      const tot = Number(r.totalPrice || 0)
      const bal = Math.max(0, tot - dep)
      return [
        'BEGIN:VEVENT',
        `UID:${r._id}@hms.local`,
        `DTSTAMP:${dt(new Date())}`,
        `DTSTART:${dt(ci)}`,
        `DTEND:${dt(co)}`,
        `SUMMARY:${(r.guest?.name || r.guestName || 'Guest')} - ${r.roomType ? r.roomType.name : ''}`,
        `DESCRIPTION:Kanal ${r.channel} • Durum ${r.status} • Oda ${r.rooms} • Toplam ${tot} TL • Kapora ${dep} TL • Kalan ${bal} TL`,
        'END:VEVENT'
      ].join('\n')
    }
    const cal = ['BEGIN:VCALENDAR','VERSION:2.0', ...sel.map(toICS),'END:VCALENDAR'].join('\n')
    const blob = new Blob([cal], {type:'text/calendar'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download='reservations_selected.ics'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  /* kolonlar + sıralama */
  const headers = useMemo(()=>([
    { key:'select',      label:'' },
    { key:'guestName',   label:'Misafir' },
    { key:'checkIn',     label:'Giriş' },
    { key:'checkOut',    label:'Çıkış' },
    { key:'roomType',    label:'Oda Tipi' },
    { key:'channel',     label:'Kanal' },
    { key:'status',      label:'Durum' },
    { key:'rooms',       label:'Oda' },
    { key:'totalPrice',  label:'Toplam' },
    { key:'deposit',     label:'Kapora' },
    { key:'balance',     label:'Kalan' },
    { key:'timeline',    label:'Takvim' },
    { key:'actions',     label:'Aksiyon' },
  ]),[])
  const onSort = (key) => {
    if (['select','actions','timeline','roomType','deposit','balance'].includes(key)) return
    setSort(s => s.by === key ? ({by:key,dir:s.dir==='asc'?'desc':'asc'}) : ({by:key,dir:'asc'}))
  }

  /* Asistan (availability + öneri) */
  const canQuote = form.roomType && form.checkIn && form.checkOut
  useEffect(() => {
    let ignore = false
    const run = async () => {
      if (!canQuote) { setQuote(null); return }
      setQuoteLoading(true)
      try {
        const params = new URLSearchParams({
          roomType: form.roomType,
          start: form.checkIn,
          end: form.checkOut,
          rooms: String(form.rooms || 1)
        })
        const { data } = await api.get(`/rooms/availability/quote?${params.toString()}`)
        if (!ignore) setQuote(data)
        if (!ignore && (!form.totalPrice || Number(form.totalPrice)===0)) {
          setForm(f=>({...f,totalPrice:data.suggestedTotalPrice||''}))
        }
      } finally { if (!ignore) setQuoteLoading(false) }
    }
    run()
    return ()=>{ ignore=true }
  }, [form.roomType, form.checkIn, form.checkOut, form.rooms]) // eslint-disable-line
  const fillSuggested = () => { if (quote?.suggestedTotalPrice) setForm(f=>({...f,totalPrice:quote.suggestedTotalPrice})) }

  /* seçim */
  const toggleAll = (e) => { setSelected(e.target.checked ? items.map(i=>i._id) : []) }
  const toggleOne = (id) => { setSelected(xs => xs.includes(id) ? xs.filter(x=>x!==id) : [...xs,id]) }

  /* views (kaydet/yükle) */
  const saveView = () => {
    const name = prompt('Görünüme bir ad verin:')
    if (!name) return
    setViews(v => [...v, { name, filters, sort }])
  }
  const loadView = (v) => {
    setFilters(v.filters); setSort(v.sort); setPage(1); load()
  }

  return (
    <div>
      <Header title="Rezervasyonlar" subtitle="Akıllı asistan • CRM • Timeline • Toplu işlem • CSV/ICS" />

      {/* top çubuk */}
      <div className="card" style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <button className="btn" onClick={quick.arrivals}>Bugün Giriş</button>
        <button className="btn" onClick={quick.departures}>Bugün Çıkış</button>
        <button className="btn" onClick={quick.inhouse}>İçeride (In-house)</button>
        <div style={{marginLeft:'auto', display:'flex', gap:8}}>
          {selected.length>0 && <button className="btn" onClick={bulkCancel}>Seçilileri İptal ({selected.length})</button>}
          {selected.length>0 && <button className="btn" onClick={exportIcsSelected}>ICS (seçili)</button>}
          <button className="btn" onClick={exportCsv}>CSV (filtre)</button>
          <div className="dropdown">
            <button className="btn">Görünümler</button>
            <div className="dropdown-menu">
              {views.map((v,i)=>(<div key={i} className="dropdown-item" onClick={()=>loadView(v)}>{v.name}</div>))}
              <div className="dropdown-item" onClick={saveView}>+ Görünüm Kaydet</div>
            </div>
          </div>
        </div>
      </div>

      {/* filtreler */}
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="form-grid" onSubmit={onFilterSubmit}>
          <label className="field">
            <span className="field-label">Başlangıç</span>
            <input className="input" type="date" value={filters.start} onChange={e=>onFilterChange(f=>({...f,start:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field-label">Bitiş</span>
            <input className="input" type="date" value={filters.end} onChange={e=>onFilterChange(f=>({...f,end:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field-label">Durum</span>
            <select className="select" value={filters.status} onChange={e=>onFilterChange(f=>({...f,status:e.target.value}))}>
              <option value="">Hepsi</option>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Kanal</span>
            <select className="select" value={filters.channel} onChange={e=>onFilterChange(f=>({...f,channel:e.target.value}))}>
              <option value="">Hepsi</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{gridColumn:isMaster && !masterViewing ? '1 / span 2' : 'auto'}}>
            <span className="field-label">Misafir / Telefon / E-posta</span>
            <input className="input" placeholder="Ara…" value={filters.guest} onChange={e=>onFilterChange(f=>({...f,guest:e.target.value}))}/>
          </label>
          {(isMaster && !masterViewing) && (
            <label className="field">
              <span className="field-label">Otel</span>
              <select className="select" value={filters.hotelId} onChange={e=>onFilterChange(f=>({...f,hotelId:e.target.value}))}>
                <option value="">Hepsi</option>
                {hotels.map(h => <option key={h._id} value={h._id}>{h.name} ({h.code})</option>)}
              </select>
            </label>
          )}
          <div style={{display:'flex',alignItems:'end'}}>
            <button className="btn">Filtrele</button>
          </div>
        </form>
      </div>

      {/* form + asistan + finans özeti */}
      <div style={{display:'grid', gridTemplateColumns:'1.2fr .8fr', gap:16, alignItems:'start', marginBottom:16}}>
        {/* yeni rezervasyon */}
        {(!isMaster || masterViewing) && (
          <div className="card">
            <div className="label" style={{marginBottom:8}}>Yeni Rezervasyon</div>
            <form className="form-grid" onSubmit={create}>
              {/* Misafir */}
              <label className="field" style={{gridColumn:'1 / -1'}}>
                <span className="field-label">Misafir</span>
                <GuestPicker
                  value={form.guest}
                  onChange={(g)=> setForm(f => ({
                    ...f,
                    guestId: g.guestId || '',
                    guest: g.guest || (g.guestId ? null : { name: g.name, email: g.email, phone: g.phone }),
                    guestName: g.name
                  }))}
                />
              </label>

              <label className="field">
                <span className="field-label">Telefon</span>
                <input className="input" placeholder="+90…" value={form.guest?.phone || ''} onChange={e=>setForm(f=>({...f, guest:{...(f.guest||{}), phone:e.target.value}}))}/>
              </label>
              <label className="field">
                <span className="field-label">E-posta</span>
                <input className="input" placeholder="ornek@otel.com" value={form.guest?.email || ''} onChange={e=>setForm(f=>({...f, guest:{...(f.guest||{}), email:e.target.value}}))}/>
              </label>

              <label className="field">
                <span className="field-label">Giriş</span>
                <input className="input" type="date" value={form.checkIn} onChange={e=>setForm({...form,checkIn:e.target.value})} required/>
              </label>
              <label className="field">
                <span className="field-label">Çıkış</span>
                <input className="input" type="date" value={form.checkOut} onChange={e=>setForm({...form,checkOut:e.target.value})} required/>
              </label>
              <label className="field">
                <span className="field-label">Oda Tipi</span>
                <select className="select" value={form.roomType} onChange={e=>setForm({...form,roomType:e.target.value})} required>
                  <option value="">Seçiniz</option>
                  {roomTypes.map(rt => <option key={rt._id} value={rt._id}>{rt.name} ({rt.code})</option>)}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Oda Adedi</span>
                <input className="input" type="number" min="1" value={form.rooms} onChange={e=>setForm({...form,rooms:e.target.value})}/>
              </label>
              <label className="field">
                <span className="field-label">Yetişkin</span>
                <input className="input" type="number" min="0" value={form.adults} onChange={e=>setForm({...form,adults:e.target.value})}/>
              </label>
              <label className="field">
                <span className="field-label">Çocuk</span>
                <input className="input" type="number" min="0" value={form.children} onChange={e=>setForm({...form,children:e.target.value})}/>
              </label>

              <label className="field">
                <span className="field-label">Kanal</span>
                <select className="select" value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Durum</span>
                <select className="select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Varış Saati</span>
                <input className="input" type="time" value={form.arrivalTime} onChange={e=>setForm({...form,arrivalTime:e.target.value})}/>
              </label>

              <label className="field">
                <span className="field-label">Ödeme Yöntemi</span>
                <select className="select" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}>
                  <option value="">Seçiniz</option>
                  <option value="cash">Nakit</option>
                  <option value="pos">POS</option>
                  <option value="transfer">Havale/EFT</option>
                  <option value="online">Online</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Ödeme Durumu</span>
                <select className="select" value={form.paymentStatus} onChange={e=>setForm({...form,paymentStatus:e.target.value})}>
                  <option value="unpaid">Ödenmemiş</option>
                  <option value="partial">Kısmi</option>
                  <option value="paid">Ödendi</option>
                </select>
              </label>
              <label className="field" style={{gridColumn:'1 / -1'}}>
                <span className="field-label">Notlar</span>
                <textarea className="input" rows={2} placeholder="(opsiyonel)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
              </label>

              <label className="field">
                <span className="field-label">Toplam Tutar</span>
                <input className="input" type="number" min="0" value={form.totalPrice} onChange={e=>setForm({...form,totalPrice:e.target.value})}/>
              </label>
              <label className="field">
                <span className="field-label">Kapora</span>
                <input className="input" type="number" min="0" value={form.depositAmount} onChange={e=>setForm({...form,depositAmount:e.target.value})}/>
              </label>
              <label className="field">
                <span className="field-label">Kalan</span>
                <input className="input" readOnly value={balance}/>
              </label>

              {/* uyarılar */}
              {(invalidDates || overDeposit) && (
                <div className="card" style={{gridColumn:'1 / -1', padding:'10px', border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.06)'}}>
                  {invalidDates && <div>⚠️ Çıkış tarihi, girişten sonra olmalı.</div>}
                  {overDeposit  && <div>⚠️ Kapora toplam tutarı aşamaz.</div>}
                </div>
              )}

              <div style={{display:'flex', gap:8}}>
                <button className="btn primary" disabled={invalidDates || overDeposit}>Ekle</button>
                {form.guestId && <span className="muted" style={{alignSelf:'center'}}>Misafir kartı aşağıda gösterilir.</span>}
              </div>
            </form>

            {form.guestId && <div style={{marginTop:12}}><GuestCard guestId={form.guestId} /></div>}
          </div>
        )}

        {/* sağ panel: asistan + finans özeti */}
        <div style={{display:'grid', gap:16}}>
          <div className="card" aria-live="polite">
            <div className="label" style={{marginBottom:8}}>Akıllı Asistan</div>
            {!form.roomType || !form.checkIn || !form.checkOut ? (
              <div className="muted">Oda tipi ve tarihleri seçtiğinde kalan allotment ve önerilen fiyat burada görünecek.</div>
            ) : quoteLoading ? (
              <div>Hesaplanıyor…</div>
            ) : quote ? (
              <div style={{display:'grid', gap:8}}>
                <div>Gece sayısı: <b>{quote.nights}</b></div>
                <div>Önerilen toplam: <b>{formatTRY(quote.suggestedTotalPrice || 0)}</b>
                  <button className="btn" style={{marginLeft:8}} onClick={fillSuggested}>Fiyatı Doldur</button>
                </div>
                <div className="label" style={{marginTop:8}}>Günlük Kalan Allotment</div>
                <div style={{display:'grid',gap:6, maxHeight:180, overflow:'auto'}}>
                  {quote.remainingPerDay.map((d,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px', borderRadius:8,
                      border:`1px solid ${d.remaining >= (form.rooms||1) ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)'}`, background:'rgba(255,255,255,.04)'}}>
                      <span>{fmtDate(d.date)}</span>
                      <span className="muted">Açık {Math.max(0, d.allotment-d.used)} / {d.allotment}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:6}}>Uygunluk: {quote.available ? <b style={{color:'#34d399'}}>Uygun</b> : <b style={{color:'#ef4444'}}>Yetersiz</b>}</div>
              </div>
            ) : <div className="muted">Hesaplanamadı.</div>}
          </div>

          <div className="card">
            <div className="label" style={{marginBottom:8}}>Finans Özeti</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <div className="card" style={{padding:'10px'}}><div className="label">Geceler</div><div className="value">{nights}</div></div>
              <div className="card" style={{padding:'10px'}}><div className="label">Oda × Gece</div><div className="value">{rooms} × {nights}</div></div>
              <div className="card" style={{padding:'10px'}}><div className="label">ADR</div><div className="value">{formatTRY(adr)}</div></div>
              <div className="card" style={{padding:'10px'}}><div className="label">Kalan</div><div className="value">{formatTRY(balance)}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* liste */}
      <div className="card" style={{ position:'relative', overflowX:'auto' }}>
        {loading && (
          <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.2)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12}}>Yükleniyor…</div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.length===items.length && items.length>0} onChange={toggleAll} /></th>
              {headers.slice(1).map(h=>(
                <th key={h.key} onClick={()=>onSort(h.key)} style={{cursor: (['actions','timeline','roomType','deposit','balance'].includes(h.key))?'default':'pointer'}}>
                  {h.label}{(sort.by===h.key)?(sort.dir==='asc'?' ▲':' ▼'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(r=>{
              const dep = Number(r.depositAmount || 0)
              const tot = Number(r.totalPrice || 0)
              const bal = Math.max(0, tot - dep)
              return (
                <tr key={r._id} style={{
                  background: r.status==='cancelled' ? 'rgba(239,68,68,.06)'
                           : r.status==='pending'   ? 'rgba(245,158,11,.06)' : 'transparent'
                }}>
                  <td><input type="checkbox" checked={selected.includes(r._id)} onChange={()=>toggleOne(r._id)} /></td>
                  <td>
                    <a style={{cursor:'pointer', textDecoration:'underline'}}
                       onClick={()=> setForm(f => ({ ...f, guestId: r.guest?._id || '', guest: null }))}>
                      {r.guest?.name || r.guestName}
                    </a>
                    <div className="muted" style={{fontSize:11}}>
                      {r.guest?.phone || ''} {r.guest?.email ? ` • ${r.guest.email}` : ''}
                    </div>
                  </td>
                  <td>{fmtDate(r.checkIn)}</td>
                  <td>{fmtDate(r.checkOut)}</td>
                  <td>{r.roomType ? `${r.roomType.name} (${r.roomType.code})` : '—'}</td>
                  <td>{r.channel}</td>
                  <td>
                    {(!isMaster || masterViewing) ? (
                      <select className="select" value={r.status} onChange={e=>changeStatus(r._id, e.target.value)}>
                        {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span>{r.status}</span>}
                  </td>
                  <td>{r.rooms ?? 1}</td>
                  <td>{formatTRY(tot)}</td>
                  <td style={{color: dep>0 ? '#34d399' : undefined}}>{formatTRY(dep)}</td>
                  <td style={{color: bal>0 ? '#f59e0b' : '#34d399'}}>{formatTRY(bal)}</td>
                  <td><MiniTimeline checkIn={r.checkIn} checkOut={r.checkOut} /></td>
                  <td>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button className="btn" onClick={()=>openDrawer(r)}>Düzenle</button>
                      {(!isMaster || masterViewing) && (
                        <>
                          {r.status!=='cancelled' && <button className="btn" onClick={()=>changeStatus(r._id,'cancelled')}>İptal</button>}
                          <button className="btn" onClick={()=>remove(r._id)}>Sil</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {items.length===0 && !loading && <tr><td colSpan={headers.length} className="muted">Kayıt bulunamadı</td></tr>}
          </tbody>
        </table>

        {/* sayfalama */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <div className="muted" style={{fontSize:12}}>Toplam {totalCount} kayıt • Sayfa {page}/{pages}</div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Önceki</button>
            <button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Sonraki</button>
          </div>
        </div>
      </div>

      {/* Drawer: düzenle */}
      <Drawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} title="Rezervasyon Düzenle">
        {editModel && (
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="field">
              <span className="field-label">Misafir</span>
              <input className="input" value={editModel.guest?.name || editModel.guestName || ''} readOnly />
            </label>
            <label className="field"><span className="field-label">Giriş</span>
              <input className="input" type="date" value={editModel.checkIn} onChange={e=>setEditModel(m=>({...m,checkIn:e.target.value}))} required/>
            </label>
            <label className="field"><span className="field-label">Çıkış</span>
              <input className="input" type="date" value={editModel.checkOut} onChange={e=>setEditModel(m=>({...m,checkOut:e.target.value}))} required/>
            </label>
            <label className="field"><span className="field-label">Oda Tipi</span>
              <select className="select" value={editModel.roomType?._id || editModel.roomType || ''} onChange={e=>setEditModel(m=>({...m,roomType:e.target.value}))}>
                <option value="">Seçiniz</option>
                {roomTypes.map(rt => <option key={rt._id} value={rt._id}>{rt.name} ({rt.code})</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Oda Adedi</span>
              <input className="input" type="number" min="1" value={editModel.rooms ?? 1} onChange={e=>setEditModel(m=>({...m,rooms:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kanal</span>
              <select className="select" value={editModel.channel} onChange={e=>setEditModel(m=>({...m,channel:e.target.value}))}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Durum</span>
              <select className="select" value={editModel.status} onChange={e=>setEditModel(m=>({...m,status:e.target.value}))}>
                {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Varış Saati</span>
              <input className="input" type="time" value={editModel.arrivalTime || ''} onChange={e=>setEditModel(m=>({...m,arrivalTime:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Ödeme Yöntemi</span>
              <select className="select" value={editModel.paymentMethod || ''} onChange={e=>setEditModel(m=>({...m,paymentMethod:e.target.value}))}>
                <option value="">Seçiniz</option>
                <option value="cash">Nakit</option>
                <option value="pos">POS</option>
                <option value="transfer">Havale/EFT</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Ödeme Durumu</span>
              <select className="select" value={editModel.paymentStatus || 'unpaid'} onChange={e=>setEditModel(m=>({...m,paymentStatus:e.target.value}))}>
                <option value="unpaid">Ödenmemiş</option>
                <option value="partial">Kısmi</option>
                <option value="paid">Ödendi</option>
              </select>
            </label>
            <label className="field" style={{gridColumn:'1 / -1'}}>
              <span className="field-label">Notlar</span>
              <textarea className="input" rows={3} placeholder="(opsiyonel)" value={editModel.notes || ''} onChange={e=>setEditModel(m=>({...m,notes:e.target.value}))}/>
            </label>

            <label className="field"><span className="field-label">Toplam Tutar</span>
              <input className="input" type="number" min="0" value={editModel.totalPrice} onChange={e=>setEditModel(m=>({...m,totalPrice:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kapora</span>
              <input className="input" type="number" min="0" value={editModel.depositAmount} onChange={e=>setEditModel(m=>({...m,depositAmount:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kalan</span>
              <input className="input" readOnly value={Math.max(0, Number(editModel.totalPrice||0) - Number(editModel.depositAmount||0))}/>
            </label>

            <button className="btn primary" type="submit">Kaydet</button>
          </form>
        )}
      </Drawer>
    </div>
  )
}
