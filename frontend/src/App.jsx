import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import ElderApp from "./components/elder/ElderApp.jsx";
import FamilyApp from "./components/family/FamilyApp.jsx";

// ---------------------------------------------------------------------
// Landing: "¿Quieres explorar un caso o crear el tuyo?"
// ---------------------------------------------------------------------
function Landing({ onExploreDemos, onStartFromScratch }) {
  return (
    <div className="mode-select">
      <p className="mode-select__eyebrow">"Que te ayuden con tu dinero no debería significar perder el control sobre él."</p>
      <h1 className="mode-select__title">¿Quieres explorar un caso o crear el tuyo?</h1>
      <div className="mode-select__options">
        <button className="mode-card" onClick={onExploreDemos}>
          <span className="mode-card__emoji" aria-hidden="true">🎬</span>
          <p className="mode-card__title">Explorar demos</p>
          <p className="mode-card__desc">Cinco historias, cada una mostrando una parte distinta de cómo funciona el producto.</p>
        </button>
        <button className="mode-card" onClick={onStartFromScratch}>
          <span className="mode-card__emoji" aria-hidden="true">✨</span>
          <p className="mode-card__title">Empezar desde cero</p>
          <p className="mode-card__desc">Un escenario limpio, con tus propios nombres, para armar tu propia misión.</p>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Demos grid
// ---------------------------------------------------------------------
function DemosGrid({ onPick, onBack }) {
  const [scenarios, setScenarios] = useState(null);

  useEffect(() => {
    api.listScenarios().then(setScenarios);
  }, []);

  return (
    <div className="mode-select">
      <h1 className="mode-select__title">Elige un caso</h1>
      {!scenarios ? (
        <p>Cargando…</p>
      ) : (
        <div className="demo-grid">
          {scenarios.map((s) => (
            <button className="demo-card" key={s.id} onClick={() => onPick(s)}>
              <span className="demo-card__emoji" aria-hidden="true">{s.emoji}</span>
              <p className="demo-card__name">{s.name}</p>
              <p className="demo-card__tagline">{s.tagline}</p>
              <p className="demo-card__headline">{s.headline}</p>
            </button>
          ))}
        </div>
      )}
      <button className="elder-mode-switch" onClick={onBack}>Regresar</button>
    </div>
  );
}

// ---------------------------------------------------------------------
// "Empezar desde cero" -- a blank, isolated scenario
// ---------------------------------------------------------------------
function CustomForm({ onCreated, onBack }) {
  const [ownerName, setOwnerName] = useState("");
  const [delegateName, setDelegateName] = useState("");
  const [delegateRelationship, setDelegateRelationship] = useState("hija");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const result = await api.createCustomScenario(ownerName.trim(), delegateName.trim(), delegateRelationship);
      onCreated({ userId: result.user_id, meta: { name: ownerName.trim(), delegate_name: delegateName.trim() || null } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mode-select">
      <h1 className="mode-select__title">Empecemos desde cero</h1>
      <div className="mode-card" style={{ width: 380, cursor: "default", textAlign: "left" }}>
        <label style={{ display: "block", fontSize: "0.9rem", color: "var(--ink-soft)", marginBottom: 6 }}>
          Nombre del adulto mayor
        </label>
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Ej. Guadalupe Ríos"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--line)", marginBottom: 16, font: "inherit" }}
        />
        <label style={{ display: "block", fontSize: "0.9rem", color: "var(--ink-soft)", marginBottom: 6 }}>
          Nombre de quien va a ayudar
        </label>
        <input
          value={delegateName}
          onChange={(e) => setDelegateName(e.target.value)}
          placeholder="Ej. Mónica"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--line)", marginBottom: 10, font: "inherit" }}
        />
        <select
          value={delegateRelationship}
          onChange={(e) => setDelegateRelationship(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", marginBottom: 20, font: "inherit" }}
        >
          {["hija", "hijo", "nieta", "nieto", "sobrina", "sobrino", "cuidador", "cuidadora"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button className="btn-primary" style={{ width: "100%" }} disabled={loading || !ownerName.trim() || !delegateName.trim()} onClick={submit}>
          {loading ? "Creando…" : "Comenzar"}
        </button>
      </div>
      <button className="elder-mode-switch" onClick={onBack}>Regresar</button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Mode select (elder / family), personalized to whichever scenario is active
// ---------------------------------------------------------------------
function ModeSelect({ scenario, onSelect }) {
  const ownerName = scenario.meta?.name || "el adulto mayor";
  const delegateName = scenario.meta?.delegate_name;
  return (
    <div className="mode-select">
      <h1 className="mode-select__title">¿Cómo quieres entrar?</h1>
      <div className="mode-select__options">
        <button className="mode-card" onClick={() => onSelect("elder")}>
          <span className="mode-card__emoji" aria-hidden="true">👵</span>
          <p className="mode-card__title">Soy {ownerName.split(" ")[0]}</p>
          <p className="mode-card__desc">Ver mi dinero, mis pagos y lo que está pasando, de forma simple.</p>
        </button>
        <button className="mode-card" onClick={() => onSelect("family")}>
          <span className="mode-card__emoji" aria-hidden="true">👩</span>
          <p className="mode-card__title">Soy familiar{delegateName ? ` (${delegateName})` : ""}</p>
          <p className="mode-card__desc">Ver mis permisos, ejecutar tareas autorizadas y ayudar sin quitarle el control.</p>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [scenario, setScenario] = useState(null); // { userId, meta }
  const [refreshKey, setRefreshKey] = useState(0);

  function goHome() {
    setScenario(null);
    setScreen("landing");
  }

  function changeDemo() {
    setScenario(null);
    setScreen("demos");
  }

  function pickDemo(meta) {
    setScenario({ userId: meta.id, meta });
    setScreen("mode-select");
  }

  function startCustom(newScenario) {
    setScenario(newScenario);
    setScreen("elder"); // the flow always starts with the account owner
  }

  async function resetScenario() {
    if (!scenario) return;
    await api.resetScenario(scenario.userId);
    setRefreshKey((k) => k + 1);
  }

  const isCustomScenario = scenario?.userId?.startsWith("custom-");

  if (screen === "landing") {
    return <Landing onExploreDemos={() => setScreen("demos")} onStartFromScratch={() => setScreen("custom-form")} />;
  }
  if (screen === "demos") {
    return <DemosGrid onPick={pickDemo} onBack={() => setScreen("landing")} />;
  }
  if (screen === "custom-form") {
    return <CustomForm onCreated={startCustom} onBack={() => setScreen("landing")} />;
  }
  if (screen === "mode-select" && scenario) {
    return <ModeSelect scenario={scenario} onSelect={setScreen} />;
  }
  if (screen === "elder" && scenario) {
    return (
      <ElderApp
        key={refreshKey}
        userId={scenario.userId}
        scenarioMeta={scenario.meta}
        onSwitchMode={() => setScreen("family")}
        onChangeDemo={changeDemo}
        onGoHome={goHome}
        onResetScenario={resetScenario}
        isCustomScenario={isCustomScenario}
      />
    );
  }
  if (screen === "family" && scenario) {
    return (
      <FamilyApp
        key={refreshKey}
        userId={scenario.userId}
        scenarioMeta={scenario.meta}
        onSwitchMode={() => setScreen("elder")}
        onChangeDemo={changeDemo}
        onGoHome={goHome}
        onResetScenario={resetScenario}
        isCustomScenario={isCustomScenario}
      />
    );
  }

  // Fallback: something got into an inconsistent state (e.g. a stale link) --
  // send them back to the start rather than showing a blank screen.
  return <Landing onExploreDemos={() => setScreen("demos")} onStartFromScratch={() => setScreen("custom-form")} />;
}
