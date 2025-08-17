import React, { useEffect, useRef, useState } from 'react'
import api from '../api/axios'

export default function GuestPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  useEffect(() => {
    let ignore = false
    const run = async () => {
      if (!q || q.length < 2) { setResults([]); return }
      const { data } = await api.get('/guests/search?q=' + encodeURIComponent(q))
      if (!ignore) setResults(data)
    }
    run()
    return () => { ignore = true }
  }, [q])

  const pick = (g) => {
    onChange({ guestId: g._id, guest: null, name: g.name, email: g.email || '', phone: g.phone || '' })
    setQ(g.name)
    setOpen(false)
  }

  const createInline = () => {
    // basit inline: sadece ad/telefon/e-posta
    const name = q.trim()
    if (!name) return
    onChange({ guestId: null, guest: { name, email: '', phone: '' }, name, email:'', phone:'' })
    setOpen(false)
  }

  return (
    <div ref={box} style={{ position:'relative' }}>
      <input
        className="input"
        placeholder="Misafir Adı (ara: ad / telefon / e-posta)"
        value={q}
        onChange={e=>{ setQ(e.target.value); setOpen(true) }}
        onFocus={()=>setOpen(true)}
      />
      {open && (
        <div style={{position:'absolute', zIndex:30, left:0, right:0, top:'100%', background:'#0f172a', border:'1px solid rgba(255,255,255,.08)', borderRadius:10, padding:6, maxHeight:220, overflow:'auto'}}>
          {results.length === 0 ? (
            <div style={{padding:8, fontSize:12, opacity:.8}}>
              Sonuç yok. <button className="btn" onClick={createInline}>“{q}” adına yeni misafir oluştur</button>
            </div>
          ) : results.map(r => (
            <div key={r._id} onClick={()=>pick(r)} style={{padding:'8px 10px', borderRadius:8, cursor:'pointer', display:'flex', justifyContent:'space-between'}} className="hover:bg-slate-800">
              <div>
                <div style={{fontWeight:600}}>{r.name}</div>
                <div className="muted" style={{fontSize:12}}>{r.phone || '—'} • {r.email || '—'}</div>
              </div>
              {r.vip && <span style={{fontSize:12, color:'#fbbf24'}}>VIP</span>}
              {r.blacklist && <span style={{fontSize:12, color:'#ef4444'}}>BLACKLIST</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
