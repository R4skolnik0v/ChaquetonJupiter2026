import React, { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "../../api.js";

const ALL_CATEGORIES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"];
const EXAMPLE = "Quiero que mi hija me ayude a pagar mis servicios este mes porque voy a estar fuera.";

// THE most important screen in the product, conceptually: this is where
// the account owner -- not the family member -- describes what help they
// need. The Mission Compiler (engines/mission_compiler.py on the backend,
// or its JS twin in localEngine.js) only ever proposes a structured draft
// from that text; nothing is authorized until the owner presses "Confirmar
// misión" below.
export default function ElderRequestHelp({ userId, onDone }) {
  const [step, setStep] = useState("write"); // write | review | editing | done
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [familyOptions, setFamilyOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getTrustNetwork(userId).then((members) => setFamilyOptions(members.map((m) => m.name)));
  }, [userId]);

  async function interpret() {
    setLoading(true);
    try {
      const result = await api.compileMission(userId, text);
      setDraft(result);
      setStep("review");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(field, value) {
    setDraft({ ...draft, [field]: value });
  }

  function toggleCategory(cat) {
    const has = draft.allowed_categories.includes(cat);
    updateDraft("allowed_categories", has ? draft.allowed_categories.filter((c) => c !== cat) : [...draft.allowed_categories, cat]);
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
        per_transaction_limit: draft.per_transaction_limit ? Number(draft.per_transaction_limit) : null,
        allowed_categories: draft.allowed_categories,
        source_text: draft.source_text,
      });
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  if (step === "write") {
    return (
      <div>
        <div className="elder-balance-card">
          <p style={{ fontSize: "1.15rem", margin: "0 0 16px" }}>
            Cuéntanos qué necesitas. Puedes escribirlo como se lo dirías a tu familia.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            style={{ width: "100%", minHeight: 120, fontSize: "1.1rem", padding: 16, borderRadius: 14, border: "1px solid var(--line)", fontFamily: "inherit" }}
          />
        </div>
        <div className="elder-actions">
          <button className="elder-button primary" disabled={loading || !text.trim()} onClick={interpret}>
            {loading ? "Un momento…" : "Continuar"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="elder-balance-card" style={{ textAlign: "center" }}>
        <CircleCheck size={40} color="var(--green)" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: "1.2rem", margin: 0 }}>Listo. {draft.delegate_name} ya puede ayudarte con esto.</p>
        <div className="elder-actions">
          <button className="elder-button primary" onClick={onDone}>Regresar al inicio</button>
        </div>
      </div>
    );
  }

  const editing = step === "editing";

  return (
    <div>
      <div className="elder-balance-card">
        <p style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 18px" }}>Esto es lo que entendimos</p>

        <ReviewRow label="👩 Ayudante" >
          {editing && familyOptions.length > 0 ? (
            <select value={draft.delegate_name || ""} onChange={(e) => updateDraft("delegate_name", e.target.value)} style={selectStyle}>
              <option value="" disabled>Selecciona…</option>
              {familyOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            draft.delegate_name || "No identificado — edita para elegir a alguien"
          )}
        </ReviewRow>

        <ReviewRow label="🎯 Propósito">
          {editing ? (
            <input value={draft.purpose} onChange={(e) => updateDraft("purpose", e.target.value)} style={inputStyle} />
          ) : draft.purpose}
        </ReviewRow>

        <ReviewRow label="📅 Duración">
          {editing ? (
            <span><input type="number" value={draft.days} onChange={(e) => updateDraft("days", Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /> días</span>
          ) : `${draft.days} días`}
        </ReviewRow>

        <ReviewRow label="💰 Límite">
          {editing ? (
            <span>$<input type="number" value={draft.suggested_limit} onChange={(e) => updateDraft("suggested_limit", e.target.value)} style={{ ...inputStyle, width: 100 }} /> al mes</span>
          ) : `$${Number(draft.suggested_limit).toLocaleString()} al mes`}
        </ReviewRow>

        <ReviewRow label="🏪 Puede pagar">
          {editing ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {ALL_CATEGORIES.map((cat) => (
                <label key={cat} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line)", background: draft.allowed_categories.includes(cat) ? "var(--steel)" : "var(--white)", color: draft.allowed_categories.includes(cat) ? "var(--white)" : "var(--ink)", fontSize: "0.9rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={draft.allowed_categories.includes(cat)} onChange={() => toggleCategory(cat)} style={{ display: "none" }} />
                  {cat}
                </label>
              ))}
            </div>
          ) : draft.allowed_categories.join(", ")}
        </ReviewRow>

        <ReviewRow label="🚫 No puede">
          <span style={{ color: "var(--red)" }}>Transferir dinero, retirar efectivo, cambiar beneficiarios, solicitar créditos</span>
        </ReviewRow>
      </div>

      <p style={{ fontSize: "1.1rem", textAlign: "center", margin: "20px 0" }}>¿Está correcto?</p>

      <div className="elder-actions">
        <button className="elder-button primary" disabled={loading || !draft.delegate_name} onClick={confirm}>
          {loading ? "Confirmando…" : "Confirmar misión"}
        </button>
        <button className="elder-button" onClick={() => setStep(editing ? "review" : "editing")}>
          {editing ? "Terminar de editar" : "Editar"}
        </button>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)", fontSize: "1.05rem" }}>
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{children}</span>
    </div>
  );
}

const inputStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", font: "inherit", textAlign: "right" };
const selectStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", font: "inherit" };
