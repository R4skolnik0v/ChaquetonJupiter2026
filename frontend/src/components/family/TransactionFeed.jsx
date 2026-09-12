import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatMoney, formatDateTime, CATEGORY_ICONS, STATUS_LABEL_ES } from "../../utils.js";

export default function TransactionFeed({ transactions, highlightId }) {
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    if (highlightId) setExpanded((prev) => new Set(prev).add(highlightId));
  }, [highlightId]);

  if (!transactions || transactions.length === 0) {
    return <div className="ledger" style={{ padding: 24, color: "var(--ink-soft)" }}>Todavía no hay transacciones.</div>;
  }

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="ledger">
      {transactions.map((t) => {
        const isOpen = expanded.has(t.id);
        return (
          <div key={t.id} className={`ledger-row ${t.status}`} onClick={() => toggle(t.id)}>
            <div className="ledger-row__main">
              <div className="ledger-row__top">
                <div>
                  <div className="ledger-row__merchant">
                    {CATEGORY_ICONS[t.category] || ""} {t.merchant}
                  </div>
                  <div className="ledger-row__meta">
                    {t.category} · {formatDateTime(t.timestamp)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ledger-row__amount">{formatMoney(t.amount)}</span>
                  <span className={`status-pill ${t.status}`}>{STATUS_LABEL_ES[t.status] || t.status}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {isOpen && (
                <div className="ledger-row__explain">
                  ¿Por qué?
                  <ul>
                    {t.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  {t.comparison && (
                    <div className="ledger-row__compare">
                      "Esta operación es diferente a lo habitual." Normalmente {t.category} cuesta alrededor de{" "}
                      {formatMoney(t.comparison.baselineAvg ?? t.comparison.baseline_avg)}. Esta operación es de{" "}
                      {formatMoney(t.comparison.amount)} ({t.comparison.multiplier}× más).
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
