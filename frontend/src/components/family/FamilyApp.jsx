import React, { useState } from "react";
import { LayoutDashboard, Wand2, Users, ShieldCheck, ScrollText, RotateCcw } from "lucide-react";
import { USER_ID } from "../../constants.js";
import { api } from "../../api.js";
import FamilyDashboard from "./FamilyDashboard.jsx";
import MissionCompiler from "./MissionCompiler.jsx";
import TrustNetwork from "./TrustNetwork.jsx";
import ContinuityPanel from "./ContinuityPanel.jsx";
import AuditTrail from "./AuditTrail.jsx";

const NAV = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
  { id: "compiler", label: "Nueva misión", icon: Wand2 },
  { id: "trust", label: "Red de confianza", icon: Users },
  { id: "continuity", label: "Continuidad", icon: ShieldCheck },
  { id: "audit", label: "Auditoría", icon: ScrollText },
];

export default function FamilyApp({ onSwitchMode }) {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="family-shell">
      <aside className="family-sidebar">
        <div className="family-sidebar__brand">Acompañamiento financiero</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`family-nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={18} /> {item.label}
            </button>
          );
        })}
        <button className="family-sidebar__switch" onClick={onSwitchMode}>
          Cambiar de modo
        </button>
        <button
          className="family-sidebar__switch"
          title="Solo reinicia los datos de demostración locales del navegador"
          onClick={() => {
            api.resetLocalDemoData();
            window.location.reload();
          }}
        >
          <RotateCcw size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Reiniciar demo
        </button>
      </aside>
      <main className="family-main">
        {tab === "dashboard" && <FamilyDashboard userId={USER_ID} onCreateMission={() => setTab("compiler")} />}
        {tab === "compiler" && <MissionCompiler userId={USER_ID} onMissionCreated={() => setTab("dashboard")} />}
        {tab === "trust" && <TrustNetwork userId={USER_ID} />}
        {tab === "continuity" && <ContinuityPanel userId={USER_ID} />}
        {tab === "audit" && <AuditTrail userId={USER_ID} />}
      </main>
    </div>
  );
}
