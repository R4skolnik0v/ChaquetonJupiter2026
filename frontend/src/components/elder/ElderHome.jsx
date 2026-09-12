import React, { useEffect, useState } from "react";
import { List, CalendarClock, Sparkles, LifeBuoy, CircleCheck, TriangleAlert } from "lucide-react";
import { api } from "../../api.js";
import { formatMoney, formatDateLong, CATEGORY_ICONS } from "../../utils.js";

export default function ElderHome({ userId, onNavigate }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.getSummary(userId).then(setSummary);
  }, [userId]);

  if (!summary) {
    return <p style={{ fontSize: "1.1rem", color: "var(--ink-soft)" }}>Cargando tu información…</p>;
  }

  const firstName = summary.name.split(" ")[0];

  return (
    <div>
      <h1 className="elder-greeting">Buenos días, {firstName} 👋</h1>

      <div className="elder-balance-card">
        <p className="elder-balance-label">Disponible</p>
        <p className="elder-balance-amount">{formatMoney(summary.available_balance)}</p>
        <div className="elder-balance-sub">
          Este mes has gastado <strong>{formatMoney(summary.spent_this_month)}</strong>
        </div>
      </div>

      <div className={`elder-status-banner ${summary.all_normal ? "ok" : "review"}`}>
        {summary.all_normal ? <CircleCheck size={22} /> : <TriangleAlert size={22} />}
        {summary.all_normal ? "Todo parece normal" : "Hay algo que queremos que revises"}
      </div>

      {summary.upcoming_payments.length > 0 && (
        <>
          <h2 className="elder-section-title">Próximos pagos</h2>
          {summary.upcoming_payments.slice(0, 2).map((p) => (
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
        </>
      )}

      <div className="elder-actions">
        <button className="elder-button" onClick={() => onNavigate("movements")}>
          Ver mis movimientos <List size={22} />
        </button>
        <button className="elder-button" onClick={() => onNavigate("upcoming")}>
          Mis próximos pagos <CalendarClock size={22} />
        </button>
        <button className="elder-button" onClick={() => onNavigate("explain")}>
          Explícame mis gastos <Sparkles size={22} />
        </button>
        <button className="elder-button primary" onClick={() => onNavigate("help")}>
          Ayuda <LifeBuoy size={22} />
        </button>
      </div>
    </div>
  );
}
