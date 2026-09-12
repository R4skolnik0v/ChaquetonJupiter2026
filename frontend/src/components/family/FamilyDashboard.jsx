import React, { useEffect, useState, useCallback } from "react";
import { Zap } from "lucide-react";
import { api, usingLocalFallback } from "../../api.js";
import { formatMoney } from "../../utils.js";
import TransactionFeed from "./TransactionFeed.jsx";

const CATEGORY_OPTIONS = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado", "Transferencia", "Retiro"];

export default function FamilyDashboard({ userId, scenarioMeta }) {
  const [summary, setSummary] = useState(null);
  const [missions, setMissions] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [highlightId, setHighlightId] = useState(null);
  const [offline, setOffline] = useState(false);
  const [customForm, setCustomForm] = useState({ merchant: "", category: "CFE", amount: "" });
  const [busy, setBusy] = useState(false);

  // Missions are ordered most-recent-first by the API. The "current" one is
  // whichever is most recent, regardless of whether it's still active --
  // that's what lets us tell the difference between "never had a mission"
  // and "had one, but it expired or ended".
  const currentMission = missions?.[0] || null;
  const missionIsLive = currentMission?.status === "active";

  const refresh = useCallback(async () => {
    const [s, m, exc] = await Promise.all([
      api.getSummary(userId),
      api.listMissions(userId),
      api.listExceptions(userId),
    ]);
    setSummary(s);
    setMissions(m);
    setExceptions(exc);
    const live = m.find((x) => x.status === "active");
    const txs = await api.listTransactions(userId, live?.id);
    setTransactions(txs);
    setOffline(usingLocalFallback);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function fire(merchant, category, amount) {
    if (!missionIsLive) return;
    setBusy(true);
    try {
      const result = await api.simulateTransaction({
        user_id: userId, merchant, category, amount: Number(amount), mission_id: currentMission.id,
      });
      setHighlightId(result.id);
      await refresh();
      // listTransactions round-trips through storage, which doesn't keep the
      // anomaly comparison (only the human-readable reasons are persisted) --
      // stitch it back onto the row we just created so the live "wow moment"
      // callout still renders right away, this one time.
      if (result.comparison) {
        setTransactions((prev) => prev.map((t) => (t.id === result.id ? { ...t, comparison: result.comparison } : t)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestException(tx) {
    await api.requestException({
      user_id: userId,
      mission_id: tx.mission_id || currentMission?.id,
      merchant: tx.merchant,
      category: tx.category,
      amount: tx.amount,
      requested_by: currentMission?.delegate_name || scenarioMeta?.delegate_name || "tu familiar",
    });
    const exc = await api.listExceptions(userId);
    setExceptions(exc);
  }

  if (!missions || !summary) return <p>Cargando…</p>;

  const delegateLabel = currentMission?.delegate_name || scenarioMeta?.delegate_name || "tu familiar";
  const presets = scenarioMeta?.presets || [];

  return (
    <div>
      <div className="family-header">
        <h1>Resumen de {summary.name}</h1>
        <p>Vista para {delegateLabel}, quien la está ayudando con sus finanzas.</p>
      </div>

      {offline && (
        <div className="offline-banner">
          No se pudo conectar con la API — mostrando datos de demostración locales (mismo motor de decisión, en el navegador).
        </div>
      )}

      <div className="family-stat-row">
        <div className="family-stat">
          <div className="label">Disponible</div>
          <div className="value">{formatMoney(summary.available_balance)}</div>
        </div>
        {missionIsLive && (
          <div className="family-stat">
            <div className="label">Gastado bajo la misión (este mes)</div>
            <div className="value">{formatMoney(currentMission.spent_this_month)}</div>
            <div className="delta flat">de {formatMoney(currentMission.monthly_limit)} autorizados</div>
          </div>
        )}
        <div className="family-stat">
          <div className="label">Estado general</div>
          <div className="value" style={{ color: summary.all_normal ? "var(--green)" : "var(--amber)" }}>
            {summary.all_normal ? "Normal" : "Hay algo que revisar"}
          </div>
        </div>
      </div>

      {!currentMission && (
        <div className="mission-card">
          <p style={{ margin: 0 }}>
            <strong>{summary.name}</strong> todavía no te ha autorizado una misión. En cuanto lo haga desde su propia
            cuenta, vas a ver aquí exactamente qué puedes hacer y con qué límites.
          </p>
        </div>
      )}

      {currentMission && !missionIsLive && (
        <div className="mission-card">
          <p style={{ margin: 0 }}>
            Tu misión con <strong>{summary.name}</strong> ({currentMission.purpose}) ya no está activa
            {currentMission.status === "expired" ? " — venció el " + new Date(currentMission.end_date).toLocaleDateString("es-MX") : "."}
            {" "}Pídele que autorice una nueva desde su cuenta si necesita más ayuda.
          </p>
        </div>
      )}

      {missionIsLive && <MissionCard mission={currentMission} />}

      {exceptions.length > 0 && (
        <>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Tus solicitudes de excepción</h2>
          <div className="ledger" style={{ marginBottom: 24 }}>
            {exceptions.map((e) => (
              <div key={e.id} className="ledger-row" style={{ cursor: "default" }}>
                <div className="ledger-row__main">
                  <div className="ledger-row__top">
                    <div>
                      <div className="ledger-row__merchant">{e.merchant} — {formatMoney(e.amount)}</div>
                      <div className="ledger-row__meta">{e.category}</div>
                    </div>
                    <span
                      className={`status-pill ${e.status === "pending" ? "SCHEDULED" : e.status === "approved" ? "APPROVED" : "BLOCKED"}`}
                    >
                      {e.status === "pending" ? "Esperando a " + summary.name : e.status === "approved" ? "Aprobada" : "Rechazada"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {missionIsLive && (
        <>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Simular transacción entrante</h2>
          <p className="section-note" style={{ marginTop: -6, marginBottom: 14 }}>
            Así es como llegarían los datos de Capital One / Nessie. Cada botón envía una transacción real al Decision
            Engine y verás la decisión aparecer abajo, con su explicación.
          </p>
          {presets.length > 0 && (
            <div className="simulate-panel">
              {presets.map((p) => (
                <button key={p.label} className="simulate-btn" disabled={busy} onClick={() => fire(p.merchant, p.category, p.amount)}>
                  <Zap size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {p.label}
                </button>
              ))}
            </div>
          )}

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
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <TransactionFeed transactions={transactions} highlightId={highlightId} onRequestException={requestException} />
        </>
      )}
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
            {mission.per_transaction_limit ? ` — hasta ${formatMoney(mission.per_transaction_limit)} por transacción` : ""}
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
            {mission.allowed_categories.map((c) => <li key={c} className="allowed">{c}</li>)}
          </ul>
        </div>
        <div className="permission-list">
          <h4>No permitido</h4>
          <ul>
            {mission.forbidden_actions.map((c) => <li key={c} className="forbidden">{c}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
