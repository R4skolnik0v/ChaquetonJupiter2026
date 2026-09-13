import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api.js";
import BrandLogo from "../BrandLogo.jsx";
import ElderHome from "./ElderHome.jsx";
import ElderMovements from "./ElderMovements.jsx";
import ElderUpcoming from "./ElderUpcoming.jsx";
import ElderExplain from "./ElderExplain.jsx";
import ElderPeople from "./ElderPeople.jsx";
import ElderEditPermissions from "./ElderEditPermissions.jsx";
import ElderContinuity from "./ElderContinuity.jsx";
import ElderIntentBox from "./ElderIntentBox.jsx";
import ElderApprovals from "./ElderApprovals.jsx";
import ElderTransfer from "./ElderTransfer.jsx";

const TITLES = {
  home: null,
  movements: "Mis movimientos",
  upcoming: "Próximos pagos",
  explain: "Explícame mis gastos",
  people: "Personas que me ayudan",
  continuity: "Continuidad",
  change: "¿Quieres cambiar algo?",
  approvals: "Solicitudes de tu familia",
  transfer: "Transferir dinero",
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
  const [permissionsModal, setPermissionsModal] = useState(null);

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

  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      setPermissionsModal(detail);
    };
    window.addEventListener("showPermissionsModal", handler);
    window.addEventListener("openEditPermissions", handler);
    return () => {
      window.removeEventListener("showPermissionsModal", handler);
      window.removeEventListener("openEditPermissions", handler);
    };
  }, []);

  function openIntentBox(prefill = "") {
    setIntentBoxText(prefill);
    setScreen("change");
  }

  return (
    <div className="elder-shell">
      <div className="elder-column">
        <header className="elder-brand">
          <BrandLogo />
        </header>
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
        {screen === "transfer" && <ElderTransfer userId={userId} onDone={() => setScreen("home")} onAdd={() => openIntentBox("Quiero agregar a ")} />}
        {screen === "change" && (
          <ElderIntentBox userId={userId} initialText={intentBoxText} onDone={() => setScreen("home")} />
        )}
        {screen === "approvals" && (
          <ElderApprovals userId={userId} onResolved={refreshPending} />
        )}
        <div id="elder-permissions-container" style={{ marginTop: 18 }} />
        {permissionsModal && (
          <div className="permissions-modal" style={{ position: "fixed", left: 0, right: 0, top: 0, bottom: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "white", borderRadius: 8, width: 700, maxWidth: "95%", maxHeight: "85%", overflow: "auto", padding: 18 }}>
              <button onClick={() => setPermissionsModal(null)} style={{ float: "right" }}>Cerrar</button>
              <ElderEditPermissions ownerId={permissionsModal.ownerId} personName={permissionsModal.personName} missionId={permissionsModal.missionId} onClose={() => setPermissionsModal(null)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
