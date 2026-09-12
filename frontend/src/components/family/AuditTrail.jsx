import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney, formatDateTime, CATEGORY_ICONS, STATUS_LABEL_ES, INTENT_LABEL_ES } from "../../utils.js";

export default function AuditTrail({ userId }) {
  const [entries, setEntries] = useState(null);
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    api.getAuditTrail(userId).then(setEntries);
    api.getSummary(userId).then((s) => setOwnerName(s.name));
  }, [userId]);

  if (!entries) return <p>Cargando…</p>;

  return (
    <div>
      <div className="family-header">
        <h1>Qué pasó con el dinero</h1>
        <p>
          Cada decisión y cada cambio que {ownerName || "el adulto mayor"} hizo a sus permisos, con su explicación.
        </p>
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>
          Todavía no se ha registrado ninguna decisión. Ve a "Resumen" y simula una transacción para ver cómo se llena
          esta bitácora en tiempo real.
        </p>
      ) : (
        <div className="ledger">
          {entries.map((e) => {
            const isAccountChange = e.kind === "account_change";
            return (
              <div key={e.id} className={`ledger-row ${isAccountChange ? "" : e.action}`} style={{ cursor: "default" }}>
                <div className="ledger-row__main">
                  <div className="ledger-row__top">
                    <div>
                      <div className="ledger-row__merchant">
                        {isAccountChange ? "⚙️ " : `${CATEGORY_ICONS[e.category] || ""} `}
                        {isAccountChange ? (INTENT_LABEL_ES[e.action] || e.action) : `${e.merchant} — ${e.category}`}
                      </div>
                      <div className="ledger-row__meta">{formatDateTime(e.timestamp)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {!isAccountChange && <span className="ledger-row__amount">{formatMoney(e.amount)}</span>}
                      {!isAccountChange && <span className={`status-pill ${e.action}`}>{STATUS_LABEL_ES[e.action] || e.action}</span>}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
