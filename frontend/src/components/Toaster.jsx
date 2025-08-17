import React, { useEffect, useState } from 'react'
import { bindToast } from '../api/axios'

export default function Toaster(){
  const [list, setList] = useState([])

  useEffect(() => {
    bindToast(({ msg, type }) => {
      const id = Math.random().toString(36).slice(2)
      setList((xs) => [...xs, { id, msg, type }])
      setTimeout(() => setList((xs) => xs.filter(i => i.id !== id)), 3500)
    })
  }, [])

  return (
    <div style={{position:'fixed', right:16, bottom:16, display:'flex', flexDirection:'column', gap:8, zIndex:9999}}>
      {list.map(t => (
        <div key={t.id} style={{
          padding:'10px 14px', borderRadius:12, minWidth:240,
          background: t.type==='error' ? 'rgba(239,68,68,.1)' : t.type==='warn' ? 'rgba(245,158,11,.1)' : 'rgba(59,130,246,.1)',
          border: `1px solid ${t.type==='error' ? 'rgba(239,68,68,.3)' : t.type==='warn' ? 'rgba(245,158,11,.3)' : 'rgba(59,130,246,.3)'}`,
          color:'#fff', boxShadow:'0 6px 20px rgba(0,0,0,.15)'
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
