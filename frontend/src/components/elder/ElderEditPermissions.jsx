import React, { useEffect, useState } from "react";
import { api } from "../../api.js";

export default function ElderEditPermissions({ ownerId, personName, missionId, onClose }) {
  const [perms, setPerms] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const actions = [
    { key: "Retiro", label: "Puede retirar efectivo" },
    { key: "Transferencia", label: "Puede hacer transferencias" },
    { key: "Pagar servicios", label: "Puede pagar servicios" },
    { key: "Compras", label: "Puede hacer compras" },
    { key: "Farmacia", label: "Puede comprar en farmacia" },
    { key: "Supermercado", label: "Puede comprar en supermercado" },
    { key: "CFE", label: "Puede pagar servicios (luz/agua/gas)" },
    { key: "Cambio de beneficiario", label: "Puede cambiar beneficiarios" },
    { key: "Préstamo", label: "Puede solicitar crédito" },
  ];

  useEffect(() => {
    let mounted = true;
    async function load() {
      const result = await fetch(`/api/missions/${missionId}/permissions?owner_id=${ownerId}`).then((r) => r.json());
      if (!mounted) return;
      setPerms(result);
    }
    load();
    return () => (mounted = false);
  }, [missionId, ownerId]);

  if (!perms) return <p>Cargando permisos…</p>;

  async function toggle(type, key, value) {
    setBusyKey(key);
    try {
      const body = { owner_id: ownerId, action: key, action_type: type, allowed: value };
      await fetch(`/api/missions/${missionId}/permissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      // refresh
      const refreshed = await fetch(`/api/missions/${missionId}/permissions?owner_id=${ownerId}`).then((r) => r.json());
      setPerms(refreshed);
      alert(`Permiso actualizado:\n${personName} ${value ? "ahora puede" : "ya no puede"} ${type === "category" ? key : key}`);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: "1.4rem" }}>Editar permisos — {personName}</h2>
      <div style={{ marginTop: 12 }}>
        <h3>Categorías</h3>
        {perms.categories.map((c) => (
          <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8 }}>
            <div style={{ fontSize: "1.1rem" }}>{c.label}</div>
            <button disabled={busyKey === c.key} onClick={() => toggle("category", c.key, !c.allowed)} style={{ padding: "8px 12px", fontSize: "1rem" }}>
              {c.allowed ? "ACTIVADO" : "DESACTIVADO"}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <h3>Acciones</h3>
        {actions.map((a) => {
          const found = perms.actions.find((x) => x.key === a.key) || { allowed: true };
          return (
            <div key={a.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8 }}>
              <div style={{ fontSize: "1.1rem" }}>{a.label}</div>
              <button disabled={busyKey === a.key} onClick={() => toggle("action", a.key, !found.allowed)} style={{ padding: "8px 12px", fontSize: "1rem" }}>
                {found.allowed ? "ACTIVADO" : "DESACTIVADO"}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 18 }}>
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
