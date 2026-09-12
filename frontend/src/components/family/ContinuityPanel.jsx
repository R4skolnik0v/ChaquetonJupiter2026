import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

const STATUS_LABEL = {
  no_configurado: "No configurado",
  configurado: "Configurado, en espera",
  activo: "Activo",
  expirado: "Expiró",
};

const STATUS_PILL_CLASS = {
  no_configurado: "SCHEDULED",
  configurado: "SCHEDULED",
  activo: "APPROVED",
  expirado: "BLOCKED",
};

// Read-only, on purpose: continuity is a plan the account owner authorizes
// for themselves. The family member can see it so they know what to expect,
// but only the owner can create, change, activate, or turn it off -- that
// happens in Elder Mode (components/elder/ElderContinuity.jsx).
export default function ContinuityPanel({ userId }) {
  const [rule, setRule] = useState(undefined); // undefined = loading, null = loaded-but-none
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getContinuity(userId), api.getSummary(userId)])
      .then(([r, summary]) => {
        if (cancelled) return;
        setRule(r);
        setOwnerName(summary.name);
      })
      .catch(() => {
        if (!cancelled) setRule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (rule === undefined) return <p>Cargando…</p>;

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
        <p>"¿Qué pasa si {ownerName || "el adulto mayor"} no puede administrar su dinero temporalmente?" — un plan que {ownerName || "el adulto mayor"} configuró y controla.</p>
      </div>

      <div className={`continuity-card ${rule.status === "activo" ? "active" : ""}`}>
        <div className="continuity-status">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem" }}>{rule.trigger_label}</p>
            <p className="section-note" style={{ marginTop: 4 }}>
              {rule.status === "activo" && rule.activated_at ? `Activo desde ${new Date(rule.activated_at).toLocaleString("es-MX")}` : STATUS_LABEL[rule.status]}
            </p>
          </div>
          <span className={`status-pill ${STATUS_PILL_CLASS[rule.status]}`}>{STATUS_LABEL[rule.status]}</span>
        </div>

        <div className="permission-grid">
          <div className="permission-list">
            <h4>Encargado</h4>
            <p style={{ margin: 0, fontWeight: 600 }}>{rule.delegate_name}</p>
          </div>
          <div className="permission-list">
            <h4>Respaldo</h4>
            <p style={{ margin: 0, fontWeight: 600 }}>{rule.backup_name || "—"}</p>
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
              <li key={c} className="allowed">{c}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="section-note" style={{ marginTop: 14 }}>
        {rule.status === "activo"
          ? "Mientras esté activo, esto funciona como una misión normal: pasa por el mismo Decision Engine que cualquier otra transacción."
          : `Solo ${ownerName || "el adulto mayor"} puede activar, cambiar o desactivar este plan.`}
      </p>
    </div>
  );
}
