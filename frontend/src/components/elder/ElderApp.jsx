import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api.js";
import ElderHome from "./ElderHome.jsx";
import ElderMovements from "./ElderMovements.jsx";
import ElderUpcoming from "./ElderUpcoming.jsx";
import ElderExplain from "./ElderExplain.jsx";
import ElderPeople from "./ElderPeople.jsx";
import ElderContinuity from "./ElderContinuity.jsx";
import ElderIntentBox from "./ElderIntentBox.jsx";
import ElderApprovals from "./ElderApprovals.jsx";

const TITLES = {
  home: null,
  movements: "Mis movimientos",
  upcoming: "Próximos pagos",
  explain: "Explícame mis gastos",
  people: "Personas que me ayudan",
  continuity: "Continuidad",
  change: "¿Quieres cambiar algo?",
  approvals: "Solicitudes de tu familia",
};

// This is the most important screen switch in the whole product: the
// Intent Engine's one text box (ElderIntentBox) lives HERE, in the elder's
// own experience, because every intention -- a new mission, revoking a
// permission, adding someone to the trust network, configuring continuity
// -- has to come from the account owner, never from whoever is helping them.
export default function ElderApp({ userId, scenarioMeta, onSwitchMode, onChangeDemo, onGoHome, onResetScenario, isCustomScenario }) {
  const [screen, setScreen] = useState("home");
  const [pendingCount, setPendingCount] = useState(0);
  const [intentBoxText, setIntentBoxText] = useState("");

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

  function openIntentBox(prefill = "") {
    setIntentBoxText(prefill);
    setScreen("change");
  }

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
          <ElderHome userId={userId} onNavigate={setScreen} onOpenIntentBox={openIntentBox} pendingCount={pendingCount} />
        )}
        {screen === "movements" && <ElderMovements userId={userId} />}
        {screen === "upcoming" && <ElderUpcoming userId={userId} />}
        {screen === "explain" && <ElderExplain userId={userId} />}
        {screen === "people" && <ElderPeople userId={userId} onAdd={() => openIntentBox("Quiero agregar a ")} />}
        {screen === "continuity" && <ElderContinuity userId={userId} onOpenIntentBox={openIntentBox} />}
        {screen === "change" && (
          <ElderIntentBox userId={userId} initialText={intentBoxText} onDone={() => setScreen("home")} />
        )}
        {screen === "approvals" && (
          <ElderApprovals userId={userId} onResolved={refreshPending} />
        )}
      </div>
    </div>
  );
}
