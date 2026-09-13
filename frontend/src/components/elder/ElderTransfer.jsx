import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api.js";

const CONCEPT_OPTIONS = [
  "Ayuda a mi familia",
  "Pagar algo",
  "Regalo",
  "Otro",
];

export default function ElderTransfer({ userId, onDone, onAdd }) {
  const [people, setPeople] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [amount, setAmount] = useState(0);
  const [concept, setConcept] = useState("Ayuda a mi familia");
  const [customNote, setCustomNote] = useState("");
  const [step, setStep] = useState("recipient");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [reviewReason, setReviewReason] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const network = await api.getTrustNetwork(userId);
        setPeople(network);
      } catch {
        setPeople([]);
      }
    }
    load();
  }, [userId]);

  const displayAmount = useMemo(() => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount || 0);
  }, [amount]);

  function addDigit(d) {
    const next = Number(String(amount || 0) + String(d));
    setAmount(next);
  }

  function backspace() {
    const s = String(amount || 0);
    if (s.length <= 1) setAmount(0);
    else setAmount(Number(s.slice(0, -1)));
  }

  async function finishTransfer(force = false) {
    if (!selectedPerson) return;
    setBusy(true);
    try {
      const payload = {
        user_id: userId,
        recipient_name: selectedPerson.name,
        amount,
        concept: concept === "Otro" ? (customNote || "Otro") : concept,
        note: customNote || "",
        initiated_by: userId,
        force,
      };
      const res = await api.createTransfer(payload);
      if (res.needs_review) {
        setReviewReason(res.message || "Por seguridad, queremos confirmar que realmente deseas hacerla.");
        setResult(null);
      } else {
        setResult(res);
        setReviewReason(null);
      }
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: 20 }}>
        <h2 style={{ fontSize: "2rem", marginBottom: 10 }}>✅ Transferencia realizada</h2>
        <p style={{ fontSize: "1.2rem", marginBottom: 30 }}>
          Enviaste {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(result.amount || 0))} a {result.recipient_name}.
        </p>
        <button className="elder-button primary" onClick={onDone} style={{ width: "100%" }}>
          Volver a mi dinero
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: 20 }}>
      {step === "recipient" && (
        <>
          <h2 style={{ fontSize: "2rem", marginBottom: 12 }}>¿A quién quieres enviar dinero?</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {people.map((person) => (
              <button
                key={person.id}
                className="elder-button"
                style={{ justifyContent: "space-between", textAlign: "left", width: "100%" }}
                onClick={() => {
                  setSelectedPerson(person);
                  setStep("amount");
                }}
              >
                <span>
                  <strong>{person.name}</strong><br />
                  <small>{person.relationship}</small>
                </span>
                <span style={{ fontSize: "0.8rem" }}>•••• {String(person.id || "0000").slice(-4)}</span>
              </button>
            ))}
            <button className="elder-button" onClick={onAdd} style={{ width: "100%" }}>
              + Nueva persona
            </button>
          </div>
        </>
      )}

      {step === "amount" && (
        <>
          <h2 style={{ fontSize: "2rem", marginBottom: 12 }}>¿Cuánto quieres enviar?</h2>
          <div style={{ fontSize: "2.5rem", fontWeight: 700, textAlign: "center", padding: 18, background: "#f5f7fb", borderRadius: 12, marginBottom: 18 }}>
            {displayAmount}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <button key={n} className="elder-button" onClick={() => addDigit(n)} style={{ fontSize: "1.4rem", padding: "18px 0" }}>
                {n}
              </button>
            ))}
            <button className="elder-button" onClick={() => setAmount(0)} style={{ fontSize: "1.2rem", padding: "18px 0" }}>C</button>
            <button className="elder-button" onClick={() => addDigit(0)} style={{ fontSize: "1.4rem", padding: "18px 0" }}>0</button>
            <button className="elder-button" onClick={backspace} style={{ fontSize: "1.2rem", padding: "18px 0" }}>⌫</button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn-secondary" onClick={() => setStep("recipient")}>Regresar</button>
            <button className="elder-button primary" onClick={() => setStep("concept")} style={{ flex: 1 }} disabled={!amount}>Continuar</button>
          </div>
        </>
      )}

      {step === "concept" && (
        <>
          <h2 style={{ fontSize: "2rem", marginBottom: 12 }}>¿Para qué es esta transferencia?</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {CONCEPT_OPTIONS.map((option) => (
              <button key={option} className="elder-button" onClick={() => { setConcept(option); setStep("review"); }} style={{ textAlign: "left", width: "100%" }}>
                {option}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Escribe una explicación si quieres</label>
            <textarea value={customNote} onChange={(e) => setCustomNote(e.target.value)} rows={4} style={{ width: "100%", resize: "vertical", font: "inherit", borderRadius: 10, border: "1px solid #dfe4ef", padding: 12 }} placeholder="Ej. Ayuda para la universidad de Laura" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn-secondary" onClick={() => setStep("amount")}>Regresar</button>
            <button className="elder-button primary" onClick={() => setStep("review")} style={{ flex: 1 }}>Continuar</button>
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <h2 style={{ fontSize: "2rem", marginBottom: 12 }}>Revisa tu transferencia</h2>
          <div style={{ background: "#f5f7fb", borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px" }}><strong>Enviar a:</strong> {selectedPerson?.name}</p>
            <p style={{ margin: "0 0 8px" }}><strong>Monto:</strong> {displayAmount}</p>
            <p style={{ margin: 0 }}><strong>Concepto:</strong> {concept === "Otro" ? (customNote || "Otro") : concept}</p>
          </div>
          {reviewReason && (
            <div style={{ background: "#fff3cd", color: "#7a4b00", border: "1px solid #f1d49b", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              {reviewReason}
            </div>
          )}
          <p style={{ marginBottom: 20, fontSize: "1.1rem" }}>¿Quieres enviar este dinero?</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-secondary" onClick={() => setStep("recipient")}>Cancelar</button>
            <button className="elder-button primary" onClick={() => finishTransfer()} disabled={busy} style={{ flex: 1 }}>
              {busy ? "Enviando…" : "Sí, enviar dinero"}
            </button>
          </div>
          {reviewReason && (
            <div style={{ marginTop: 16 }}>
              <button className="elder-button" onClick={() => finishTransfer(true)} style={{ width: "100%" }}>
                Confirmar de todos modos
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
