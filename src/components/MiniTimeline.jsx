import React from "react";

// 14 günlük mini şerit: konaklama aralığını boyar
export default function MiniTimeline({ checkIn, checkOut, baseDate = new Date() }) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  // haftanın pazartesisine yasla
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);

  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
    });

  const ci = new Date(checkIn); ci.setHours(0,0,0,0);
  const co = new Date(checkOut); co.setHours(0,0,0,0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(14,1fr)", gap: 2, minWidth: 180 }}>
      {days.map((d, i) => {
        const inStay = d >= ci && d < co;
        return (
          <div
            key={i}
            title={d.toLocaleDateString()}
            style={{
              height: 8,
              borderRadius: 3,
              background: inStay ? "rgba(59,130,246,.9)" : "rgba(255,255,255,.08)",
            }}
          />
        );
      })}
    </div>
  );
}
