import React, { useEffect, useState } from "react";
import { api } from "../../api.js";

// Read-only, on purpose: who's trusted, and what they're allowed to do, is
// the account owner's decision (Elder Mode -> "Personas que me ayudan").
// A family member showing up here never got to add themselves, and can't
// add anyone else either.
export default function TrustNetwork({ userId }) {
  const [members, setMembers] = useState(null);
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    api.getTrustNetwork(userId).then(setMembers);
    api.getSummary(userId).then((s) => setOwnerName(s.name));
  }, [userId]);

  if (!members) return <p>Cargando…</p>;

  return (
    <div>
      <div className="family-header">
        <h1>Red de confianza</h1>
        <p>Solo {ownerName || "el adulto mayor"} puede agregar o quitar personas de aquí. Estar en la lista no da poder de gasto por sí solo — eso solo lo otorga una misión activa.</p>
      </div>

      <div className="trust-grid">
        {members.map((m) => (
          <div className="trust-card" key={m.id}>
            <div className="name">{m.name}</div>
            <div className="relationship">
              {m.relationship} · {m.role}
            </div>
            <div className="perms">
              <span>{m.can_pay_bills ? "✓" : "✕"} Puede pagar servicios (si tiene una misión activa)</span>
              <span>{m.can_review_alerts ? "✓" : "✕"} Puede revisar alertas</span>
              <span>✕ Puede cambiar beneficiarios</span>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>{ownerName || "El adulto mayor"} todavía no ha agregado a nadie.</p>
        )}
      </div>
    </div>
  );
}
