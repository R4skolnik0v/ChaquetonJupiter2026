import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "../../api.js";

export default function TrustNetwork({ userId }) {
  const [members, setMembers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", relationship: "", role: "", can_pay_bills: false, can_review_alerts: true });

  async function refresh() {
    setMembers(await api.getTrustNetwork(userId));
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  async function addMember() {
    await api.addTrustMember({ user_id: userId, ...form });
    setForm({ name: "", relationship: "", role: "", can_pay_bills: false, can_review_alerts: true });
    setShowForm(false);
    refresh();
  }

  if (!members) return <p>Cargando…</p>;

  return (
    <div>
      <div className="family-header">
        <h1>Red de confianza</h1>
        <p>Estar aquí no da poder de gasto por sí solo — eso solo lo otorga una misión activa.</p>
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

        <button
          className="trust-card"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: "var(--ink-soft)" }}
          onClick={() => setShowForm(!showForm)}
        >
          <UserPlus size={18} /> Agregar persona de confianza
        </button>
      </div>

      {showForm && (
        <div className="mission-card" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input
              placeholder="Relación (ej. sobrina)"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              style={inputStyle}
            />
            <input placeholder="Rol (ej. Respaldo)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle} />
          </div>
          <label style={{ display: "block", marginBottom: 8, fontSize: "0.9rem" }}>
            <input type="checkbox" checked={form.can_pay_bills} onChange={(e) => setForm({ ...form, can_pay_bills: e.target.checked })} /> Puede
            recibir misiones para pagar servicios
          </label>
          <label style={{ display: "block", marginBottom: 14, fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={form.can_review_alerts}
              onChange={(e) => setForm({ ...form, can_review_alerts: e.target.checked })}
            />{" "}
            Puede revisar alertas
          </label>
          <button className="btn-primary" onClick={addMember} disabled={!form.name || !form.relationship || !form.role}>
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: 10, borderRadius: 8, border: "1px solid var(--line)", flex: 1, minWidth: 140 };
