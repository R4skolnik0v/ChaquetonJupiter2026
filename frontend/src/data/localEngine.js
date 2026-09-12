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
// Scenario definitions -- mirrors backend/app/scenarios.py exactly (same
// ids, same numbers) so switching to/from the local fallback mid-demo
// never shows different data.
// ---------------------------------------------------------------------
const SCENARIOS = [
  {
    id: "maria", name: "María Balcázar", age: 72, balance: 12430.0,
    emoji: "🧓🏽", tagline: "Delegación segura de tareas",
    headline: "María necesita ayuda con sus servicios mientras se recupera de una cirugía.",
    delegate: { name: "Laura", relationship: "hija" }, backup: { name: "Carlos", relationship: "sobrino" },
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
    store.auditLog.unshift({ id: uid(), action: decision.status, reasons: decision.reasons, timestamp: now, merchant, category, amount });
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

  getContinuity(userId) {
    return Promise.resolve(getStore(userId).continuityRule || null);
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
      store.auditLog.unshift({ id: uid(), action: "APPROVED", reasons, timestamp: now, merchant: request.merchant, category: request.category, amount: request.amount });
    } else {
      const reasons = [`${resolved_by} no aprobó esta excepción.`];
      store.transactions.push({ id: txId, user_id: request.user_id, mission_id: request.mission_id, merchant: request.merchant, category: request.category, amount: request.amount, timestamp: now, status: "BLOCKED", reasons });
      store.auditLog.unshift({ id: uid(), action: "BLOCKED", reasons, timestamp: now, merchant: request.merchant, category: request.category, amount: request.amount });
    }
    request.status = decision;
    request.resolved_at = now;
    request.resulting_transaction_id = txId;
    return Promise.resolve({ ok: true, status: decision, transaction_id: txId });
  },

  // Kept for the "Reiniciar demo" affordance -- resets EVERY local
  // scenario back to its seed state (used when the backend is unreachable
  // and resetScenario() has nothing server-side to fall back on).
  resetAllLocalScenarios() {
    for (const s of SCENARIOS) stores[s.id] = buildScenarioStore(s);
  },
};

export { localApi };
