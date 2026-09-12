import React, { useState } from "react";
import { LayoutDashboard, Users, ShieldCheck, ScrollText, RotateCcw, Home } from "lucide-react";
import FamilyDashboard from "./FamilyDashboard.jsx";
import TrustNetwork from "./TrustNetwork.jsx";
import ContinuityPanel from "./ContinuityPanel.jsx";
import AuditTrail from "./AuditTrail.jsx";

// NOTE: there is deliberately no "Nueva misión" / Mission Compiler tab here.
// The family member receives permissions that the account owner already
// authorized in Elder Mode (see components/elder/ElderRequestHelp.jsx) --
// they never get to define their own permissions. See FamilyDashboard.jsx
// for how a missing mission is presented, and TransactionFeed.jsx for how
// a family member asks for a one-time exception instead.
const NAV = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
  { id: "trust", label: "Red de confianza", icon: Users },
  { id: "continuity", label: "Continuidad", icon: ShieldCheck },
  { id: "audit", label: "Auditoría", icon: ScrollText },
];

export default function FamilyApp({ userId, scenarioMeta, onSwitchMode, onChangeDemo, onGoHome, onResetScenario, isCustomScenario }) {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="family-shell">
      <aside className="family-sidebar">
        <div className="family-sidebar__brand">Acompañamiento financiero</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`family-nav-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              <Icon size={18} /> {item.label}
            </button>
          );
        })}
        <button className="family-sidebar__switch" onClick={onSwitchMode}>Cambiar de modo</button>
        {onChangeDemo && <button className="family-sidebar__switch" onClick={onChangeDemo}>Cambiar demo</button>}
        {onResetScenario && !isCustomScenario && (
          <button className="family-sidebar__switch" onClick={onResetScenario}>
            <RotateCcw size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Reiniciar escenario
          </button>
        )}
        {onGoHome && (
          <button className="family-sidebar__switch" onClick={onGoHome}>
            <Home size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Inicio
          </button>
        )}
      </aside>
      <main className="family-main">
        {tab === "dashboard" && <FamilyDashboard userId={userId} scenarioMeta={scenarioMeta} />}
        {tab === "trust" && <TrustNetwork userId={userId} />}
        {tab === "continuity" && <ContinuityPanel userId={userId} />}
        {tab === "audit" && <AuditTrail userId={userId} />}
      </main>
    </div>
  );
}
