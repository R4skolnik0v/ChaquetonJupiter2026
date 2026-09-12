import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney, formatDateLong, CATEGORY_ICONS } from "../../utils.js";

export default function ElderMovements({ userId }) {
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    api.listTransactions(userId).then(setTransactions);
  }, [userId]);

  if (!transactions) return <p>Cargando…</p>;

  if (transactions.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>Todavía no hay movimientos este mes.</p>;
  }

  return (
    <div className="elder-balance-card">
      {transactions.map((t) => (
        <div className="elder-movement-row" key={t.id}>
          <div>
            <div className="merchant">
              {CATEGORY_ICONS[t.category] || ""} {t.merchant}
            </div>
            <div className="cat">{formatDateLong(t.timestamp)}</div>
            {t.status === "BLOCKED" && <div className="cat" style={{ color: "var(--red)" }}>Esto no se realizó.</div>}
            {t.status === "REVIEW" && <div className="cat" style={{ color: "var(--amber)" }}>Queremos que lo revises.</div>}
          </div>
          <div className="elder-movement-amount">{formatMoney(t.amount)}</div>
        </div>
      ))}
    </div>
  );
}
