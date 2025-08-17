import React from 'react'
export default function Header({ title, subtitle, right }){
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div>
        <div className="muted" style={{fontSize:12}}>{subtitle}</div>
        <h2 style={{margin:'6px 0'}}>{title}</h2>
      </div>
      <div>{right}</div>
    </div>
  )
}