import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api.js";
import ElderHome from "./ElderHome.jsx";
import ElderMovements from "./ElderMovements.jsx";
import ElderUpcoming from "./ElderUpcoming.jsx";
import ElderExplain from "./ElderExplain.jsx";
import ElderHelp from "./ElderHelp.jsx";
import ElderRequestHelp from "./ElderRequestHelp.jsx";
import ElderApprovals from "./ElderApprovals.jsx";

const TITLES = {
  home: null,
  movements: "Mis movimientos",
  upcoming: "Próximos pagos",
  explain: "Explícame mis gastos",
  help: "Ayuda",
  "request-help": "Pedir ayuda",
  approvals: "Solicitudes de tu familia",
};

// This is the most important screen switch in the whole product: the
// Mission Compiler lives HERE, in the elder's own experience, because the
// intention behind a mission has to come from the account owner -- never
// from whoever is helping them. See ElderRequestHelp.jsx.
export default function ElderApp({ userId, scenarioMeta, onSwitchMode, onChangeDemo, onGoHome, onResetScenario, isCustomScenario }) {
  const [screen, setScreen] = useState("home");
  const [pendingCount, setPendingCount] = useState(0);

  async function refreshPending() {
    try {
      const list = await api.listExceptions(userId, "pending");
      setPendingCount(list.length);
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    refreshPending();
  }, [userId, screen]);

  return (
    <div className="elder-shell">
      <div className="elder-column">
        <div className="elder-topbar">
          {screen === "home" ? <span /> : (
            <button className="elder-back" onClick={() => setScreen("home")}>
              <ArrowLeft size={20} /> Regresar
            </button>
          )}
          <div className="elder-nav-links">
            <button className="elder-mode-switch" onClick={onSwitchMode}>Cambiar de modo</button>
            {onChangeDemo && <button className="elder-mode-switch" onClick={onChangeDemo}>Cambiar demo</button>}
            {onResetScenario && !isCustomScenario && (
              <button className="elder-mode-switch" onClick={onResetScenario}>Reiniciar escenario</button>
            )}
            {onGoHome && <button className="elder-mode-switch" onClick={onGoHome}>Inicio</button>}
          </div>
        </div>

        {TITLES[screen] && <h2 className="elder-greeting">{TITLES[screen]}</h2>}

        {screen === "home" && (
          <ElderHome userId={userId} onNavigate={setScreen} pendingCount={pendingCount} />
        )}
        {screen === "movements" && <ElderMovements userId={userId} />}
        {screen === "upcoming" && <ElderUpcoming userId={userId} />}
        {screen === "explain" && <ElderExplain userId={userId} />}
        {screen === "help" && <ElderHelp userId={userId} />}
        {screen === "request-help" && (
          <ElderRequestHelp userId={userId} onDone={() => setScreen("home")} />
        )}
        {screen === "approvals" && (
          <ElderApprovals userId={userId} onResolved={refreshPending} />
        )}
      </div>
    </div>
  );
}
