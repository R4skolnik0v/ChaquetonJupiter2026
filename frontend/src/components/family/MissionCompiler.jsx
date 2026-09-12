import React, { useEffect, useState } from "react";
import { Wand2, CircleCheck } from "lucide-react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

const ALL_CATEGORIES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"];

const EXAMPLE = "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome, por unos 30 días.";

export default function MissionCompiler({ userId, onMissionCreated }) {
  const [text, setText] = useState(EXAMPLE);
  const [draft, setDraft] = useState(null);
  const [familyOptions, setFamilyOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    api.getTrustNetwork(userId).then((members) => setFamilyOptions(members.map((m) => m.name)));
  }, [userId]);

  async function interpret() {
    setLoading(true);
    setConfirmed(false);
    try {
      const result = await api.compileMission(userId, text);
      setDraft(result);
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(field, value) {
    setDraft({ ...draft, [field]: value });
  }

  function toggleCategory(cat) {
    const has = draft.allowed_categories.includes(cat);
    updateDraft(
      "allowed_categories",
      has ? draft.allowed_categories.filter((c) => c !== cat) : [...draft.allowed_categories, cat]
    );
  }

  async function confirm() {
    setLoading(true);
    try {
      await api.confirmMission({
        owner_id: userId,
        delegate_name: draft.delegate_name,
        purpose: draft.purpose,
        days: draft.days,
        monthly_limit: Number(draft.suggested_limit),
        allowed_categories: draft.allowed_categories,
        source_text: draft.source_text,
      });
      setConfirmed(true);
      setTimeout(() => onMissionCreated?.(), 900);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="family-header">
        <h1>Mission Compiler</h1>
        <p>María escribe lo que necesita en sus propias palabras. La IA solo propone — nunca autoriza nada por sí sola.</p>
      </div>

      <div className="compiler-box">
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={interpret} disabled={loading || !text.trim()}>
            <Wand2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Interpretar
          </button>
        </div>
      </div>

      {draft && (
        <div className="compiler-draft">
          <h3>Esto es lo que entendimos</h3>

          <div className="compiler-field">
            <span className="k">Persona</span>
            <span className="v">
              {familyOptions.length > 0 ? (
                <select value={draft.delegate_name || ""} onChange={(e) => updateDraft("delegate_name", e.target.value)}>
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {familyOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                draft.delegate_name || "No identificado"
              )}
            </span>
          </div>

          <div className="compiler-field">
            <span className="k">Propósito</span>
            <input
              className="v"
              style={{ border: "none", background: "transparent", textAlign: "right", font: "inherit", fontWeight: 600 }}
              value={draft.purpose}
              onChange={(e) => updateDraft("purpose", e.target.value)}
            />
          </div>

          <div className="compiler-field">
            <span className="k">Duración</span>
            <span className="v">
              <input
                type="number"
                style={{ width: 60, border: "1px solid var(--line)", borderRadius: 6, padding: 4 }}
                value={draft.days}
                onChange={(e) => updateDraft("days", Number(e.target.value))}
              />{" "}
              días
            </span>
          </div>

          <div className="compiler-field" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <span className="k">Categorías sugeridas</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: draft.allowed_categories.includes(cat) ? "var(--steel)" : "var(--white)",
                    color: draft.allowed_categories.includes(cat) ? "var(--white)" : "var(--ink)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    border: "1px solid var(--line)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draft.allowed_categories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    style={{ display: "none" }}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>

          <div className="compiler-field">
            <span className="k">Límite mensual sugerido</span>
            <span className="v">
              $
              <input
                type="number"
                style={{ width: 90, border: "1px solid var(--line)", borderRadius: 6, padding: 4 }}
                value={draft.suggested_limit}
                onChange={(e) => updateDraft("suggested_limit", e.target.value)}
              />
            </span>
          </div>

          <div className="compiler-field" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <span className="k">Acciones bloqueadas (siempre, sin excepción)</span>
            <span className="v" style={{ color: "var(--red)", textAlign: "left" }}>
              {draft.forbidden_actions.join(" · ")}
            </span>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn-primary" onClick={confirm} disabled={loading || !draft.delegate_name}>
              Confirmar misión
            </button>
            {confirmed && (
              <span style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
                <CircleCheck size={18} /> Misión creada
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
