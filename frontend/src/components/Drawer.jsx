import React from "react";

export default function Drawer({ open, onClose, title, children, width = 460 }) {
  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }}
      />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          background: "#0b1220",
          borderLeft: "1px solid rgba(255,255,255,.08)",
          boxShadow: "-10px 0 40px rgba(0,0,0,.35)",
          padding: 16,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div className="label">{title}</div>
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
