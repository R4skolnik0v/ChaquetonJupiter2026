import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

const STATUS_COPY = {
  no_configurado: { label: "No configurado", tone: "ok" },
  configurado: { label: "Configurado, en espera", tone: "review" },
  activo: { label: "Activo", tone: "ok" },
  expirado: { label: "Expiró", tone: "review" },
};

// Read/act, never "family decides": this screen only ever calls
// activate/deactivate on the owner's own say-so. Configuring it for the
// first time, or changing who's covered, goes through the same "¿Quieres
// cambiar algo?" box as everything else -- see the "Configurar" / "Cambiar
// esto" buttons below, which just hand off to it with a starting example.
export default function ElderContinuity({ userId, onOpenIntentBox }) {
  const [rule, setRule] = useState(undefined); // undefined = loading, null = none configured
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRule(await api.getContinuity(userId));
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

  if (rule === undefined) return <p>Cargando…</p>;

  if (!rule) {
    return (
      <div className="elder-balance-card">
        <p style={{ fontSize: "1.1rem", margin: "0 0 16px" }}>
          Todavía no tienes un plan para "¿qué pasa si no puedo administrar mis finanzas por un tiempo?".
        </p>
        <div className="elder-actions">
          <button
            className="elder-button primary"
            onClick={() => onOpenIntentBox("Si no puedo administrar mis finanzas durante 30 días, quiero que Laura pueda pagar mis servicios y medicamentos.")}
          >
            Configurar continuidad
          </button>
        </div>
      </div>
    );
  }

  const status = STATUS_COPY[rule.status] || STATUS_COPY.configurado;

  return (
    <div>
      <div className="elder-balance-card">
        <p style={{ fontSize: "1.1rem", margin: "0 0 4px", fontWeight: 600 }}>{rule.trigger_label}</p>
        <div className={`elder-status-banner ${status.tone}`} style={{ marginTop: 12 }}>
          {status.label}
        </div>

        <div style={{ marginTop: 18 }}>
          <p style={{ margin: "8px 0", fontSize: "1.02rem" }}>👤 Encargado: <strong>{rule.delegate_name}</strong></p>
          {rule.backup_name && <p style={{ margin: "8px 0", fontSize: "1.02rem" }}>🛟 Respaldo: <strong>{rule.backup_name}</strong></p>}
          <p style={{ margin: "8px 0", fontSize: "1.02rem" }}>💰 Límite: <strong>{formatMoney(rule.monthly_limit)} al mes</strong></p>
          <p style={{ margin: "8px 0", fontSize: "1.02rem" }}>✅ Permitido: <strong>{rule.allowed_categories.join(", ")}</strong></p>
        </div>

        <div className="elder-actions" style={{ marginTop: 20 }}>
          {rule.status === "activo" ? (
            <button className="elder-button primary" disabled={busy} onClick={deactivate}>
              {busy ? "Un momento…" : "Desactivar ahora"} <ShieldOff size={20} />
            </button>
          ) : (
            <button className="elder-button primary" disabled={busy} onClick={activate}>
              {busy ? "Un momento…" : "Activar ahora"} <ShieldCheck size={20} />
            </button>
          )}
          <button
            className="elder-button"
            onClick={() => onOpenIntentBox(`Quiero cambiar mi plan de continuidad: que ${rule.delegate_name} pueda ayudarme con ${rule.allowed_categories.join(", ")}.`)}
          >
            Cambiar esto
          </button>
        </div>
      </div>

      <p className="section-note" style={{ marginTop: 14 }}>
        Solo tú puedes activar, cambiar o desactivar este plan. Mientras esté activo, funciona como una misión
        normal: pasa por las mismas reglas que cualquier otro pago.
      </p>
    </div>
  );
}
