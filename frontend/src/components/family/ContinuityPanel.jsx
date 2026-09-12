import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

export default function ContinuityPanel({ userId }) {
  const [rule, setRule] = useState(null);
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [r, summary] = await Promise.all([api.getContinuity(userId), api.getSummary(userId)]);
    setRule(r);
    setOwnerName(summary.name);
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  async function activate() {
    setBusy(true);
    try {
      await api.activateContinuity(userId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      await api.deactivateContinuity(userId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (rule === null) return <p>Cargando…</p>;

  if (!rule) {
    return (
      <div>
        <div className="family-header">
          <h1>Continuidad financiera</h1>
        </div>
        <p>{ownerName || "El adulto mayor"} todavía no ha configurado un plan de continuidad.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="family-header">
        <h1>Continuidad financiera</h1>
        <p>"¿Qué pasa si {ownerName || "el adulto mayor"} no puede administrar su dinero temporalmente?" — un plan que ya quedó autorizado por ella o él.</p>
      </div>

      <div className={`continuity-card ${rule.active ? "active" : ""}`}>
        <div className="continuity-status">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem" }}>{rule.trigger_label}</p>
            <p className="section-note" style={{ marginTop: 4 }}>
              {rule.active ? `Activo desde ${new Date(rule.activated_at).toLocaleString("es-MX")}` : "Actualmente inactivo"}
            </p>
          </div>
          {rule.active ? (
            <span className="status-pill APPROVED">Activo</span>
          ) : (
            <span className="status-pill SCHEDULED">En espera</span>
          )}
        </div>

        <div className="permission-grid">
          <div className="permission-list">
            <h4>Encargado</h4>
            <p style={{ margin: 0, fontWeight: 600 }}>{rule.delegate_name}</p>
          </div>
          <div className="permission-list">
            <h4>Respaldo</h4>
            <p style={{ margin: 0, fontWeight: 600 }}>{rule.backup_name}</p>
          </div>
          <div className="permission-list">
            <h4>Límite mensual</h4>
            <p style={{ margin: 0, fontWeight: 600 }}>{formatMoney(rule.monthly_limit)}</p>
          </div>
        </div>

        <div className="permission-list" style={{ marginTop: 14 }}>
          <h4>Categorías permitidas</h4>
          <ul>
            {rule.allowed_categories.map((c) => (
              <li key={c} className="allowed">
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 18 }}>
          {rule.active ? (
            <button className="btn-secondary" onClick={deactivate} disabled={busy}>
              <ShieldOff size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Terminar continuidad ahora
            </button>
          ) : (
            <button className="btn-primary" onClick={activate} disabled={busy}>
              <ShieldCheck size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Activar continuidad
            </button>
          )}
        </div>
      </div>

      <p className="section-note" style={{ marginTop: 14 }}>
        Activar esto crea una misión normal con estas reglas — pasa por el mismo Decision Engine que cualquier otra
        transacción. Cuando termina el periodo (o se desactiva a mano), todo vuelve automáticamente a la normalidad.
      </p>
    </div>
  );
}
