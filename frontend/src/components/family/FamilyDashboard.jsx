import React, { useEffect, useState, useCallback } from "react";
import { Zap } from "lucide-react";
import { api, usingLocalFallback } from "../../api.js";
import { formatMoney } from "../../utils.js";
import TransactionFeed from "./TransactionFeed.jsx";

const PRESETS = [
  { label: "CFE — $183 (normal)", merchant: "CFE", category: "CFE", amount: 183 },
  { label: "Farmacia — $420 (normal)", merchant: "Farmacia San Pablo", category: "Farmacia", amount: 420 },
  { label: "Transferencia — $5,000", merchant: "Transferencia SPEI", category: "Transferencia", amount: 5000 },
  { label: "CFE — $1,420 (inusual)", merchant: "CFE", category: "CFE", amount: 1420 },
];

const CATEGORY_OPTIONS = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado", "Transferencia", "Retiro"];

export default function FamilyDashboard({ userId, onCreateMission }) {
  const [missions, setMissions] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [highlightId, setHighlightId] = useState(null);
  const [offline, setOffline] = useState(false);
  const [customForm, setCustomForm] = useState({ merchant: "", category: "CFE", amount: "" });
  const [busy, setBusy] = useState(false);

  const activeMission = missions?.find((m) => m.status === "active") || null;

  const refresh = useCallback(async () => {
    const m = await api.listMissions(userId);
    setMissions(m);
    const active = m.find((x) => x.status === "active");
    const txs = await api.listTransactions(userId, active?.id);
    setTransactions(txs);
    setOffline(usingLocalFallback);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function fire(merchant, category, amount) {
    if (!activeMission) return;
    setBusy(true);
    try {
      const result = await api.simulateTransaction({
        user_id: userId,
        merchant,
        category,
        amount: Number(amount),
        mission_id: activeMission.id,
      });
      setHighlightId(result.id);
      await refresh();
      // listTransactions doesn't persist the anomaly comparison (only the
      // human-readable reasons are stored) -- stitch it back onto the row
      // we just created so the live "wow moment" callout still renders.
      if (result.comparison) {
        setTransactions((prev) => prev.map((t) => (t.id === result.id ? { ...t, comparison: result.comparison } : t)));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!missions) return <p>Cargando…</p>;

  return (
    <div>
      <div className="family-header">
        <h1>Resumen de María</h1>
        <p>Vista para quien la está ayudando con sus finanzas.</p>
      </div>

      {offline && (
        <div className="offline-banner">
          No se pudo conectar con la API — mostrando datos de demostración locales (mismo motor de decisión, en el navegador).
        </div>
      )}

      <div className="family-stat-row">
        <div className="family-stat">
          <div className="label">Disponible</div>
          <div className="value">$12,430</div>
        </div>
        {activeMission && (
          <div className="family-stat">
            <div className="label">Gastado bajo la misión (este mes)</div>
            <div className="value">{formatMoney(activeMission.spent_this_month)}</div>
            <div className="delta flat">de {formatMoney(activeMission.monthly_limit)} autorizados</div>
          </div>
        )}
        <div className="family-stat">
          <div className="label">Estado general</div>
          <div className="value" style={{ color: "var(--green)" }}>
            Normal
          </div>
        </div>
      </div>

      {!activeMission ? (
        <div className="mission-card">
          <p>Laura todavía no tiene una misión activa.</p>
          <button className="btn-primary" onClick={onCreateMission}>
            Crear una misión
          </button>
        </div>
      ) : (
        <MissionCard mission={activeMission} />
      )}

      <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Simular transacción entrante</h2>
      <p className="section-note" style={{ marginTop: -6, marginBottom: 14 }}>
        Así es como llegarían los datos de Capital One / Nessie. Cada botón envía una transacción real al Decision
        Engine y verás la decisión aparecer abajo, con su explicación.
      </p>
      <div className="simulate-panel">
        {PRESETS.map((p) => (
          <button key={p.label} className="simulate-btn" disabled={busy} onClick={() => fire(p.merchant, p.category, p.amount)}>
            <Zap size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {p.label}
          </button>
        ))}
      </div>

      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.88rem", color: "var(--ink-soft)" }}>
          Simular una transacción personalizada
        </summary>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <input
            placeholder="Comercio"
            value={customForm.merchant}
            onChange={(e) => setCustomForm({ ...customForm, merchant: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)" }}
          />
          <select
            value={customForm.category}
            onChange={(e) => setCustomForm({ ...customForm, category: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)" }}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Monto"
            value={customForm.amount}
            onChange={(e) => setCustomForm({ ...customForm, amount: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--line)", width: 120 }}
          />
          <button
            className="btn-secondary"
            disabled={busy || !customForm.merchant || !customForm.amount}
            onClick={() => fire(customForm.merchant, customForm.category, customForm.amount)}
          >
            Enviar
          </button>
        </div>
      </details>

      <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Transacciones de la misión</h2>
      <TransactionFeed transactions={transactions} highlightId={highlightId} />
    </div>
  );
}

function MissionCard({ mission }) {
  const pct = Math.min(100, Math.round((mission.spent_this_month / mission.monthly_limit) * 100));
  return (
    <div className="mission-card">
      <div className="mission-card__top">
        <div>
          <p className="mission-card__title">{mission.delegate_name} → {mission.purpose}</p>
          <p className="mission-card__meta">
            Del {new Date(mission.start_date).toLocaleDateString("es-MX")} al{" "}
            {new Date(mission.end_date).toLocaleDateString("es-MX")}
          </p>
        </div>
        <div className="mission-card__limit">
          <div className="used">{formatMoney(mission.spent_this_month)}</div>
          <div className="cap">de {formatMoney(mission.monthly_limit)} / mes</div>
        </div>
      </div>
      <div className="limit-bar">
        <div className="limit-bar__fill" style={{ width: `${pct}%`, background: pct > 85 ? "var(--amber)" : "var(--steel)" }} />
      </div>
      <div className="permission-grid">
        <div className="permission-list">
          <h4>Permitido</h4>
          <ul>
            {mission.allowed_categories.map((c) => (
              <li key={c} className="allowed">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="permission-list">
          <h4>No permitido</h4>
          <ul>
            {mission.forbidden_actions.map((c) => (
              <li key={c} className="forbidden">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
