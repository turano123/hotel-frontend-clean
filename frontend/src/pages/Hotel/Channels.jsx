import React, { useEffect, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'

export default function Channels({ forceHotelIdForMaster }){
  const role = localStorage.getItem('role')
  const isMaster = role === 'MASTER_ADMIN'
  const masterViewing = !!forceHotelIdForMaster

  const [items, setItems] = useState([])
  const [form, setForm] = useState({ channel:'airbnb', credentials:'' })
  const available = ['airbnb','booking','etstur']

  const qs = masterViewing ? `?hotelId=${forceHotelIdForMaster}` : ''

  const load = () => api.get(`/channels${qs}`).then(res => setItems(res.data))
  useEffect(()=>{ load() },[]) // eslint-disable-line

  const connect = async (e) => {
    e.preventDefault()
    const body = { channel: form.channel, credentials: { raw: form.credentials } }
    if (masterViewing) body.hotelId = forceHotelIdForMaster
    await api.post(`/channels/connect${masterViewing ? `?hotelId=${forceHotelIdForMaster}` : ''}`, body)
    setForm({ channel:'airbnb', credentials:'' })
    load()
  }

  const sync = async (channel) => {
    await api.post(`/channels/${channel}/sync${masterViewing ? `?hotelId=${forceHotelIdForMaster}` : ''}`)
    load()
    alert(channel + ' için senkron tetiklendi (demo)')
  }

  const badge = (active) => (
    <span style={{
      padding:'4px 8px', borderRadius:999, fontSize:12,
      background: active ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
      border: `1px solid ${active ? 'rgba(16,185,129,.4)' : 'rgba(239,68,68,.4)'}`,
      color: active ? '#10b981' : '#ef4444'
    }}>
      {active ? 'Bağlı' : 'Bağlı değil'}
    </span>
  )

  return (
    <div>
      <Header title="Kanal Yönetimi" subtitle="Bağlantılar & Senkron" />
      {(!isMaster || masterViewing) && (
        <div className="card" style={{marginBottom:16}}>
          <form className="form-grid" onSubmit={connect}>
            <select className="select" value={form.channel} onChange={e=>setForm({...form, channel:e.target.value})}>
              {available.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="Kimlik/Token (demo)" value={form.credentials} onChange={e=>setForm({...form, credentials:e.target.value})}/>
            <button className="btn primary">Bağla / Güncelle</button>
          </form>
        </div>
      )}

      <div className="kpis">
        {available.map(c => {
          const row = items.find(i => i.channel === c)
          const active = row?.active
          const lastSync = row?.lastSync ? new Date(row.lastSync).toLocaleString() : '—'
          return (
            <div className="card" key={c}>
              <div className="label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>{c.toUpperCase()}</span>
                {badge(!!active)}
              </div>
              <div style={{marginTop:8, fontSize:12}} className="muted">Son Senkron: {lastSync}</div>
              <div style={{marginTop:10, display:'flex', gap:8}}>
                <button className="btn" onClick={()=>sync(c)}>Sync</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
