import React, { useEffect, useMemo, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'

/* ---------------------------------------------------------
   TAKSONOMİ (TR etiket, EN değer) — API'ye EN değer gider
--------------------------------------------------------- */
const AMENITIES = [
  { value: 'wifi',       label: 'Wi-Fi' },
  { value: 'ac',         label: 'Klima' },
  { value: 'tv',         label: 'TV' },
  { value: 'minibar',    label: 'Minibar' },
  { value: 'kettle',     label: 'Su ısıtıcısı' },
  { value: 'safe',       label: 'Kasa' },
  { value: 'work_desk',  label: 'Çalışma masası' },
  { value: 'balcony',    label: 'Balkon' },
]

const EXTRAS = [
  { key: 'hasPool',    label: 'Havuz' },
  { key: 'hasJacuzzi', label: 'Jakuzi' },
]

const VIEWS = [
  { value: 'sea',      label: 'Deniz manzarası' },
  { value: 'lake',     label: 'Göl manzarası' },
  { value: 'mountain', label: 'Dağ manzarası' },
  { value: 'forest',   label: 'Orman manzarası' },
  { value: 'garden',   label: 'Bahçe manzarası' },
  { value: 'city',     label: 'Şehir manzarası' },
]

const KITCHEN_TOGGLE = { key: 'hasKitchen', label: 'Mutfak' }
const KITCHEN_FEATS = [
  { value: 'stove',      label: 'Ocak' },
  { value: 'cooktop',    label: 'Set üstü ocak' },
  { value: 'oven',       label: 'Fırın' },
  { value: 'microwave',  label: 'Mikrodalga' },
  { value: 'dishwasher', label: 'Bulaşık makinesi' },
  { value: 'fridge',     label: 'Buzdolabı' },
]

const PROPERTY_TYPES = [
  { value:'room',      label:'Oda' },
  { value:'suite',     label:'Suit' },
  { value:'villa',     label:'Villa' },
  { value:'bungalow',  label:'Bungalov' },
  { value:'glamping',  label:'Glamping' },
  { value:'tinyhouse', label:'Tiny House' },
]

/* ----------------- Yardımcılar ----------------- */
const iso = (d) => new Date(d).toISOString().slice(0,10)
const today = () => iso(new Date())
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return iso(d) }
const labelOf = (arr, value) => arr.find(x => x.value === value)?.label || value
const labelOfPropType = (v) => PROPERTY_TYPES.find(p => p.value === v)?.label || v
const formatTRY = (n) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n || 0))

/* Basit erişilebilir chip */
function Chip({ active, onClick, children }) {
  return (
    <span
      className={`chip ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e)=> (e.key === 'Enter' || e.key === ' ') && onClick()}
      style={{ userSelect:'none' }}
    >
      {children}
    </span>
  )
}

export default function Rooms(){
  /* ------- Liste & Form ------- */
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const emptyType = {
    code:'', name:'',
    basePrice:'', capacityAdults:2, capacityChildren:0,
    totalRooms:0, bedType:'', sizeSqm:'', smoking:false,
    amenities:[], scenicViews:[],
    hasPool:false, hasJacuzzi:false,
    hasKitchen:false, kitchenFeatures:[],
    propertyType:'room', unitBedrooms:0, unitBathrooms:0, unitBeds:0,
    description:'',
    channelCodes:{ direct:'', airbnb:'', booking:'', etstur:'' }
  }
  const [form, setForm] = useState(emptyType)
  const [editId, setEditId] = useState(null)

  /* ------- Envanter ------- */
  const [inv, setInv] = useState({
    roomType:'', start: today(), end: addDays(today(), 14),
    price:'', allotment:'', stopSell:false
  })
  const [invPreview, setInvPreview] = useState([])

  /* ------- API ------- */
  const loadTypes = async () => {
    setLoading(true)
    const { data } = await api.get('/rooms/types')
    setTypes(data)
    setLoading(false)
  }
  useEffect(()=>{ loadTypes() }, [])

  const saveType = async (e) => {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) {
      alert('Kod ve Ad zorunludur.'); return
    }
    const payload = {
      ...form,
      basePrice: Number(form.basePrice || 0),
      capacityAdults: Number(form.capacityAdults || 0),
      capacityChildren: Number(form.capacityChildren || 0),
      totalRooms: Number(form.totalRooms || 0),
      sizeSqm: Number(form.sizeSqm || 0),
      unitBedrooms: Number(form.unitBedrooms || 0),
      unitBathrooms: Number(form.unitBathrooms || 0),
      unitBeds: Number(form.unitBeds || 0),
    }
    if (editId) await api.put(`/rooms/types/${editId}`, payload)
    else await api.post('/rooms/types', payload)
    setForm(emptyType); setEditId(null); await loadTypes()
  }

  const editType = (rt) => {
    setEditId(rt._id)
    setForm({
      code: rt.code || '', name: rt.name || '',
      basePrice: rt.basePrice ?? '',
      capacityAdults: rt.capacityAdults ?? 2,
      capacityChildren: rt.capacityChildren ?? 0,
      totalRooms: rt.totalRooms ?? 0,
      bedType: rt.bedType || '',
      sizeSqm: rt.sizeSqm ?? '',
      smoking: !!rt.smoking,
      amenities: rt.amenities || [],
      scenicViews: rt.scenicViews || [],
      hasPool: !!rt.hasPool,
      hasJacuzzi: !!rt.hasJacuzzi,
      hasKitchen: !!rt.hasKitchen,
      kitchenFeatures: rt.kitchenFeatures || [],
      propertyType: rt.propertyType || 'room',
      unitBedrooms: rt.unitBedrooms ?? 0,
      unitBathrooms: rt.unitBathrooms ?? 0,
      unitBeds: rt.unitBeds ?? 0,
      description: rt.description || '',
      channelCodes: {
        direct:  rt.channelCodes?.direct  || '',
        airbnb:  rt.channelCodes?.airbnb  || '',
        booking: rt.channelCodes?.booking || '',
        etstur:  rt.channelCodes?.etstur  || '',
      }
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duplicateType = (rt) => {
    const copy = { ...rt }
    delete copy._id
    setEditId(null)
    setForm({
      ...copy,
      code: '',
      name: `${rt.name} (Kopya)`,
      channelCodes: { direct:'', airbnb:'', booking:'', etstur:'' }
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const removeType = async (rt) => {
    if (!window.confirm(`“${rt.name}” tipini silmek istiyor musun?`)) return
    try {
      await api.delete(`/rooms/types/${rt._id}`)
      await loadTypes()
    } catch (e) {
      alert(e?.response?.data?.message || 'Silinemedi')
    }
  }

  const toggleIn = (key, val) =>
    setForm(f => f[key].includes(val)
      ? ({...f, [key]: f[key].filter(x => x !== val)})
      : ({...f, [key]: [...f[key], val]}))

  /* ------- Envanter ------- */
  const fetchInventory = async () => {
    if (!inv.roomType || !inv.start || !inv.end) { setInvPreview([]); return }
    const { data } = await api.get(`/rooms/inventory?roomType=${inv.roomType}&start=${inv.start}&end=${inv.end}`)
    setInvPreview(data)
  }
  useEffect(()=>{ fetchInventory() }, [inv.roomType, inv.start, inv.end]) // eslint-disable-line

  const applyInventory = async (e) => {
    e.preventDefault()
    const payload = { roomType: inv.roomType, start: inv.start, end: inv.end }
    if (inv.price !== '') payload.price = Number(inv.price)
    if (inv.allotment !== '') payload.allotment = Number(inv.allotment)
    payload.stopSell = !!inv.stopSell
    await api.post('/rooms/inventory/bulk', payload)
    await fetchInventory()
    alert('Envanter güncellendi')
  }

  /* ------- Görüntüleme ------- */
  const typeOptions = useMemo(
    () => types.map(t => ({ value: t._id, label: `${t.name} (${t.code})` })),
    [types]
  )

  const showUnitFields = ['villa','bungalow','glamping','tinyhouse'].includes(form.propertyType)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return types
    return types.filter(t =>
      [t.name, t.code, t.bedType, labelOfPropType(t.propertyType)]
        .filter(Boolean)
        .some(s => String(s).toLowerCase().includes(q))
    )
  }, [types, search])

  return (
    <div>
      <Header
        title="Oda Tipleri & Envanter"
        subtitle="Oda tipi oluştur • Özellikler • Envanter (fiyat/allotment/stop-sell) toplu düzenle"
      />

      {/* -------- ODA TİPİ FORMU -------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{marginBottom:8}}>
          {editId ? 'Oda Tipini Düzenle' : 'Yeni Oda Tipi'}
        </div>

        <form className="form-grid" onSubmit={saveType}>
          {/* Kimlik */}
          <label className="field">
            <span className="field-label">Kod <small className="muted">(STD, DLX…)</small></span>
            <input className="input" value={form.code} onChange={e=>setForm({...form, code:e.target.value})} required />
          </label>

          <label className="field">
            <span className="field-label">Ad</span>
            <input className="input" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required />
          </label>

          <label className="field">
            <span className="field-label">Baz Fiyat (₺)</span>
            <input className="input" type="number" min="0" value={form.basePrice} onChange={e=>setForm({...form, basePrice:e.target.value})} />
          </label>

          {/* Kapasite */}
          <label className="field">
            <span className="field-label">Yetişkin Kapasitesi</span>
            <input className="input" type="number" min="0" value={form.capacityAdults} onChange={e=>setForm({...form, capacityAdults:e.target.value})} />
          </label>

          <label className="field">
            <span className="field-label">Çocuk Kapasitesi</span>
            <input className="input" type="number" min="0" value={form.capacityChildren} onChange={e=>setForm({...form, capacityChildren:e.target.value})} />
          </label>

          <label className="field">
            <span className="field-label">Toplam Oda Adedi</span>
            <input className="input" type="number" min="0" value={form.totalRooms} onChange={e=>setForm({...form, totalRooms:e.target.value})} />
          </label>

          {/* Genel */}
          <label className="field">
            <span className="field-label">Yatak Tipi</span>
            <input className="input" placeholder="Double/Twin/French…" value={form.bedType} onChange={e=>setForm({...form, bedType:e.target.value})} />
          </label>

          <label className="field">
            <span className="field-label">Metrekare</span>
            <input className="input" type="number" min="0" value={form.sizeSqm} onChange={e=>setForm({...form, sizeSqm:e.target.value})} />
          </label>

          <label className="field">
            <span className="field-label">Sigara</span>
            <select className="select" value={form.smoking ? '1':'0'} onChange={e=>setForm({...form, smoking: e.target.value==='1'})}>
              <option value="0">İçilmeyen</option>
              <option value="1">İçilebilir</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Konaklama Tipi</span>
            <select className="select" value={form.propertyType} onChange={e=>setForm({...form, propertyType:e.target.value})}>
              {PROPERTY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          {/* Villa/Bungalov/Glamping/Tinyhouse alanları */}
          {showUnitFields && (
            <>
              <label className="field">
                <span className="field-label">Yatak Odası</span>
                <input className="input" type="number" min="0" value={form.unitBedrooms} onChange={e=>setForm({...form, unitBedrooms:e.target.value})} />
              </label>
              <label className="field">
                <span className="field-label">Banyo</span>
                <input className="input" type="number" min="0" value={form.unitBathrooms} onChange={e=>setForm({...form, unitBathrooms:e.target.value})} />
              </label>
              <label className="field">
                <span className="field-label">Toplam Yatak</span>
                <input className="input" type="number" min="0" value={form.unitBeds} onChange={e=>setForm({...form, unitBeds:e.target.value})} />
              </label>
            </>
          )}

          {/* Özellikler */}
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Oda Özellikleri</span>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {AMENITIES.map(a => (
                <Chip
                  key={a.value}
                  active={form.amenities.includes(a.value)}
                  onClick={() => toggleIn('amenities', a.value)}
                >
                  {a.label}
                </Chip>
              ))}
              {EXTRAS.map(ex => (
                <Chip
                  key={ex.key}
                  active={!!form[ex.key]}
                  onClick={() => setForm(f => ({ ...f, [ex.key]: !f[ex.key] }))}
                >
                  {ex.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Manzara */}
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Manzara</span>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {VIEWS.map(v => (
                <Chip
                  key={v.value}
                  active={form.scenicViews.includes(v.value)}
                  onClick={() => toggleIn('scenicViews', v.value)}
                >
                  {v.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Mutfak */}
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Mutfak</span>
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:8}}>
              <Chip
                active={!!form[KITCHEN_TOGGLE.key]}
                onClick={() => setForm(f => ({ ...f, [KITCHEN_TOGGLE.key]: !f[KITCHEN_TOGGLE.key] }))}
              >
                {KITCHEN_TOGGLE.label}
              </Chip>
              {KITCHEN_FEATS.map(k => (
                <Chip
                  key={k.value}
                  active={form.kitchenFeatures.includes(k.value)}
                  onClick={() => toggleIn('kitchenFeatures', k.value)}
                >
                  {k.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Açıklama */}
          <label className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Açıklama</span>
            <textarea className="input" rows={2} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
          </label>

          {/* Kanal Kodları */}
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <span className="field-label">Kanal Kodları (opsiyonel)</span>
          </div>
          <label className="field">
            <span className="field-label">Direct</span>
            <input className="input" value={form.channelCodes.direct} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, direct:e.target.value}})} />
          </label>
          <label className="field">
            <span className="field-label">Airbnb</span>
            <input className="input" value={form.channelCodes.airbnb} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, airbnb:e.target.value}})} />
          </label>
          <label className="field">
            <span className="field-label">Booking</span>
            <input className="input" value={form.channelCodes.booking} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, booking:e.target.value}})} />
          </label>
          <label className="field">
            <span className="field-label">Etstur</span>
            <input className="input" value={form.channelCodes.etstur} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, etstur:e.target.value}})} />
          </label>

          <div style={{display:'flex', gap:8, gridColumn:'1 / -1'}}>
            <button className="btn primary" type="submit">{editId ? 'Güncelle' : 'Ekle'}</button>
            {editId && <button className="btn" type="button" onClick={()=>{ setEditId(null); setForm(emptyType) }}>Vazgeç</button>}
          </div>
        </form>
      </div>

      {/* -------- ODA TİPLERİ LİSTESİ -------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span>Oda Tipleri</span>
          <input
            className="input"
            style={{maxWidth:320}}
            placeholder="Ara: Kod, Ad, Tip…"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
          />
        </div>

        {loading ? 'Yükleniyor…' : (
          <table className="table hover">
            <thead>
              <tr>
                <th>Kod</th><th>Ad</th><th>Baz Fiyat</th><th>Kapasite</th><th>Toplam Oda</th><th>Tip</th><th>Özellikler</th><th className="right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t._id}>
                  <td>{t.code}</td>
                  <td>{t.name}</td>
                  <td>{formatTRY(t.basePrice)}</td>
                  <td>{t.capacityAdults}+{t.capacityChildren}</td>
                  <td>{t.totalRooms}</td>
                  <td>{labelOfPropType(t.propertyType || 'room')}</td>
                  <td className="muted" style={{fontSize:12}}>
                    {[
                      ...(t.amenities || []).map(v => labelOf(AMENITIES, v)),
                      ...(t.scenicViews || []).map(v => labelOf(VIEWS, v)),
                      ...(t.hasPool     ? ['Havuz'] : []),
                      ...(t.hasJacuzzi  ? ['Jakuzi'] : []),
                      ...(t.hasKitchen  ? ['Mutfak'] : []),
                      ...(t.kitchenFeatures || []).map(v => labelOf(KITCHEN_FEATS, v)),
                    ].join(', ')}
                  </td>
                  <td className="right">
                    <div style={{display:'inline-flex', gap:8}}>
                      <button className="btn sm" onClick={()=>editType(t)}>Düzenle</button>
                      <button className="btn sm" onClick={()=>duplicateType(t)}>Kopyala</button>
                      <button className="btn sm danger" onClick={()=>removeType(t)}>Sil</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan={8} className="muted">Eşleşen oda tipi yok</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* -------- ENVANTER (BULK) -------- */}
      <div className="card">
        <div className="label" style={{marginBottom:8}}>Envanter (Toplu Düzenleme)</div>
        <form className="form-grid" onSubmit={applyInventory}>
          <label className="field">
            <span className="field-label">Oda Tipi</span>
            <select className="select" value={inv.roomType} onChange={e=>setInv({...inv, roomType:e.target.value})} required>
              <option value="">Seçiniz</option>
              {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Başlangıç</span>
            <input className="input" type="date" value={inv.start} onChange={e=>setInv({...inv, start:e.target.value})} required />
          </label>
          <label className="field">
            <span className="field-label">Bitiş</span>
            <input className="input" type="date" value={inv.end} onChange={e=>setInv({...inv, end:e.target.value})} required />
          </label>
          <label className="field">
            <span className="field-label">Fiyat (₺)</span>
            <input className="input" type="number" min="0" placeholder="Opsiyonel" value={inv.price} onChange={e=>setInv({...inv, price:e.target.value})} />
          </label>
          <label className="field">
            <span className="field-label">Allotment</span>
            <input className="input" type="number" min="0" placeholder="Opsiyonel" value={inv.allotment} onChange={e=>setInv({...inv, allotment:e.target.value})} />
          </label>
          <label className="field">
            <span className="field-label">Satış</span>
            <select className="select" value={inv.stopSell ? '1' : '0'} onChange={e=>setInv({...inv, stopSell: e.target.value==='1'})}>
              <option value="0">Açık</option>
              <option value="1">Stop-Sell</option>
            </select>
          </label>
          <div style={{display:'flex', alignItems:'end'}}>
            <button className="btn primary" style={{minWidth:160}}>Uygula</button>
          </div>
        </form>

        <div className="label" style={{margin:'12px 0 6px'}}>Önizleme</div>
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead>
              <tr><th>Tarih</th><th>Fiyat</th><th>Allotment</th><th>Stop</th></tr>
            </thead>
            <tbody>
              {invPreview.map(x => (
                <tr key={x._id || String(x.date)}>
                  <td>{new Date(x.date).toLocaleDateString('tr-TR')}</td>
                  <td>{formatTRY(x.price)}</td>
                  <td>{x.allotment ?? 0}</td>
                  <td>{x.stopSell ? 'Evet' : 'Hayır'}</td>
                </tr>
              ))}
              {invPreview.length===0 && <tr><td className="muted" colSpan={4}>Seçilen aralık için veri yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
