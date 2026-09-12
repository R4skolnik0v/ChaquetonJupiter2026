// localEngine.js
// -----------------------------------------------------------------------
// Offline fallback: mirrors backend/app/engines/*.py, backend/app/scenarios.py
// and backend/app/routers/exceptions.py, entirely in the browser. If the
// FastAPI backend isn't reachable, the whole demo -- all 5 scenarios, plus
// "empezar desde cero" -- still works. api.js tries the real backend first
// and only drops down to this file on a network failure.
//
// The Python files are the source of truth; this file has to be kept in
// sync with them by hand.
// -----------------------------------------------------------------------

const ANOMALY_MULTIPLIER = 2.0;
const NON_DELEGABLE_ACTIONS = [
  "Transferencia",
  "Retiro",
  "Cambio de beneficiario",
  "Cambio de titularidad",
  "Préstamo",
];

function uid() {
  return crypto.randomUUID();
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function daysAhead(n) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

function monthKey(iso) {
  return iso.slice(0, 7);
}

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------
// Behavioral baseline + escalation (mirrors engines/behavior_baseline.py)
// ---------------------------------------------------------------------
function buildBaseline(transactions, category) {
  const amounts = transactions.filter((t) => t.category === category).map((t) => t.amount);
  if (amounts.length === 0) return null;
  return { category, avgAmount: Math.round(mean(amounts) * 100) / 100, sampleSize: amounts.length };
}

function detectEscalation(amountsInOrder, minSteps = 3) {
  if (amountsInOrder.length < minSteps) return false;
  const last = amountsInOrder.slice(-minSteps);
  return last.every((v, i) => i === 0 || last[i - 1] < v);
}

// ---------------------------------------------------------------------
// Risk engine (mirrors engines/risk_engine.py)
// ---------------------------------------------------------------------
function checkAmountAnomaly(amount, baseline) {
  if (!baseline || baseline.avgAmount <= 0) return { isAnomaly: false, multiplier: 1, baselineAvg: 0 };
  const multiplier = Math.round((amount / baseline.avgAmount) * 10) / 10;
  return { isAnomaly: multiplier >= ANOMALY_MULTIPLIER, multiplier, baselineAvg: baseline.avgAmount };
}

function checkBoundaryPattern(recentAmounts, limit, proximityPct = 0.05, minOccurrences = 3) {
  if (!recentAmounts.length || !limit || limit <= 0) return false;
  const threshold = limit * (1 - proximityPct);
  const closeCalls = recentAmounts.filter((a) => a >= threshold && a <= limit * 1.01);
  return closeCalls.length >= minOccurrences;
}

// ---------------------------------------------------------------------
// Decision engine (mirrors engines/decision_engine.py)
// Deterministic rules always run first and always win. A BLOCKED result is
// only ever exception_eligible when the sole reason was a spending cap.
// ---------------------------------------------------------------------
function evaluateTransaction({ category, amount, mission, forbiddenActions, monthSpentInMission, baseline, recentAmounts }) {
  if (!mission) {
    const anomaly = checkAmountAnomaly(amount, baseline);
    if (anomaly.isAnomaly) {
      return {
        status: "REVIEW",
        reasons: ["Este gasto es más alto de lo habitual para esta categoría."],
        comparison: { baseline_avg: anomaly.baselineAvg, amount, multiplier: anomaly.multiplier },
        exception_eligible: false,
      };
    }
    return { status: "APPROVED", reasons: ["Movimiento de la cuenta propia."], comparison: null, exception_eligible: false };
  }

  const nowIso = new Date().toISOString();
  if (mission.end_date && nowIso > mission.end_date) {
    return {
      status: "BLOCKED",
      reasons: ["Esta misión ya expiró.", "Ninguna misión vencida puede autorizar transacciones."],
      comparison: null,
      exception_eligible: false,
    };
  }
  if (mission.start_date && nowIso < mission.start_date) {
    return { status: "BLOCKED", reasons: ["Esta misión todavía no comienza."], comparison: null, exception_eligible: false };
  }

  const allForbidden = new Set([...NON_DELEGABLE_ACTIONS, ...forbiddenActions]);
  if (allForbidden.has(category)) {
    return {
      status: "BLOCKED",
      reasons: [`'${category}' no está permitido bajo ninguna misión.`, "Regla determinista: ninguna IA puede aprobar esta acción."],
      comparison: null,
      exception_eligible: false,
    };
  }

  if (!mission.allowed_categories.includes(category)) {
    return { status: "BLOCKED", reasons: [`La misión activa no incluye la categoría '${category}'.`], comparison: null, exception_eligible: false };
  }

  const perTxLimit = mission.per_transaction_limit;
  if (perTxLimit && amount > perTxLimit) {
    return {
      status: "BLOCKED",
      reasons: [
        `Esta persona está autorizada para pagar ${category}, pero solo hasta $${perTxLimit.toLocaleString()} por transacción.`,
        `Este pago es de $${amount.toLocaleString()}.`,
      ],
      comparison: null,
      exception_eligible: true,
    };
  }

  const projectedTotal = monthSpentInMission + amount;
  if (projectedTotal > mission.monthly_limit) {
    return {
      status: "BLOCKED",
      reasons: [
        `Excede el límite mensual autorizado ($${mission.monthly_limit.toLocaleString()}).`,
        `Total del mes sería $${projectedTotal.toLocaleString()}.`,
      ],
      comparison: null,
      exception_eligible: true,
    };
  }

  const anomaly = checkAmountAnomaly(amount, baseline);
  if (anomaly.isAnomaly) {
    return {
      status: "REVIEW",
      reasons: [
        "Comercio autorizado.",
        "Dentro del límite mensual.",
        `Monto ${anomaly.multiplier}x mayor al habitual (normalmente ~$${anomaly.baselineAvg.toLocaleString()}).`,
      ],
      comparison: { baseline_avg: anomaly.baselineAvg, amount, multiplier: anomaly.multiplier },
      exception_eligible: false,
    };
  }

  const referenceLimit = perTxLimit || mission.monthly_limit;
  if (checkBoundaryPattern([...recentAmounts, amount], referenceLimit)) {
    return {
      status: "REVIEW",
      reasons: [
        "Comercio autorizado.",
        "Dentro del límite mensual.",
        "Varias transacciones recientes se acercan repetidamente al límite autorizado.",
        "Esto no significa fraude -- solo pedimos que alguien lo revise.",
      ],
      comparison: null,
      exception_eligible: false,
    };
  }

  if (detectEscalation([...recentAmounts, amount])) {
    return {
      status: "REVIEW",
      reasons: [
        "Comercio autorizado.",
        "Dentro del límite mensual.",
        "Los montos han ido subiendo de forma sostenida en las últimas transacciones.",
        "Posible comportamiento de búsqueda del límite -- se aleja poco a poco de lo habitual.",
      ],
      comparison: null,
      exception_eligible: false,
    };
  }

  return {
    status: "APPROVED",
    reasons: ["Comercio autorizado.", "Dentro del límite mensual.", "Monto habitual.", "Misión activa."],
    comparison: null,
    exception_eligible: false,
  };
}

// ---------------------------------------------------------------------
// Mission compiler (mirrors engines/mission_compiler.py) -- unchanged by
// the multi-scenario work, it never assumed a specific person.
// ---------------------------------------------------------------------
const RELATIONSHIP_KEYWORDS = ["hija", "hijo", "nieta", "nieto", "cuidador", "cuidadora", "sobrina", "sobrino"];

const PURPOSE_CATEGORY_MAP = [
  { keywords: ["servicio", "recibo", "luz", "cfe", "agua", "gas"], categories: ["CFE", "Agua", "Gas"] },
  { keywords: ["farmacia", "medicin", "receta"], categories: ["Farmacia"] },
  { keywords: ["supermercado", "comida", "despensa", "mandado"], categories: ["Supermercado"] },
  { keywords: ["gasto", "ayuda", "administrar", "cuenta"], categories: ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"] },
];

const DEFAULT_CATEGORIES = ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"];

function detectRelationship(text) {
  const lower = text.toLowerCase();
  return RELATIONSHIP_KEYWORDS.find((kw) => lower.includes(kw)) || null;
}

function detectDurationDays(text) {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d+)\s*(día|dias|semana|quincena|mes|meses)/);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2];
    if (unit.startsWith("día") || unit.startsWith("dia")) return n;
    if (unit.startsWith("semana")) return n * 7;
    if (unit.startsWith("quincena")) return n * 15;
    if (unit.startsWith("mes")) return n * 30;
  }
  if (lower.includes("semana")) return 7;
  if (lower.includes("quincena")) return 15;
  if (lower.includes("mes")) return 30;
  return 30;
}

function detectCategories(text) {
  const lower = text.toLowerCase();
  const matched = [];
  let categories = [];
  for (const { keywords, categories: cats } of PURPOSE_CATEGORY_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.push(kw);
        for (const c of cats) if (!categories.includes(c)) categories.push(c);
      }
    }
  }
  if (categories.length === 0) categories = DEFAULT_CATEGORIES;
  return { categories, matched };
}

function suggestLimit(categories, baselines) {
  let total = 0;
  for (const cat of categories) {
    const b = baselines[cat];
    total += b ? b.avgAmount * 1.3 : 300;
  }
  total *= 1.2;
  return Math.ceil(total / 100) * 100;
}

function compileMissionLocal(text, baselines) {
  const relationship = detectRelationship(text);
  const days = detectDurationDays(text);
  const { categories, matched } = detectCategories(text);
  const limit = suggestLimit(categories, baselines);

  let purpose = "Gastos esenciales del hogar";
  if (matched.includes("farmacia") || matched.includes("medicin")) purpose = "Farmacia y salud";
  else if (categories.length === 1 && categories[0] === "Supermercado") purpose = "Supermercado y despensa";
  else if (categories.join() === ["CFE", "Agua", "Gas"].join()) purpose = "Pago de servicios del hogar";

  return {
    delegate_relationship: relationship,
    purpose,
    days,
    allowed_categories: categories,
    suggested_limit: limit,
    forbidden_actions: [...NON_DELEGABLE_ACTIONS],
    matched_keywords: matched,
  };
}

// ---------------------------------------------------------------------
// Intent Engine (mirrors engines/intent_engine.py) -- the "IA" the account
// owner talks to for everything beyond "create my first mission" (that
// narrower case reuses compileMissionLocal above, same as the backend).
// ---------------------------------------------------------------------

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(words) {
  return words.map(stripAccents);
}

const SINGLE_CATEGORY_KEYWORDS = {
  CFE: norm(["cfe", "luz", "electricidad"]),
  Agua: norm(["agua"]),
  Gas: norm(["gas"]),
  Farmacia: norm(["farmacia", "medicin", "receta", "medicamento"]),
  Supermercado: norm(["supermercado", "comida", "despensa", "mandado"]),
};

const ACTION_KEYWORDS = {
  Transferencia: norm(["transferencia", "transferir", "transferencias", "transfiera"]),
  Retiro: norm(["retiro", "retirar", "sacar dinero", "sacar efectivo", "efectivo"]),
  "Cambio de beneficiario": norm(["beneficiario"]),
  "Préstamo": norm(["prestamo", "credito"]),
};

const CONTINUITY_WORDS = norm(["continuidad", "no pueda administrar", "no puedo administrar", "si no puedo",
  "mientras no pueda", "incapacitad", "no pueda encargarme"]);
const DISABLE_CONTINUITY_WORDS = norm(["desactiva", "cancela", "termina", "apaga", "detener", "quita la continuidad"]);
const ADD_PERSON_WORDS = norm(["persona de confianza", "agregar a", "añadir a", "agrega a", "añade a",
  "quiero agregar", "quiero añadir", "nueva persona"]);
const REMOVE_PERSON_WORDS = norm(["quitar a", "eliminar a", "remueve a", "sacalo", "sacala", "borra a", "quita a", "ya no confio en"]);
const REVOKE_WORDS = norm(["ya no quiero que", "quitale", "no quiero que", "no puede", "no deberia poder",
  "quitale el permiso", "quitarle el permiso", "revocar", "revoca", "no debe poder"]);
const GRANT_WORDS = norm(["quiero que", "autoriza a", "dale permiso", "permite que", "deja que", "que pueda"]);
const LIMIT_WORDS = norm(["limite", "tope"]);
const DURATION_WORDS = norm(["duracion", "mas tiempo", "extiende", "extender", "dias mas"]);
const QUESTION_WORDS = norm(["cuanto", "como van", "que gaste", "explicame", "como esta"]);

function detectSingleTarget(lower) {
  for (const [action, kws] of Object.entries(ACTION_KEYWORDS)) if (kws.some((k) => lower.includes(k))) return action;
  for (const [cat, kws] of Object.entries(SINGLE_CATEGORY_KEYWORDS)) if (kws.some((k) => lower.includes(k))) return cat;
  return null;
}

function resolvePerson(lowerText, trustNetwork) {
  for (const m of trustNetwork) {
    const name = stripAccents((m.name || "").toLowerCase());
    if (name && new RegExp(`\\b${name}\\b`).test(lowerText)) return m;
  }
  for (const m of trustNetwork) {
    const rel = stripAccents((m.relationship || "").toLowerCase());
    if (rel && lowerText.includes(rel)) return m;
  }
  return null;
}

function findActiveMissionFor(person, missions) {
  if (!person) return null;
  const nowIso = new Date().toISOString();
  return missions.find((m) => m.delegate_id === person.member_id && m.status === "active" && m.end_date >= nowIso) || null;
}

function extractAmount(lower) {
  const m = lower.match(/\$\s?(\d[\d,]*)(?:\.\d+)?/) || lower.match(/(\d[\d,]{2,})\s*pesos/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ""));
  return Number.isNaN(v) ? null : v;
}

function extractDaysMentioned(lower) {
  const m = lower.match(/(\d+)\s*(dia|semana|mes)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (m[2].startsWith("semana")) return n * 7;
  if (m[2].startsWith("mes")) return n * 30;
  return n;
}

function extractCapitalizedName(text, trustNetwork) {
  const existing = new Set(trustNetwork.map((m) => (m.name || "").toLowerCase()));
  const stop = new Set(["quiero", "ya", "voy", "necesito"]);
  const matches = text.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g) || [];
  for (const w of matches) {
    if (!existing.has(w.toLowerCase()) && !stop.has(w.toLowerCase())) return w;
  }
  return null;
}

function proposeRevoke(person, target, mission) {
  if (NON_DELEGABLE_ACTIONS.includes(target)) {
    return {
      intent: "REVOKE_PERMISSION", requires_confirmation: true,
      confirmation_text: `Entendí que quieres quitarle a ${person.name} el permiso para '${target}'. Buena noticia: eso nunca estuvo permitido para nadie, así que no hay nada que cambiar.`,
      proposal: { delegate_name: person.name, category: target, mission_id: mission ? mission.id : null, already_blocked: true },
    };
  }
  if (!mission) {
    return {
      intent: "REVOKE_PERMISSION", requires_confirmation: true,
      confirmation_text: `${person.name} no tiene ninguna misión activa ahora mismo, así que no hay nada que quitarle en '${target}'.`,
      proposal: { delegate_name: person.name, category: target, mission_id: null, already_blocked: true },
    };
  }
  if (!mission.allowed_categories.includes(target)) {
    return {
      intent: "REVOKE_PERMISSION", requires_confirmation: true,
      confirmation_text: `${person.name} ya no podía hacer eso -- '${target}' no estaba entre lo que tenía permitido.`,
      proposal: { delegate_name: person.name, category: target, mission_id: mission.id, already_blocked: true },
    };
  }
  return {
    intent: "REVOKE_PERMISSION", requires_confirmation: true,
    confirmation_text: `Entendí que quieres quitarle a ${person.name} el permiso para '${target}'.`,
    proposal: {
      delegate_name: person.name, category: target, mission_id: mission.id, already_blocked: false,
      remaining_categories: mission.allowed_categories.filter((c) => c !== target),
    },
  };
}

function proposeGrant(person, target, mission) {
  if (NON_DELEGABLE_ACTIONS.includes(target)) {
    return {
      intent: "GRANT_PERMISSION", requires_confirmation: true,
      confirmation_text: `'${target}' nunca se puede autorizar, ni siquiera para ${person.name} -- es una regla fija del sistema.`,
      proposal: { delegate_name: person.name, category: target, mission_id: mission.id, already_allowed: false, blocked_forever: true },
    };
  }
  if (mission.allowed_categories.includes(target)) {
    return {
      intent: "GRANT_PERMISSION", requires_confirmation: true,
      confirmation_text: `${person.name} ya puede hacer eso -- '${target}' ya estaba permitido.`,
      proposal: { delegate_name: person.name, category: target, mission_id: mission.id, already_allowed: true },
    };
  }
  return {
    intent: "GRANT_PERMISSION", requires_confirmation: true,
    confirmation_text: `Entendí que quieres que ${person.name} también pueda encargarse de '${target}'.`,
    proposal: { delegate_name: person.name, category: target, mission_id: mission.id, already_allowed: false, new_categories: [...mission.allowed_categories, target] },
  };
}

function proposeRemoveTrustedPerson(person) {
  return {
    intent: "REMOVE_TRUSTED_PERSON", requires_confirmation: true,
    confirmation_text: `Entendí que ya no quieres que ${person.name} pueda ayudarte con nada. Esto termina cualquier misión activa que tenga.`,
    proposal: { trust_id: person.trust_id, member_id: person.member_id, name: person.name },
  };
}

function proposeAddTrustedPerson(text, lower, trustNetwork) {
  const name = extractCapitalizedName(text, trustNetwork);
  const relationship = detectRelationship(lower) || "familiar";
  return {
    intent: "ADD_TRUSTED_PERSON", requires_confirmation: true,
    confirmation_text: name
      ? `Entendí que quieres agregar a ${name} (${relationship}) para que pueda ayudarte.`
      : "Quiero agregar a alguien de tu confianza, pero no logré identificar el nombre -- puedes escribirlo abajo.",
    proposal: { name, relationship, role: "Ayudante", can_pay_bills: true, can_review_alerts: true },
  };
}

function proposeContinuity(text, lower, context, isUpdate) {
  const days = detectDurationDays(text);
  const { categories } = detectCategories(text);
  const limit = suggestLimit(categories, context.baselines);
  const person = resolvePerson(lower, context.trustNetwork);
  const existing = context.continuityRule;
  const delegateName = person ? person.name : existing ? existing.delegate_name : null;
  const backupName = existing ? existing.backup_name : null;
  const intent = isUpdate ? "MODIFY_CONTINUITY" : "ENABLE_CONTINUITY";
  const verb = isUpdate ? "actualizar" : "configurar";
  const who = delegateName || "la persona que elijas";
  return {
    intent, requires_confirmation: true,
    confirmation_text: `Entendí que quieres ${verb} tu plan de continuidad: si no puedes administrar tus finanzas, ${who} podría ayudarte con esto, hasta $${limit.toLocaleString()} al mes, por ${days} días.`,
    proposal: { trigger_label: "Si no puede administrar sus finanzas temporalmente", delegate_name: delegateName, backup_name: backupName, allowed_categories: categories, monthly_limit: limit, days },
  };
}

function proposeDisableContinuity() {
  return { intent: "DISABLE_CONTINUITY", requires_confirmation: true, confirmation_text: "Entendí que quieres desactivar tu plan de continuidad ahora mismo.", proposal: { no_change: false } };
}

function proposeAlreadyInactiveContinuity() {
  return { intent: "DISABLE_CONTINUITY", requires_confirmation: true, confirmation_text: "Tu plan de continuidad ya está desactivado -- no hay nada que apagar.", proposal: { no_change: true } };
}

function proposeModifyLimit(person, mission, amount, lower) {
  const perTx = ["por transaccion", "por pago", "cada vez"].some((w) => lower.includes(w));
  const field = perTx ? "per_transaction_limit" : "monthly_limit";
  const label = perTx ? "por transacción" : "al mes";
  return {
    intent: "MODIFY_LIMIT", requires_confirmation: true,
    confirmation_text: `Entendí que quieres cambiar el límite de ${person.name} a $${amount.toLocaleString()} ${label}.`,
    proposal: { delegate_name: person.name, mission_id: mission.id, field, new_value: amount },
  };
}

function proposeModifyDuration(person, mission, days, lower) {
  const extend = ["mas", "extiende", "extender"].some((w) => lower.includes(w));
  return {
    intent: "MODIFY_DURATION", requires_confirmation: true,
    confirmation_text: extend
      ? `Entendí que quieres darle ${days} días más a la misión de ${person.name}.`
      : `Entendí que quieres que la misión de ${person.name} dure ${days} días en total.`,
    proposal: { delegate_name: person.name, mission_id: mission.id, days, mode: extend ? "extend" : "set" },
  };
}

function proposeCreateMission(text, context) {
  const draft = compileMissionLocal(text, context.baselines);
  let delegateName = null;
  if (draft.delegate_relationship) {
    const m = context.trustNetwork.find((t) => t.relationship === draft.delegate_relationship);
    if (m) delegateName = m.name;
  }
  if (!delegateName) {
    const person = resolvePerson(stripAccents(text.toLowerCase()), context.trustNetwork);
    if (person) delegateName = person.name;
  }
  return {
    intent: "CREATE_MISSION", requires_confirmation: true,
    confirmation_text: `Entendí que quieres que ${delegateName || "alguien de tu confianza"} te ayude con ${draft.purpose.toLowerCase()}, por ${draft.days} días.`,
    proposal: { delegate_name: delegateName, purpose: draft.purpose, days: draft.days, allowed_categories: draft.allowed_categories, suggested_limit: draft.suggested_limit, forbidden_actions: draft.forbidden_actions, source_text: text },
  };
}

function proposeModifyMission(text, person, mission, context) {
  const draft = compileMissionLocal(text, context.baselines);
  return {
    intent: "MODIFY_MISSION", requires_confirmation: true,
    confirmation_text: `Entendí que quieres cambiar la misión de ${person.name}.`,
    proposal: { delegate_name: person.name, mission_id: mission.id, purpose: draft.purpose, days: draft.days, allowed_categories: draft.allowed_categories, suggested_limit: draft.suggested_limit, source_text: text },
  };
}

function proposeGeneralQuestion() {
  return {
    intent: "GENERAL_FINANCIAL_QUESTION", requires_confirmation: false, confirmation_text: null,
    proposal: { answer: "Puedo ayudarte a ver tus gastos en \u201cExplícame mis gastos\u201d, o puedes escribir aquí mismo qué quieres cambiar -- quién te ayuda, con qué, cuánto, o por cuánto tiempo." },
  };
}

function classifyAndPropose(text, context) {
  const lower = stripAccents(text.toLowerCase());
  const person = resolvePerson(lower, context.trustNetwork);
  const target = detectSingleTarget(lower);
  const activeMission = findActiveMissionFor(person, context.missions);

  if (CONTINUITY_WORDS.some((w) => lower.includes(w))) {
    const wantsDisable = DISABLE_CONTINUITY_WORDS.some((w) => lower.includes(w));
    if (wantsDisable) {
      if (context.continuityRule && context.continuityRule.active) return proposeDisableContinuity();
      return proposeAlreadyInactiveContinuity();
    }
    return proposeContinuity(text, lower, context, !!context.continuityRule);
  }

  if (ADD_PERSON_WORDS.some((w) => lower.includes(w))) return proposeAddTrustedPerson(text, lower, context.trustNetwork);

  if (person && REMOVE_PERSON_WORDS.some((w) => lower.includes(w))) return proposeRemoveTrustedPerson(person);

  if (person && target) {
    if (REVOKE_WORDS.some((w) => lower.includes(w))) return proposeRevoke(person, target, activeMission);
    if (GRANT_WORDS.some((w) => lower.includes(w)) && activeMission) return proposeGrant(person, target, activeMission);
  }

  if (person && REVOKE_WORDS.some((w) => lower.includes(w)) && !target) return proposeRemoveTrustedPerson(person);

  if (person && activeMission) {
    const amount = extractAmount(lower);
    if (amount && LIMIT_WORDS.some((w) => lower.includes(w))) return proposeModifyLimit(person, activeMission, amount, lower);
    const days = extractDaysMentioned(lower);
    if (days && DURATION_WORDS.some((w) => lower.includes(w))) return proposeModifyDuration(person, activeMission, days, lower);
  }

  if (!person && QUESTION_WORDS.some((w) => lower.includes(w))) return proposeGeneralQuestion();

  if (person && activeMission) return proposeModifyMission(text, person, activeMission, context);
  return proposeCreateMission(text, context);
}


const SCENARIOS = [
  {
    id: "maria", name: "María Balcázar", age: 72, balance: 12430.0,
    emoji: "🧓🏽", tagline: "Delegación segura de tareas",
    headline: "María necesita ayuda con sus servicios mientras se recupera de una cirugía.",
    delegate: { name: "Laura", relationship: "hija" }, backup: { name: "Carlos", relationship: "hijo" },
    mission: {
      purpose: "Ayudar con gastos esenciales mientras María se recupera", days: 30,
      monthly_limit: 4000, per_transaction_limit: null,
      allowed_categories: ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"],
      source_text: "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome.",
    },
    continuity: { trigger_label: "Si María no puede administrar sus finanzas", allowed_categories: ["CFE", "Agua", "Gas", "Farmacia"], monthly_limit: 4000, days: 30 },
    history: [
      ["CFE", "CFE", 205, 85], ["CFE", "CFE", 190, 75], ["CFE", "CFE", 183, 65], ["CFE", "CFE", 195, 40],
      ["Farmacia San Pablo", "Farmacia", 300, 42], ["Farmacia San Pablo", "Farmacia", 320, 35],
      ["Farmacia San Pablo", "Farmacia", 350, 11], ["Farmacia San Pablo", "Farmacia", 340, 8], ["Farmacia San Pablo", "Farmacia", 350, 3],
      ["Soriana", "Supermercado", 1250, 38], ["Soriana", "Supermercado", 1200, 20], ["Soriana", "Supermercado", 1220, 10], ["Soriana", "Supermercado", 1230, 1],
      ["Gas Natural", "Gas", 150, 33], ["Gas Natural", "Gas", 150, 6],
      ["Agua y Drenaje", "Agua", 220, 30],
      ["Administración Condominio", "Vivienda", 3600, 28], ["Administración Condominio", "Vivienda", 3600, 7],
      ["Uber", "Transporte", 460, 25], ["Uber", "Transporte", 710, 4],
      ["Restaurante El Tigre", "Restaurante", 500, 15], ["Restaurante El Tigre", "Restaurante", 500, 2],
    ],
    scheduled: [["Luz", "CFE", 183, 6], ["Agua", "Agua", 240, 10]],
    presets: [
      { label: "CFE — $183 (normal)", merchant: "CFE", category: "CFE", amount: 183 },
      { label: "Farmacia — $420 (normal)", merchant: "Farmacia San Pablo", category: "Farmacia", amount: 420 },
      { label: "Transferencia — $5,000", merchant: "Transferencia SPEI", category: "Transferencia", amount: 5000 },
      { label: "CFE — $1,420 (inusual)", merchant: "CFE", category: "CFE", amount: 1420 },
    ],
  },
  {
    id: "carlos", name: "Carlos Medina", age: 69, balance: 9800.0,
    emoji: "💊", tagline: "Detección de comportamiento anómalo",
    headline: "Un cargo en la farmacia no se parece en nada a lo que Carlos gasta normalmente.",
    delegate: { name: "Ana", relationship: "hija" }, backup: { name: "Luis", relationship: "sobrino" },
    mission: {
      purpose: "Ayudar con farmacia y supermercado", days: 30, monthly_limit: 6000, per_transaction_limit: null,
      allowed_categories: ["Farmacia", "Supermercado"],
      source_text: "Quiero que mi hija me ayude a comprar mis medicinas y la despensa.",
    },
    continuity: null,
    history: [
      ["Farmacia Guadalajara", "Farmacia", 320, 60], ["Farmacia Guadalajara", "Farmacia", 350, 45],
      ["Farmacia Guadalajara", "Farmacia", 300, 20], ["Farmacia Guadalajara", "Farmacia", 480, 10],
      ["Walmart", "Supermercado", 950, 33], ["Walmart", "Supermercado", 900, 12],
    ],
    scheduled: [],
    presets: [
      { label: "Farmacia — $380 (normal)", merchant: "Farmacia Guadalajara", category: "Farmacia", amount: 380 },
      { label: "Farmacia — $3,800 (inusual)", merchant: "Farmacia Guadalajara", category: "Farmacia", amount: 3800 },
      { label: "Transferencia — $1,000", merchant: "Transferencia SPEI", category: "Transferencia", amount: 1000 },
    ],
  },
  {
    id: "elena", name: "Elena Torres", age: 75, balance: 15200.0,
    emoji: "🛟", tagline: "Continuidad financiera",
    headline: "Elena quedó temporalmente incapacitada y ya había autorizado un plan para este momento.",
    delegate: { name: "Sofía", relationship: "hija" }, backup: { name: "Diego", relationship: "hijo" },
    mission: null,
    continuity: { trigger_label: "Si Elena no puede administrar sus finanzas temporalmente", allowed_categories: ["CFE", "Agua", "Farmacia", "Supermercado"], monthly_limit: 3500, days: 30 },
    history: [
      ["CFE", "CFE", 190, 70], ["CFE", "CFE", 205, 50], ["CFE", "CFE", 195, 20],
      ["Farmacia del Ahorro", "Farmacia", 320, 40], ["Farmacia del Ahorro", "Farmacia", 340, 15],
      ["Superama", "Supermercado", 1100, 35], ["Superama", "Supermercado", 1150, 14],
      ["Agua y Drenaje", "Agua", 210, 25],
    ],
    scheduled: [],
    presets: [
      { label: "CFE — $195 (normal)", merchant: "CFE", category: "CFE", amount: 195 },
      { label: "Farmacia — $2,000 (inusual)", merchant: "Farmacia del Ahorro", category: "Farmacia", amount: 2000 },
      { label: "Transferencia — $1,500", merchant: "Transferencia SPEI", category: "Transferencia", amount: 1500 },
    ],
  },
  {
    id: "roberto", name: "Roberto Salinas", age: 71, balance: 21000.0,
    emoji: "🧾", tagline: "Límites de permisos",
    headline: "Roberto autorizó a su hijo a pagar CFE -- pero solo hasta un límite.",
    delegate: { name: "Andrés", relationship: "hijo" }, backup: { name: "Marta", relationship: "hija" },
    mission: {
      purpose: "Pagar el recibo de CFE", days: 60, monthly_limit: 3000, per_transaction_limit: 500,
      allowed_categories: ["CFE"],
      source_text: "Quiero que mi hijo pague el recibo de la luz, pero solo hasta $500 por pago.",
    },
    continuity: null,
    history: [["CFE", "CFE", 180, 55], ["CFE", "CFE", 200, 35], ["CFE", "CFE", 190, 15]],
    scheduled: [],
    presets: [
      { label: "CFE — $183 (normal)", merchant: "CFE", category: "CFE", amount: 183 },
      { label: "CFE — $742 (excede su límite)", merchant: "CFE", category: "CFE", amount: 742 },
      { label: "Transferencia — $2,000", merchant: "Transferencia SPEI", category: "Transferencia", amount: 2000 },
    ],
  },
  {
    id: "patricia", name: "Patricia Nuño", age: 67, balance: 7650.0,
    emoji: "🚨", tagline: "Comportamiento de búsqueda del límite",
    headline: "Varios pagos, uno tras otro, se acercan cada vez más al límite autorizado.",
    delegate: { name: "Renata", relationship: "hija" }, backup: { name: "Iván", relationship: "sobrino" },
    mission: {
      purpose: "Ayudar con el supermercado", days: 30, monthly_limit: 5000, per_transaction_limit: 500,
      allowed_categories: ["Supermercado"],
      source_text: "Quiero que mi hija me ayude a hacer las compras del supermercado, hasta $500 por compra.",
    },
    continuity: null,
    history: [["Chedraui", "Supermercado", 300, 40], ["Chedraui", "Supermercado", 290, 25]],
    scheduled: [],
    presets: [
      { label: "Supermercado — $150", merchant: "Chedraui", category: "Supermercado", amount: 150 },
      { label: "Supermercado — $250", merchant: "Chedraui", category: "Supermercado", amount: 250 },
      { label: "Supermercado — $350 (empieza a subir)", merchant: "Chedraui", category: "Supermercado", amount: 350 },
      { label: "Supermercado — $480 (cerca del límite)", merchant: "Chedraui", category: "Supermercado", amount: 480 },
      { label: "Supermercado — $500 (en el límite)", merchant: "Chedraui", category: "Supermercado", amount: 500 },
      { label: "Transferencia — $600", merchant: "Transferencia SPEI", category: "Transferencia", amount: 600 },
    ],
  },
];

const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

function listScenarioMeta() {
  return SCENARIOS.map((s) => ({
    id: s.id, name: s.name, age: s.age, emoji: s.emoji, tagline: s.tagline,
    headline: s.headline, delegate_name: s.delegate?.name, presets: s.presets || [],
  }));
}

// ---------------------------------------------------------------------
// Generic scenario -> store provisioning (mirrors scenarios.provision_scenario)
// ---------------------------------------------------------------------
function buildScenarioStore(scenario) {
  const userId = scenario.id;
  let delegateId = null;
  let backupId = null;
  const familyMembers = [];
  const trustNetwork = [];

  if (scenario.delegate) {
    delegateId = uid();
    familyMembers.push({ id: delegateId, user_id: userId, name: scenario.delegate.name, relationship: scenario.delegate.relationship });
    trustNetwork.push({ id: uid(), user_id: userId, member_id: delegateId, role: "Ayudante principal", can_pay_bills: true, can_review_alerts: true, can_change_beneficiaries: false });
  }
  if (scenario.backup) {
    backupId = uid();
    familyMembers.push({ id: backupId, user_id: userId, name: scenario.backup.name, relationship: scenario.backup.relationship });
    trustNetwork.push({ id: uid(), user_id: userId, member_id: backupId, role: "Respaldo", can_pay_bills: false, can_review_alerts: true, can_change_beneficiaries: false });
  }

  const missions = [];
  let missionId = null;
  if (scenario.mission && delegateId) {
    missionId = uid();
    missions.push({
      id: missionId, owner_id: userId, delegate_id: delegateId,
      delegate_name: scenario.delegate.name, purpose: scenario.mission.purpose,
      start_date: daysAgo(0), end_date: daysAhead(scenario.mission.days),
      monthly_limit: scenario.mission.monthly_limit, per_transaction_limit: scenario.mission.per_transaction_limit,
      allowed_categories: [...scenario.mission.allowed_categories], forbidden_actions: [...NON_DELEGABLE_ACTIONS],
      status: "active", source_text: scenario.mission.source_text,
    });
  }

  const transactions = (scenario.history || []).map(([merchant, category, amount, when]) => ({
    id: uid(), user_id: userId, mission_id: null, merchant, category, amount,
    timestamp: daysAgo(when), status: "APPROVED", reasons: ["Historial de gastos personales."],
  }));
  for (const [merchant, category, amount, when] of scenario.scheduled || []) {
    transactions.push({ id: uid(), user_id: userId, mission_id: missionId, merchant, category, amount, timestamp: daysAhead(when), status: "SCHEDULED", reasons: [] });
  }

  let continuityRule = null;
  if (scenario.continuity && delegateId) {
    continuityRule = {
      id: uid(), user_id: userId, trigger_label: scenario.continuity.trigger_label,
      delegate_id: delegateId, delegate_name: scenario.delegate.name,
      backup_id: backupId, backup_name: scenario.backup?.name || null,
      allowed_categories: [...scenario.continuity.allowed_categories],
      monthly_limit: scenario.continuity.monthly_limit, days: scenario.continuity.days,
      active: false, activated_at: null,
    };
  }

  return {
    user: { id: userId, name: scenario.name, age: scenario.age, available_balance: scenario.balance },
    familyMembers, trustNetwork, missions, transactions,
    auditLog: [], alerts: [], exceptionRequests: [], continuityRule,
    presets: scenario.presets || [],
  };
}

const stores = {};
for (const scenario of SCENARIOS) stores[scenario.id] = buildScenarioStore(scenario);

function getStore(userId) {
  return stores[userId];
}

function resetLocalScenario(userId) {
  const def = SCENARIOS_BY_ID[userId];
  if (!def) return false; // not a demo id -- nothing to reset back to
  stores[userId] = buildScenarioStore(def);
  return true;
}

function createLocalCustomScenario(ownerName, delegateName, delegateRelationship = "familiar") {
  const id = `custom-${uid()}`;
  const scenario = {
    id, name: ownerName, age: null, balance: 0,
    delegate: delegateName ? { name: delegateName, relationship: delegateRelationship } : null,
    backup: null, mission: null, continuity: null, history: [], scheduled: [], presets: [],
  };
  stores[id] = buildScenarioStore(scenario);
  return { user_id: id, delegate_id: stores[id].familyMembers[0]?.id || null, backup_id: null, mission_id: null, name: ownerName };
}

function findExceptionRequestGlobally(id) {
  for (const s of Object.values(stores)) {
    const found = s.exceptionRequests.find((r) => r.id === id);
    if (found) return { store: s, request: found };
  }
  return null;
}

// ---------------------------------------------------------------------
// Public local-API surface (shape-matches api.js's network calls)
// ---------------------------------------------------------------------
function nonScheduled(txs) {
  return txs.filter((t) => t.status !== "SCHEDULED");
}

const localApi = {
  listScenarios() {
    return Promise.resolve(listScenarioMeta());
  },

  createCustomScenario(ownerName, delegateName, delegateRelationship) {
    return Promise.resolve(createLocalCustomScenario(ownerName, delegateName, delegateRelationship));
  },

  resetScenario(userId) {
    const ok = resetLocalScenario(userId);
    if (!ok) return Promise.reject(new Error("Este no es un escenario de demo reiniciable."));
    return Promise.resolve({ ok: true, user_id: userId });
  },

  getSummary(userId) {
    const store = getStore(userId);
    const user = store.user;
    const thisMonth = monthKey(new Date().toISOString());
    const txs = nonScheduled(store.transactions.filter((t) => t.user_id === userId));
    const spentThisMonth = txs.filter((t) => monthKey(t.timestamp) === thisMonth && t.status !== "BLOCKED").reduce((s, t) => s + t.amount, 0);
    const upcoming = store.transactions.filter((t) => t.user_id === userId && t.status === "SCHEDULED").sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const anyReview = txs.some((t) => t.status === "REVIEW");
    return Promise.resolve({
      name: user.name,
      available_balance: user.available_balance,
      spent_this_month: Math.round(spentThisMonth * 100) / 100,
      all_normal: !anyReview,
      upcoming_payments: upcoming,
    });
  },

  explainSpending(userId) {
    const store = getStore(userId);
    const now = new Date();
    const thisMonth = monthKey(now.toISOString());
    const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
    const txs = store.transactions.filter((t) => t.user_id === userId && t.status !== "SCHEDULED" && t.status !== "BLOCKED");
    const totals = {};
    for (const t of txs) {
      const key = monthKey(t.timestamp);
      if (key !== thisMonth && key !== lastMonth) continue;
      totals[t.category] = totals[t.category] || { this_month: 0, last_month: 0 };
      if (key === thisMonth) totals[t.category].this_month += t.amount;
      else totals[t.category].last_month += t.amount;
    }
    const comparisons = Object.entries(totals)
      .map(([category, v]) => ({
        category, this_month: Math.round(v.this_month * 100) / 100, last_month: Math.round(v.last_month * 100) / 100,
        difference: Math.round((v.this_month - v.last_month) * 100) / 100,
      }))
      .sort((a, b) => b.difference - a.difference);
    let headline = null;
    if (comparisons.length && comparisons[0].difference > 50) {
      const top = comparisons[0];
      headline = `Este mes gastaste más en ${top.category} que el mes pasado. El mes pasado gastaste $${top.last_month.toLocaleString()}. Este mes llevas $${top.this_month.toLocaleString()}. Esto es $${top.difference.toLocaleString()} más de lo habitual.`;
    }
    return Promise.resolve({ headline, comparisons });
  },

  listMissions(ownerId) {
    const store = getStore(ownerId);
    const thisMonth = monthKey(new Date().toISOString());
    const nowIso = new Date().toISOString();
    const result = store.missions.map((m) => {
      const spent = store.transactions
        .filter((t) => t.mission_id === m.id && t.status !== "BLOCKED" && t.status !== "SCHEDULED" && monthKey(t.timestamp) === thisMonth)
        .reduce((s, t) => s + t.amount, 0);
      let status = m.status;
      if (status === "active" && m.end_date < nowIso) status = "expired";
      return { ...m, status, spent_this_month: spent };
    });
    return Promise.resolve(result);
  },

  compileMission(ownerId, text) {
    const store = getStore(ownerId);
    const userTxs = nonScheduled(store.transactions.filter((t) => t.user_id === ownerId));
    const categories = [...new Set(userTxs.map((t) => t.category))];
    const baselines = {};
    for (const c of categories) baselines[c] = buildBaseline(userTxs, c);
    const draft = compileMissionLocal(text, baselines);
    let delegateName = null;
    if (draft.delegate_relationship) {
      const member = store.familyMembers.find((f) => f.relationship === draft.delegate_relationship);
      if (member) delegateName = member.name;
    }
    if (!delegateName && store.familyMembers.length > 0) delegateName = store.familyMembers[0].name;
    return Promise.resolve({ ...draft, delegate_name: delegateName, source_text: text });
  },

  confirmMission(payload) {
    const { owner_id, delegate_name, purpose, days, monthly_limit, per_transaction_limit, allowed_categories, source_text } = payload;
    const store = getStore(owner_id);
    const delegate = store.familyMembers.find((f) => f.name === delegate_name);
    if (!delegate) return Promise.reject(new Error(`No se encontró a ${delegate_name}`));
    const id = uid();
    store.missions.push({
      id, owner_id, delegate_id: delegate.id, delegate_name: delegate.name, purpose,
      start_date: new Date().toISOString(), end_date: daysAhead(days),
      monthly_limit, per_transaction_limit: per_transaction_limit || null,
      allowed_categories, forbidden_actions: [...NON_DELEGABLE_ACTIONS], status: "active", source_text,
    });
    return Promise.resolve({ id, status: "active" });
  },

  listTransactions(userId, missionId) {
    const store = getStore(userId);
    let txs = nonScheduled(store.transactions.filter((t) => t.user_id === userId));
    if (missionId) txs = txs.filter((t) => t.mission_id === missionId);
    return Promise.resolve([...txs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  },

  simulateTransaction({ user_id, merchant, category, amount, mission_id }) {
    const store = getStore(user_id);
    const missionRow = store.missions.find((m) => (mission_id ? m.id === mission_id : m.owner_id === user_id && m.status === "active")) || null;
    const missionDict = missionRow
      ? {
          id: missionRow.id, allowed_categories: missionRow.allowed_categories, monthly_limit: missionRow.monthly_limit,
          per_transaction_limit: missionRow.per_transaction_limit, start_date: missionRow.start_date, end_date: missionRow.end_date,
        }
      : null;
    const thisMonth = monthKey(new Date().toISOString());
    const monthSpent = missionDict
      ? store.transactions.filter((t) => t.mission_id === missionDict.id && t.status !== "BLOCKED" && t.status !== "SCHEDULED" && monthKey(t.timestamp) === thisMonth).reduce((s, t) => s + t.amount, 0)
      : 0;

    const historyForCategory = nonScheduled(store.transactions.filter((t) => t.user_id === user_id && t.category === category))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12);
    const baseline = buildBaseline(historyForCategory, category);
    const recentAmounts = historyForCategory.slice(0, 5).map((t) => t.amount).reverse();

    const decision = evaluateTransaction({ category, amount, mission: missionDict, forbiddenActions: [], monthSpentInMission: monthSpent, baseline, recentAmounts });

    const id = uid();
    const now = new Date().toISOString();
    const tx = {
      id, user_id, mission_id: missionDict ? missionDict.id : null, merchant, category, amount, timestamp: now,
      status: decision.status, reasons: decision.reasons, exception_eligible: decision.exception_eligible,
    };
    store.transactions.push(tx);
    store.auditLog.unshift({ id: uid(), action: decision.status, reasons: decision.reasons, timestamp: now, merchant, category, amount, kind: "transaction" });
    if (decision.status !== "APPROVED") {
      store.alerts.unshift({
        id: uid(), user_id, transaction_id: id, type: decision.status === "BLOCKED" ? "blocked_attempt" : "anomaly",
        message: decision.reasons[decision.reasons.length - 1], created_at: now, resolved: false, merchant, category, amount,
      });
    }
    return Promise.resolve({ ...tx, comparison: decision.comparison, exception_eligible: decision.exception_eligible });
  },

  getAuditTrail(userId) {
    return Promise.resolve([...getStore(userId).auditLog]);
  },

  getAlerts(userId, unresolvedOnly = true) {
    let alerts = getStore(userId).alerts;
    if (unresolvedOnly) alerts = alerts.filter((a) => !a.resolved);
    return Promise.resolve(alerts);
  },

  resolveAlert(userId, alertId) {
    const alert = getStore(userId).alerts.find((a) => a.id === alertId);
    if (alert) alert.resolved = true;
    return Promise.resolve({ ok: true });
  },

  getTrustNetwork(userId) {
    const store = getStore(userId);
    return Promise.resolve(store.trustNetwork.map((t) => {
      const member = store.familyMembers.find((f) => f.id === t.member_id);
      return { ...t, name: member?.name, relationship: member?.relationship };
    }));
  },

  addTrustMember({ user_id, name, relationship, role, can_pay_bills, can_review_alerts }) {
    const store = getStore(user_id);
    const memberId = uid();
    store.familyMembers.push({ id: memberId, user_id, name, relationship });
    const trustId = uid();
    store.trustNetwork.push({ id: trustId, user_id, member_id: memberId, role, can_pay_bills: !!can_pay_bills, can_review_alerts: !!can_review_alerts, can_change_beneficiaries: false });
    return Promise.resolve({ id: trustId, member_id: memberId });
  },

  // Only ever called from Elder Mode (directly, or via executeIntent's
  // REMOVE_TRUSTED_PERSON) -- ends any active mission for that person too,
  // mirroring routers/trust.py's remove_trust_member_row.
  removeTrustedPerson(userId, trustId) {
    const store = getStore(userId);
    const trustRow = store.trustNetwork.find((t) => t.id === trustId);
    if (!trustRow) return Promise.reject(new Error("No se encontró a esa persona en la red de confianza"));
    store.missions.forEach((m) => {
      if (m.delegate_id === trustRow.member_id && m.status === "active") m.status = "ended_early";
    });
    store.trustNetwork = store.trustNetwork.filter((t) => t.id !== trustId);
    return Promise.resolve({ ok: true });
  },

  getContinuity(userId) {
    const store = getStore(userId);
    const rule = store.continuityRule;
    if (!rule) return Promise.resolve(null);
    let status = "configurado";
    if (rule.active) {
      const mission = store.missions.find((m) => m.owner_id === userId && m.source_text === "Activado por Continuidad Financiera");
      const nowIso = new Date().toISOString();
      if (mission && mission.status === "active" && mission.end_date >= nowIso) status = "activo";
      else status = "expirado";
    }
    return Promise.resolve({ ...rule, status });
  },

  setContinuityRule(payload) {
    const store = getStore(payload.user_id);
    store.continuityRule = { ...store.continuityRule, ...payload, id: store.continuityRule?.id || uid() };
    return Promise.resolve({ id: store.continuityRule.id });
  },

  activateContinuity(userId) {
    const store = getStore(userId);
    const rule = store.continuityRule;
    if (!rule) return Promise.reject(new Error("No hay un plan de continuidad configurado"));
    const missionId = uid();
    store.missions.push({
      id: missionId, owner_id: userId, delegate_id: rule.delegate_id, delegate_name: rule.delegate_name,
      purpose: rule.trigger_label, start_date: new Date().toISOString(), end_date: daysAhead(rule.days),
      monthly_limit: rule.monthly_limit, per_transaction_limit: null, allowed_categories: rule.allowed_categories,
      forbidden_actions: [...NON_DELEGABLE_ACTIONS], status: "active", source_text: "Activado por Continuidad Financiera",
    });
    rule.active = true;
    rule.activated_at = new Date().toISOString();
    return Promise.resolve({ mission_id: missionId, active: true });
  },

  deactivateContinuity(userId) {
    const store = getStore(userId);
    const rule = store.continuityRule;
    if (!rule) return Promise.reject(new Error("No hay un plan de continuidad configurado"));
    rule.active = false;
    const mission = store.missions.find((m) => m.owner_id === userId && m.source_text === "Activado por Continuidad Financiera" && m.status === "active");
    if (mission) mission.status = "ended_early";
    return Promise.resolve({ active: false });
  },

  requestException({ user_id, mission_id, merchant, category, amount, requested_by }) {
    if (NON_DELEGABLE_ACTIONS.includes(category)) {
      return Promise.reject(new Error(`'${category}' nunca se puede autorizar por excepción, bajo ninguna circunstancia.`));
    }
    const store = getStore(user_id);
    const id = uid();
    store.exceptionRequests.unshift({
      id, user_id, mission_id, merchant, category, amount, requested_by,
      status: "pending", created_at: new Date().toISOString(), resolved_at: null, resulting_transaction_id: null,
    });
    return Promise.resolve({ id, status: "pending" });
  },

  listExceptions(userId, status) {
    const store = getStore(userId);
    let list = store.exceptionRequests;
    if (status) list = list.filter((r) => r.status === status);
    return Promise.resolve([...list]);
  },

  resolveException(id, { decision, resolved_by }) {
    const found = findExceptionRequestGlobally(id);
    if (!found) return Promise.reject(new Error("Solicitud no encontrada"));
    const { store, request } = found;
    if (request.status !== "pending") return Promise.reject(new Error("Esta solicitud ya fue resuelta"));
    const now = new Date().toISOString();
    const txId = uid();
    if (decision === "approved") {
      const reasons = [
        `Excede el límite autorizado, pero ${resolved_by} lo aprobó como excepción única.`,
        "Esta aprobación no cambia el límite de la misión -- solo autoriza este pago.",
      ];
      store.transactions.push({ id: txId, user_id: request.user_id, mission_id: request.mission_id, merchant: request.merchant, category: request.category, amount: request.amount, timestamp: now, status: "APPROVED", reasons });
      store.auditLog.unshift({ id: uid(), action: "APPROVED", reasons, timestamp: now, merchant: request.merchant, category: request.category, amount: request.amount, kind: "transaction" });
    } else {
      const reasons = [`${resolved_by} no aprobó esta excepción.`];
      store.transactions.push({ id: txId, user_id: request.user_id, mission_id: request.mission_id, merchant: request.merchant, category: request.category, amount: request.amount, timestamp: now, status: "BLOCKED", reasons });
      store.auditLog.unshift({ id: uid(), action: "BLOCKED", reasons, timestamp: now, merchant: request.merchant, category: request.category, amount: request.amount, kind: "transaction" });
    }
    request.status = decision;
    request.resolved_at = now;
    request.resulting_transaction_id = txId;
    return Promise.resolve({ ok: true, status: decision, transaction_id: txId });
  },

  // ---- Intent Engine: interpret (read-only) then execute (only after the
  // account owner confirms) -- mirrors routers/intent.py exactly. ----
  interpretIntent(userId, text) {
    const store = getStore(userId);
    const trustNetwork = store.trustNetwork.map((t) => {
      const member = store.familyMembers.find((f) => f.id === t.member_id);
      return { trust_id: t.id, member_id: t.member_id, name: member?.name, relationship: member?.relationship, role: t.role };
    });
    const txs = nonScheduled(store.transactions.filter((t) => t.user_id === userId));
    const categories = [...new Set(txs.map((t) => t.category))];
    const baselines = {};
    for (const c of categories) baselines[c] = buildBaseline(txs, c);
    const context = { ownerId: userId, trustNetwork, missions: store.missions, continuityRule: store.continuityRule, baselines };
    const result = classifyAndPropose(text, context);
    return Promise.resolve({ ...result, source_text: text });
  },

  executeIntent(userId, intentName, proposal) {
    const store = getStore(userId);
    const p = proposal;
    const now = new Date().toISOString();
    let result = {};
    let auditReason = null;
    const findMission = (id) => store.missions.find((m) => m.id === id);

    switch (intentName) {
      case "CREATE_MISSION": {
        const delegate = store.familyMembers.find((f) => f.name === p.delegate_name);
        if (!delegate) return Promise.reject(new Error(`No se encontró a ${p.delegate_name}`));
        const id = uid();
        store.missions.push({
          id, owner_id: userId, delegate_id: delegate.id, delegate_name: delegate.name, purpose: p.purpose,
          start_date: now, end_date: daysAhead(p.days), monthly_limit: p.suggested_limit,
          per_transaction_limit: p.per_transaction_limit || null, allowed_categories: p.allowed_categories,
          forbidden_actions: [...NON_DELEGABLE_ACTIONS], status: "active", source_text: p.source_text,
        });
        result = { mission_id: id };
        auditReason = `Se creó una misión nueva para ${p.delegate_name}: ${p.purpose}.`;
        break;
      }
      case "MODIFY_MISSION": {
        const m = findMission(p.mission_id);
        if (!m) return Promise.reject(new Error("Misión no encontrada"));
        m.allowed_categories = p.allowed_categories;
        if (p.suggested_limit != null) m.monthly_limit = p.suggested_limit;
        auditReason = `Se actualizó la misión de ${p.delegate_name}.`;
        break;
      }
      case "REVOKE_PERMISSION": {
        if (p.already_blocked) {
          auditReason = `Se confirmó que '${p.category}' sigue sin estar permitido para ${p.delegate_name}.`;
        } else {
          const m = findMission(p.mission_id);
          if (m) m.allowed_categories = p.remaining_categories;
          auditReason = `Se le quitó a ${p.delegate_name} el permiso para '${p.category}'.`;
        }
        break;
      }
      case "GRANT_PERMISSION": {
        if (p.already_allowed || p.blocked_forever) {
          const why = p.already_allowed ? "ya estaba permitido" : "está bloqueado permanentemente";
          auditReason = `Sin cambios: '${p.category}' ${why} para ${p.delegate_name}.`;
        } else {
          const m = findMission(p.mission_id);
          if (m) m.allowed_categories = p.new_categories;
          auditReason = `Se le dio a ${p.delegate_name} permiso para '${p.category}'.`;
        }
        break;
      }
      case "MODIFY_LIMIT": {
        const m = findMission(p.mission_id);
        if (!m) return Promise.reject(new Error("Misión no encontrada"));
        if (p.field === "per_transaction_limit") m.per_transaction_limit = p.new_value;
        else m.monthly_limit = p.new_value;
        auditReason = `Se cambió el límite de ${p.delegate_name} a $${p.new_value.toLocaleString()}.`;
        break;
      }
      case "MODIFY_DURATION": {
        const m = findMission(p.mission_id);
        if (!m) return Promise.reject(new Error("Misión no encontrada"));
        const base = new Date(p.mode === "extend" ? m.end_date : m.start_date);
        base.setDate(base.getDate() + p.days);
        m.end_date = base.toISOString();
        auditReason = `Se cambió la duración de la misión de ${p.delegate_name}.`;
        break;
      }
      case "ADD_TRUSTED_PERSON": {
        if (!p.name) return Promise.reject(new Error("No se identificó el nombre de la persona."));
        const memberId = uid();
        store.familyMembers.push({ id: memberId, user_id: userId, name: p.name, relationship: p.relationship || "familiar" });
        const trustId = uid();
        store.trustNetwork.push({
          id: trustId, user_id: userId, member_id: memberId, role: p.role || "Ayudante",
          can_pay_bills: p.can_pay_bills !== false, can_review_alerts: p.can_review_alerts !== false, can_change_beneficiaries: false,
        });
        result = { trust_id: trustId, member_id: memberId };
        auditReason = `Se agregó a ${p.name} como persona de confianza.`;
        break;
      }
      case "REMOVE_TRUSTED_PERSON": {
        const trustRow = store.trustNetwork.find((t) => t.id === p.trust_id);
        if (!trustRow) return Promise.reject(new Error("No se encontró a esa persona en la red de confianza"));
        store.missions.forEach((m) => { if (m.delegate_id === trustRow.member_id && m.status === "active") m.status = "ended_early"; });
        store.trustNetwork = store.trustNetwork.filter((t) => t.id !== p.trust_id);
        auditReason = `Se quitó a ${p.name} de la red de confianza.`;
        break;
      }
      case "ENABLE_CONTINUITY":
      case "MODIFY_CONTINUITY": {
        const delegate = store.familyMembers.find((f) => f.name === p.delegate_name);
        if (!delegate) return Promise.reject(new Error(`No se encontró a ${p.delegate_name}`));
        const backup = p.backup_name ? store.familyMembers.find((f) => f.name === p.backup_name) : null;
        store.continuityRule = {
          ...(store.continuityRule || { id: uid(), active: false, activated_at: null }),
          user_id: userId, trigger_label: p.trigger_label, delegate_id: delegate.id, delegate_name: delegate.name,
          backup_id: backup ? backup.id : null, backup_name: backup ? backup.name : null,
          allowed_categories: p.allowed_categories, monthly_limit: p.monthly_limit, days: p.days,
        };
        auditReason = intentName === "ENABLE_CONTINUITY" ? "Se configuró el plan de continuidad." : "Se actualizó el plan de continuidad.";
        break;
      }
      case "DISABLE_CONTINUITY": {
        if (!p.no_change) {
          const rule = store.continuityRule;
          if (rule) rule.active = false;
          const mission = store.missions.find((m) => m.owner_id === userId && m.source_text === "Activado por Continuidad Financiera" && m.status === "active");
          if (mission) mission.status = "ended_early";
          auditReason = "Se desactivó el plan de continuidad.";
        } else {
          auditReason = "Se confirmó que el plan de continuidad ya estaba desactivado.";
        }
        break;
      }
      case "GENERAL_FINANCIAL_QUESTION":
        return Promise.resolve({ ok: true, no_op: true });
      default:
        return Promise.reject(new Error(`Intent desconocido: ${intentName}`));
    }

    store.auditLog.unshift({ id: uid(), action: intentName, reasons: [auditReason], timestamp: now, kind: "account_change" });
    return Promise.resolve({ ok: true, ...result });
  },

  // Kept for the "Reiniciar demo" affordance -- resets EVERY local
  // scenario back to its seed state (used when the backend is unreachable
  // and resetScenario() has nothing server-side to fall back on).
  resetAllLocalScenarios() {
    for (const s of SCENARIOS) stores[s.id] = buildScenarioStore(s);
  },
};

export { localApi };
