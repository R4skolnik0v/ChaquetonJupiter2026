import React, { useState } from "react";
import ElderApp from "./components/elder/ElderApp.jsx";
import FamilyApp from "./components/family/FamilyApp.jsx";

function ModeSelect({ onSelect }) {
  return (
    <div className="mode-select">
      <p className="mode-select__eyebrow">"Que te ayuden con tu dinero no debería significar perder el control sobre él."</p>
      <h1 className="mode-select__title">¿Cómo quieres entrar?</h1>
      <div className="mode-select__options">
        <button className="mode-card" onClick={() => onSelect("elder")}>
          <span className="mode-card__emoji" aria-hidden="true">👵</span>
          <p className="mode-card__title">Soy María</p>
          <p className="mode-card__desc">Ver mi dinero, mis pagos y lo que está pasando, de forma simple.</p>
        </button>
        <button className="mode-card" onClick={() => onSelect("family")}>
          <span className="mode-card__emoji" aria-hidden="true">👩</span>
          <p className="mode-card__title">Soy familiar / ayudante</p>
          <p className="mode-card__desc">Crear misiones, revisar transacciones y ayudar a María sin quitarle el control.</p>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("select");

  if (mode === "elder") return <ElderApp onSwitchMode={() => setMode("select")} />;
  if (mode === "family") return <FamilyApp onSwitchMode={() => setMode("select")} />;
  return <ModeSelect onSelect={setMode} />;
}
