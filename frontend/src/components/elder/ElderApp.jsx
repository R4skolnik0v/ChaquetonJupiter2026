import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { USER_ID } from "../../constants.js";
import ElderHome from "./ElderHome.jsx";
import ElderMovements from "./ElderMovements.jsx";
import ElderUpcoming from "./ElderUpcoming.jsx";
import ElderExplain from "./ElderExplain.jsx";
import ElderHelp from "./ElderHelp.jsx";

const TITLES = {
  home: null,
  movements: "Mis movimientos",
  upcoming: "Próximos pagos",
  explain: "Explícame mis gastos",
  help: "Ayuda",
};

export default function ElderApp({ onSwitchMode }) {
  const [screen, setScreen] = useState("home");

  return (
    <div className="elder-shell">
      <div className="elder-column">
        <div className="elder-topbar">
          {screen === "home" ? (
            <span />
          ) : (
            <button className="elder-back" onClick={() => setScreen("home")}>
              <ArrowLeft size={20} /> Regresar
            </button>
          )}
          <button className="elder-mode-switch" onClick={onSwitchMode}>
            Cambiar de modo
          </button>
        </div>

        {TITLES[screen] && <h2 className="elder-greeting">{TITLES[screen]}</h2>}

        {screen === "home" && <ElderHome userId={USER_ID} onNavigate={setScreen} />}
        {screen === "movements" && <ElderMovements userId={USER_ID} />}
        {screen === "upcoming" && <ElderUpcoming userId={USER_ID} />}
        {screen === "explain" && <ElderExplain userId={USER_ID} />}
        {screen === "help" && <ElderHelp userId={USER_ID} />}
      </div>
    </div>
  );
}
