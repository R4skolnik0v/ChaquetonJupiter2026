import React, { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "../../api.js";

const ALL_CATEGORIES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"];

const EXAMPLES = [
  "Quiero que mi hija Laura me ayude a pagar mis servicios este mes.",
  "Ya no quiero que Carlos haga transferencias.",
  "Quiero agregar a mi sobrina para que me ayude con el supermercado.",
  "Si no puedo administrar mis finanzas, quiero que Laura me ayude por 30 días.",
];

// This ONE box is the elder-facing surface for every one of the 12 intents
// the Intent Engine understands (see backend/app/engines/intent_engine.py).
// There is deliberately no separate screen per action -- the account owner
// describes what they want, the system figures out which of the 12 it is,
// explains what it understood, and only acts after an explicit confirm.
export default function ElderIntentBox({ userId, onDone, initialText = "" }) {
  const [step, setStep] = useState("write"); // write | review | editing | done | answered
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState(null); // { intent, confirmation_text, proposal }
  const [loading, setLoading] = useState(false);
  const [familyOptions, setFamilyOptions] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);

  useEffect(() => {
    api.getTrustNetwork(userId).then((members) => setFamilyOptions(members.map((m) => m.name)));
  }, [userId]);

  async function interpret() {
    setLoading(true);
    try {
      const history = [...conversationHistory, { role: "user", content: text }];
      const r = await api.interpretIntent(userId, text, history);
      const nextHistory = [...history, { role: "model", content: r.confirmation_text || r.source_text || "Entendí tu petición." }];
      setConversationHistory(nextHistory);
      setResult(r);
      setStep(r.requires_confirmation === false ? "answered" : "review");
    } finally {
      setLoading(false);
    }
  }

  function updateProposal(field, value) {
    setResult({ ...result, proposal: { ...result.proposal, [field]: value } });
  }

  async function confirm() {
    setLoading(true);
    try {
      await api.executeIntent(userId, result.intent, result.proposal);
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setText("");
    setResult(null);
    setConversationHistory([]);
    setStep("write");
  }

  if (step === "write") {
    return (
      <div>
        <div className="elder-balance-card">
          <p style={{ fontSize: "1.15rem", margin: "0 0 16px" }}>¿Qué quieres cambiar?</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Por ejemplo: Quiero que Laura pueda retirar efectivo hasta $1,000 cada semana."
            style={{ width: "100%", minHeight: 140, fontSize: "1.1rem", padding: 16, borderRadius: 14, border: "1px solid var(--line)", fontFamily: "inherit" }}
          />
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: "0 0 6px" }}>Por ejemplo:</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                style={{ display: "block", textAlign: "left", background: "none", border: "none", color: "var(--steel)", padding: "4px 0", cursor: "pointer", fontSize: "0.9rem" }}
              >
                "{ex}"
              </button>
            ))}
          </div>
        </div>
        <div className="elder-actions">
          <button className="elder-button primary" disabled={loading || !text.trim()} onClick={interpret}>
            {loading ? "Un momento…" : "Continuar"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "answered") {
    // GENERAL_FINANCIAL_QUESTION -- nothing to confirm, nothing changes.
    return (
      <div className="elder-balance-card">
        <p style={{ fontSize: "1.15rem", margin: 0 }}>{result.proposal.answer}</p>
        <div className="elder-actions">
          <button className="elder-button primary" onClick={startOver}>Preguntar otra cosa</button>
          <button className="elder-button" onClick={onDone}>Regresar al inicio</button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="elder-balance-card" style={{ textAlign: "center" }}>
        <CircleCheck size={40} color="var(--green)" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: "1.2rem", margin: 0 }}>Listo, hice ese cambio.</p>
        <div className="elder-actions">
          <button className="elder-button primary" onClick={onDone}>Regresar al inicio</button>
          <button className="elder-button" onClick={startOver}>Cambiar algo más</button>
        </div>
      </div>
    );
  }

  const editing = step === "editing";

  return (
    <div>
      <div className="elder-balance-card">
        <p style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 18px" }}>Esto es lo que entendí</p>
        <p style={{ fontSize: "1.1rem", lineHeight: 1.5, margin: "0 0 18px" }}>{result.confirmation_text}</p>

        <IntentDetails
          intent={result.intent}
          proposal={result.proposal}
          editing={editing}
          familyOptions={familyOptions}
          onChange={updateProposal}
        />
      </div>

      <p style={{ fontSize: "1.1rem", textAlign: "center", margin: "20px 0" }}>¿Es correcto?</p>

      <div className="elder-actions">
        <button className="elder-button primary" disabled={loading} onClick={confirm}>
          {loading ? "Aplicando…" : "Sí, hacer este cambio"}
        </button>
        {CAN_EDIT.has(result.intent) && (
          <button className="elder-button" onClick={() => setStep(editing ? "review" : "editing")}>
            {editing ? "Terminar de editar" : "Editar"}
          </button>
        )}
        <button className="elder-button" onClick={startOver}>No, corregir mi mensaje</button>
      </div>
    </div>
  );
}

const CAN_EDIT = new Set(["CREATE_MISSION", "MODIFY_MISSION", "ENABLE_CONTINUITY", "MODIFY_CONTINUITY", "ADD_TRUSTED_PERSON"]);

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: "1.02rem" }}>
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{children}</span>
    </div>
  );
}

const inputStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", font: "inherit", textAlign: "right" };
const selectStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", font: "inherit" };

function CategoryToggle({ categories, onToggle, editing }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {ALL_CATEGORIES.map((cat) => {
        const active = categories.includes(cat);
        return (
          <label
            key={cat}
            style={{
              padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line)",
              background: active ? "var(--steel)" : "var(--white)", color: active ? "var(--white)" : "var(--ink)",
              fontSize: "0.9rem", cursor: editing ? "pointer" : "default",
            }}
          >
            {editing && <input type="checkbox" checked={active} onChange={() => onToggle(cat)} style={{ display: "none" }} />}
            {cat}
          </label>
        );
      })}
    </div>
  );
}

// One block per intent -- shows the structured fields worth double-checking
// beyond the confirmation sentence. Intents with nothing more to show than
// the sentence itself (MODIFY_LIMIT, MODIFY_DURATION, REMOVE_TRUSTED_PERSON,
// DISABLE_CONTINUITY, the "already_blocked"/"already_allowed" no-op cases)
// render nothing extra here.
function IntentDetails({ intent, proposal, editing, familyOptions, onChange }) {
  if (intent === "CREATE_MISSION" || intent === "MODIFY_MISSION") {
    const toggleCategory = (cat) => {
      const has = proposal.allowed_categories.includes(cat);
      onChange("allowed_categories", has ? proposal.allowed_categories.filter((c) => c !== cat) : [...proposal.allowed_categories, cat]);
    };
    return (
      <>
        <Row label="👤 Persona">
          {editing && familyOptions.length > 0 ? (
            <select value={proposal.delegate_name || ""} onChange={(e) => onChange("delegate_name", e.target.value)} style={selectStyle}>
              <option value="" disabled>Selecciona…</option>
              {familyOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (proposal.delegate_name || "No identificado — edita para elegir a alguien")}
        </Row>
        <Row label="🎯 Propósito">
          {editing ? <input value={proposal.purpose} onChange={(e) => onChange("purpose", e.target.value)} style={inputStyle} /> : proposal.purpose}
        </Row>
        <Row label="📅 Duración">
          {editing ? <span><input type="number" value={proposal.days} onChange={(e) => onChange("days", Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /> días</span> : `${proposal.days} días`}
        </Row>
        <Row label="💰 Límite">
          {editing ? <span>$<input type="number" value={proposal.suggested_limit} onChange={(e) => onChange("suggested_limit", e.target.value)} style={{ ...inputStyle, width: 100 }} /> al mes</span> : `$${Number(proposal.suggested_limit).toLocaleString()} al mes`}
        </Row>
        <Row label="✅ Puede pagar"><CategoryToggle categories={proposal.allowed_categories} onToggle={toggleCategory} editing={editing} /></Row>
        <Row label="🚫 No puede"><span style={{ color: "var(--red)" }}>Transferir dinero, retirar efectivo, cambiar beneficiarios, solicitar créditos</span></Row>
      </>
    );
  }

  if (intent === "REVOKE_PERMISSION" || intent === "GRANT_PERMISSION") {
    if (proposal.already_blocked || proposal.already_allowed || proposal.blocked_forever) return null;
    return (
      <>
        <Row label="👤 Persona">{proposal.delegate_name}</Row>
        <Row label={intent === "REVOKE_PERMISSION" ? "🚫 Deja de poder" : "✅ Ahora puede"}>{proposal.category}</Row>
        <Row label="Sigue pudiendo">{(proposal.remaining_categories || proposal.new_categories || []).join(", ") || "—"}</Row>
      </>
    );
  }

  if (intent === "ADD_TRUSTED_PERSON") {
    return (
      <>
        <Row label="👤 Nombre">
          {editing ? <input value={proposal.name || ""} onChange={(e) => onChange("name", e.target.value)} style={inputStyle} placeholder="Nombre" /> : (proposal.name || "—")}
        </Row>
        <Row label="Relación">
          {editing ? <input value={proposal.relationship || ""} onChange={(e) => onChange("relationship", e.target.value)} style={inputStyle} /> : proposal.relationship}
        </Row>
        <Row label="✅ Puede">pagar servicios y revisar alertas (los permisos concretos se definen al crear una misión)</Row>
        <Row label="🚫 No puede"><span style={{ color: "var(--red)" }}>otorgarse permisos a sí misma, transferir dinero, retirar efectivo</span></Row>
      </>
    );
  }

  if (intent === "REMOVE_TRUSTED_PERSON") {
    return <Row label="👤 Persona">{proposal.name}</Row>;
  }

  if (intent === "ENABLE_CONTINUITY" || intent === "MODIFY_CONTINUITY") {
    const toggleCategory = (cat) => {
      const has = proposal.allowed_categories.includes(cat);
      onChange("allowed_categories", has ? proposal.allowed_categories.filter((c) => c !== cat) : [...proposal.allowed_categories, cat]);
    };
    return (
      <>
        <Row label="👤 Encargado">
          {editing && familyOptions.length > 0 ? (
            <select value={proposal.delegate_name || ""} onChange={(e) => onChange("delegate_name", e.target.value)} style={selectStyle}>
              <option value="" disabled>Selecciona…</option>
              {familyOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (proposal.delegate_name || "No identificado")}
        </Row>
        <Row label="📅 Duración">
          {editing ? <span><input type="number" value={proposal.days} onChange={(e) => onChange("days", Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /> días</span> : `${proposal.days} días`}
        </Row>
        <Row label="💰 Límite">
          {editing ? <span>$<input type="number" value={proposal.monthly_limit} onChange={(e) => onChange("monthly_limit", Number(e.target.value))} style={{ ...inputStyle, width: 100 }} /> al mes</span> : `$${Number(proposal.monthly_limit).toLocaleString()} al mes`}
        </Row>
        <Row label="✅ Permitido"><CategoryToggle categories={proposal.allowed_categories} onToggle={toggleCategory} editing={editing} /></Row>
      </>
    );
  }

  if (intent === "MODIFY_LIMIT") {
    return (
      <>
        <Row label="👤 Persona">{proposal.delegate_name}</Row>
        <Row label="💰 Nuevo límite">${Number(proposal.new_value).toLocaleString()} {proposal.field === "per_transaction_limit" ? "por transacción" : "al mes"}</Row>
      </>
    );
  }

  if (intent === "MODIFY_DURATION") {
    return (
      <>
        <Row label="👤 Persona">{proposal.delegate_name}</Row>
        <Row label="📅 Cambio">{proposal.mode === "extend" ? `${proposal.days} días más` : `${proposal.days} días en total`}</Row>
      </>
    );
  }

  return null; // DISABLE_CONTINUITY, and the already_blocked/already_allowed no-op cases
}
