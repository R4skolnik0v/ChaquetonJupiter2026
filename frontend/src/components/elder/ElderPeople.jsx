import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "../../api.js";

// "¿Quién quieres que pueda ayudarte?" -- this belongs to the account
// owner. Adding someone goes through the same Intent Engine as everything
// else (see onAdd below); removing someone is unambiguous once you've
// tapped their name, so that's a direct two-step confirm right here
// instead of forcing it through free text.
export default function ElderPeople({ userId, onAdd }) {
  const [people, setPeople] = useState(null);
  const [missions, setMissions] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, m] = await Promise.all([api.getTrustNetwork(userId), api.listMissions(userId)]);
    setPeople(p);
    setMissions(m);
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  async function remove(trustId) {
    setBusy(true);
    try {
      await api.removeTrustedPerson(userId, trustId);
      setConfirmingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!people) return <p>Cargando…</p>;

  return (
    <div>
      <p style={{ fontSize: "1.1rem", margin: "0 0 20px" }}>Estas personas pueden ayudarte con tu dinero, sin quitarte el control.</p>

      <div className="elder-help-people">
        {people.map((p) => {
          const mission = missions.find((m) => m.delegate_name === p.name && m.status === "active");
          const [editing, setEditing] = [false, null];
          return (
            <div className="elder-help-person" key={p.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                <div className="avatar">{p.name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                    {p.relationship} · {mission ? `Puede ayudar con: ${mission.allowed_categories.join(", ")}` : "Sin misión activa ahora mismo"}
                  </div>
                </div>
                {confirmingId !== p.id && (
                  <button
                    onClick={() => setConfirmingId(p.id)}
                    style={{ background: "none", border: "none", color: "var(--red)", fontSize: "0.85rem", cursor: "pointer", textDecoration: "underline" }}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {confirmingId === p.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <p style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>
                    ¿Seguro que ya no quieres que {p.name} pueda ayudarte? Esto también termina cualquier misión activa que tenga.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-secondary" disabled={busy} onClick={() => remove(p.id)}>
                      {busy ? "Quitando…" : "Sí, quitar"}
                    </button>
                    <button className="btn-secondary" disabled={busy} onClick={() => setConfirmingId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
              {mission && (
                <div style={{ marginTop: 12 }}>
                  <button className="elder-button" onClick={async () => {
                    // open edit permissions modal-like view
                    const container = document.getElementById('elder-permissions-container');
                    if (container) {
                      container.innerHTML = '';
                    }
                    // render component by setting location (simple approach)
                    setTimeout(() => {
                      // navigate to a simple route or show via parent — keep simple: emit custom event
                      window.dispatchEvent(new CustomEvent('openEditPermissions', { detail: { ownerId: userId, personName: p.name, missionId: mission.id } }));
                    }, 10);
                  }}>Editar permisos</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="elder-actions" style={{ marginTop: 20 }}>
        <button className="elder-button" onClick={onAdd}>
          Agregar a alguien nuevo <UserPlus size={20} />
        </button>
      </div>

      <p style={{ marginTop: 24, color: "var(--ink-soft)", fontSize: "0.9rem" }}>
        Si algo no se ve bien, o tienes dudas sobre un pago, puedes hablar con ellos en cualquier momento.
      </p>
    </div>
  );
}
