import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney, formatDateTime, CATEGORY_ICONS, STATUS_LABEL_ES } from "../../utils.js";

export default function AuditTrail({ userId }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    api.getAuditTrail(userId).then(setEntries);
  }, [userId]);

  if (!entries) return <p>Cargando…</p>;

  return (
    <div>
      <div className="family-header">
        <h1>Qué pasó con el dinero</h1>
        <p>Cada decisión, con su explicación — la misma información que ve María, con más detalle.</p>
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>
          Todavía no se ha registrado ninguna decisión. Ve a "Resumen" y simula una transacción para ver cómo se llena
          esta bitácora en tiempo real.
        </p>
      ) : (
        <div className="ledger">
          {entries.map((e) => (
            <div key={e.id} className={`ledger-row ${e.action}`} style={{ cursor: "default" }}>
              <div className="ledger-row__main">
                <div className="ledger-row__top">
                  <div>
                    <div className="ledger-row__merchant">
                      {CATEGORY_ICONS[e.category] || ""} {e.merchant} — {e.category}
                    </div>
                    <div className="ledger-row__meta">{formatDateTime(e.timestamp)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ledger-row__amount">{formatMoney(e.amount)}</span>
                    <span className={`status-pill ${e.action}`}>{STATUS_LABEL_ES[e.action] || e.action}</span>
                  </div>
                </div>
                <div className="ledger-row__explain">
                  ¿Por qué?
                  <ul>
                    {e.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
