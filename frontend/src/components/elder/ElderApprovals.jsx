import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

// Where the account owner sees what their family is asking for, and stays
// the one who decides. The family member can request; only this screen
// can grant it.
export default function ElderApprovals({ userId, onResolved }) {
  const [requests, setRequests] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setRequests(await api.listExceptions(userId, "pending"));
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  async function resolve(id, decision) {
    setBusyId(id);
    try {
      await api.resolveException(id, decision, "el adulto mayor");
      await refresh();
      onResolved?.();
    } finally {
      setBusyId(null);
    }
  }

  if (!requests) return <p>Cargando…</p>;

  if (requests.length === 0) {
    return <p style={{ fontSize: "1.1rem", color: "var(--ink-soft)" }}>No tienes solicitudes pendientes por ahora.</p>;
  }

  return (
    <div>
      {requests.map((r) => (
        <div className="elder-approval-card" key={r.id}>
          <p>
            <strong>{r.requested_by}</strong> quiere realizar un pago de <strong>{formatMoney(r.amount)}</strong> a {r.merchant}.
            <br />
            Esto es más de lo que tiene autorizado para {r.category}.
          </p>
          <div className="elder-approval-actions">
            <button className="approve" disabled={busyId === r.id} onClick={() => resolve(r.id, "approved")}>
              Aprobar una vez
            </button>
            <button className="deny" disabled={busyId === r.id} onClick={() => resolve(r.id, "denied")}>
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
