// frontend/src/components/Layout.jsx
import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

function classNames(...xs) {
  return xs.filter(Boolean).join(' ')
}

const MENUS = {
  MASTER_ADMIN: [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/master/hotels', label: 'Oteller' },
  ],
  DEFAULT_HOTEL: [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/hotel/reservations', label: 'Rezervasyonlar' },
    { to: '/hotel/finance', label: 'Gelir-Gider' },
    { to: '/hotel/channels', label: 'Kanallar' },
    { to: '/hotel/rooms', label: 'Odalar' }, // 👈 yeni
  ],
}

function roleLabel(role) {
  if (role === 'MASTER_ADMIN') return 'Master Admin'
  if (role === 'HOTEL_ADMIN') return 'Otel Admin'
  if (role === 'HOTEL_STAFF') return 'Personel'
  return role || 'Kullanıcı'
}

export default function Layout({ children, role }) {
  const navigate = useNavigate()
  const email = localStorage.getItem('email') || ''

  const logout = () => {
    // İleride sadece auth anahtarlarını silmek istersen burada seçici temizleyebilirsin.
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  const menu =
    role === 'MASTER_ADMIN'
      ? MENUS.MASTER_ADMIN
      : MENUS.DEFAULT_HOTEL

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand" title="HMS & Channels">
          <span className="dot" /> HMS & Channels
        </div>

        {/* Kullanıcı kutusu */}
        <div className="userbox">
          <div className="user-meta">
            <div className="user-email" title={email}>{email || '—'}</div>
            <div className="user-role">{roleLabel(role)}</div>
          </div>
        </div>

        {/* Navigasyon */}
        <nav className="nav">
          {menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={!!item.exact}
              className={({ isActive }) =>
                classNames('nav-link', isActive && 'active')
              }
            >
              {item.label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={logout}
            className="nav-link logout"
            aria-label="Çıkış yap"
          >
            Çıkış
          </button>
        </nav>
      </aside>

      {/* İçerik */}
      <div className="main">
        <header className="header">
          <div className="muted">Hoş geldiniz</div>
          <div className="header-right">{email}</div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
