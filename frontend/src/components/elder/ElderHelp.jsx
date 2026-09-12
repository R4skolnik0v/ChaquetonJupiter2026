import React, { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { api } from "../../api.js";

export default function ElderHelp({ userId }) {
  const [people, setPeople] = useState(null);

  useEffect(() => {
    api.getTrustNetwork(userId).then(setPeople);
  }, [userId]);

  return (
    <div className="elder-help-card">
      <p style={{ fontSize: "1.1rem", margin: 0 }}>Estas personas pueden ayudarte con tu dinero, sin quitarte el control.</p>
      <div className="elder-help-people">
        {(people || []).map((p) => (
          <div className="elder-help-person" key={p.id}>
            <div className="avatar">{p.name?.[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>{p.role}</div>
            </div>
            <Phone size={20} color="var(--ink-soft)" />
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, color: "var(--ink-soft)", fontSize: "0.9rem" }}>
        Si algo no se ve bien, o tienes dudas sobre un pago, puedes hablar con ellos en cualquier momento.
      </p>
    </div>
  );
}
