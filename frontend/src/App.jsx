// frontend/src/App.jsx
import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'

import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'

// Master
import MasterDashboard from './pages/Master/Dashboard.jsx'
import Hotels from './pages/Master/Hotels.jsx'

// Hotel
import HotelDashboard from './pages/Hotel/Dashboard.jsx'
import Reservations from './pages/Hotel/Reservations.jsx'
import Finance from './pages/Hotel/Finance.jsx'
import Channels from './pages/Hotel/Channels.jsx'
import Rooms from './pages/Hotel/Rooms.jsx' // oda/envanter

// UI: global toast'lar
import Toaster from './components/Toaster.jsx'

/* ----------------- Guards & Helpers ----------------- */
function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  const location = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireRole({ roles = [], children }) {
  const role = localStorage.getItem('role') || 'GUEST'
  if (roles.length && !roles.includes(role)) return <Navigate to="/" replace />
  return children
}

// Master => belirli otelin sayfaları (forceHotelIdForMaster prop'u ile)
function MasterHotelReservations() {
  const { id } = useParams()
  return <Reservations forceHotelIdForMaster={id} />
}
function MasterHotelFinance() {
  const { id } = useParams()
  return <Finance forceHotelIdForMaster={id} />
}
function MasterHotelChannels() {
  const { id } = useParams()
  return <Channels forceHotelIdForMaster={id} />
}

/* Scroll to top every route change */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/* Basit 404 */
function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Sayfa bulunamadı</h2>
      <p>Ana sayfaya dönüyorsunuz…</p>
      <Navigate to="/" replace />
    </div>
  )
}

/* ----------------- App ----------------- */
export default function App() {
  const role = localStorage.getItem('role') || 'GUEST'
  const withLayout = (child) => <Layout role={role}>{child}</Layout>

  return (
    <>
      <ScrollToTop />

      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Root: role'e göre uygun dashboard */}
        <Route
          path="/"
          element={
            <RequireAuth>
              {withLayout(role === 'MASTER_ADMIN' ? <MasterDashboard /> : <HotelDashboard />)}
            </RequireAuth>
          }
        />

        {/* ---------- MASTER ROUTES ---------- */}
        <Route
          path="/master/hotels"
          element={
            <RequireAuth>
              <RequireRole roles={['MASTER_ADMIN']}>
                {withLayout(<Hotels />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/master/hotels/:id/reservations"
          element={
            <RequireAuth>
              <RequireRole roles={['MASTER_ADMIN']}>
                {withLayout(<MasterHotelReservations />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/master/hotels/:id/finance"
          element={
            <RequireAuth>
              <RequireRole roles={['MASTER_ADMIN']}>
                {withLayout(<MasterHotelFinance />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/master/hotels/:id/channels"
          element={
            <RequireAuth>
              <RequireRole roles={['MASTER_ADMIN']}>
                {withLayout(<MasterHotelChannels />)}
              </RequireRole>
            </RequireAuth>
          }
        />

        {/* ---------- HOTEL ROUTES ---------- */}
        <Route
          path="/hotel/reservations"
          element={
            <RequireAuth>
              <RequireRole roles={['HOTEL_ADMIN', 'HOTEL_STAFF']}>
                {withLayout(<Reservations />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/hotel/finance"
          element={
            <RequireAuth>
              <RequireRole roles={['HOTEL_ADMIN', 'HOTEL_STAFF']}>
                {withLayout(<Finance />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/hotel/channels"
          element={
            <RequireAuth>
              <RequireRole roles={['HOTEL_ADMIN', 'HOTEL_STAFF']}>
                {withLayout(<Channels />)}
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/hotel/rooms"
          element={
            <RequireAuth>
              <RequireRole roles={['HOTEL_ADMIN', 'HOTEL_STAFF']}>
                {withLayout(<Rooms />)}
              </RequireRole>
            </RequireAuth>
          }
        />

        {/* Fallbacks */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global tost bildirimleri */}
      <Toaster />
    </>
  )
}
