import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney, formatDateLong, CATEGORY_ICONS } from "../../utils.js";

export default function ElderUpcoming({ userId }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.getSummary(userId).then(setSummary);
  }, [userId]);

  if (!summary) return <p>Cargando…</p>;

  if (summary.upcoming_payments.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>No tienes pagos próximos por ahora.</p>;
  }

  return (
    <div>
      {summary.upcoming_payments.map((p) => (
        <div className="elder-payment-row" key={p.id}>
          <div>
            <div className="name">
              {CATEGORY_ICONS[p.category] || ""} {p.merchant}
            </div>
            <div className="date">{formatDateLong(p.timestamp)}</div>
          </div>
          <div className="amount">{formatMoney(p.amount)}</div>
        </div>
      ))}
    </div>
  );
}
