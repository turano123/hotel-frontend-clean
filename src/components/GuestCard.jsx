import React, { useEffect, useState } from 'react'
import api from '../api/axios'

export default function GuestCard({ guestId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let ignore = false
    const run = async () => {
      if (!guestId) { setData(null); return }
      const { data } = await api.get('/guests/' + guestId)
      if (!ignore) setData(data)
    }
    run()
    return () => { ignore = true }
  }, [guestId])

  if (!guestId) return null
  if (!data) return <div className="muted">Misafir bilgileri yükleniyor…</div>

  const g = data.guest, s = data.stats
  return (
    <div className="card">
      <div className="label" style={{marginBottom:8}}>Misafir Kartı</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <div><div className="muted">Ad Soyad</div><div>{g.name}</div></div>
        <div><div className="muted">Telefon</div><div>{g.phone || '—'}</div></div>
        <div><div className="muted">E-posta</div><div>{g.email || '—'}</div></div>
        <div><div className="muted">Ülke</div><div>{g.country || '—'}</div></div>
        <div><div className="muted">Belge No</div><div>{g.documentNo || '—'}</div></div>
        <div><div className="muted">Etiketler</div><div>{(g.tags||[]).join(', ') || '—'}</div></div>
      </div>

      <div className="label" style={{margin:'12px 0 6px'}}>Özet</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
        <div className="kpi"><div className="muted">Konaklama</div><div className="value">{s.stays}</div></div>
        <div className="kpi"><div className="muted">Gece</div><div className="value">{s.totalNights}</div></div>
        <div className="kpi"><div className="muted">Ciro</div><div className="value">{(s.totalRevenue||0).toLocaleString()} ₺</div></div>
      </div>

      <div className="muted" style={{marginTop:8, fontSize:12}}>
        Son Konaklama: {s.lastStay ? new Date(s.lastStay.checkIn).toLocaleDateString() : '—'} • 
        Sonraki: {s.nextStay ? new Date(s.nextStay.checkIn).toLocaleDateString() : '—'}
      </div>
    </div>
  )
}
