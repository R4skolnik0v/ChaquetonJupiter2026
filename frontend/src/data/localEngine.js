// localEngine.js
// -----------------------------------------------------------------------
// This mirrors backend/app/engines/*.py + backend/app/seed.py on purpose.
// It exists purely as a safety net: if the FastAPI backend isn't running
// (wifi trouble, forgot to start it, judges' laptop), the whole demo still
// works entirely in the browser, with the exact same rules and the exact
// same seeded scenario. api.js tries the real backend first and only
// drops down to this file on a network failure.
//
// If you're reading this to understand "the real logic", read the Python
// files in backend/app/engines/ instead -- this file has to stay in sync
// with them by hand, so the Python version is the source of truth.
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
  return iso.slice(0, 7); // "2026-09-18T..." -> "2026-09"
}

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------
// Behavioral baseline (mirrors engines/behavior_baseline.py)
// ---------------------------------------------------------------------
function buildBaseline(transactions, category) {
  const amounts = transactions.filter((t) => t.category === category).map((t) => t.amount);
  if (amounts.length === 0) return null;
  const avg = mean(amounts);
  return {
    category,
    avgAmount: Math.round(avg * 100) / 100,
    sampleSize: amounts.length,
  };
}

// ---------------------------------------------------------------------
// Risk engine (mirrors engines/risk_engine.py)
// ---------------------------------------------------------------------
function checkAmountAnomaly(amount, baseline) {
  if (!baseline || baseline.avgAmount <= 0) {
    return { isAnomaly: false, multiplier: 1, baselineAvg: 0 };
  }
  const multiplier = Math.round((amount / baseline.avgAmount) * 10) / 10;
  return { isAnomaly: multiplier >= ANOMALY_MULTIPLIER, multiplier, baselineAvg: baseline.avgAmount };
}

function checkBoundaryPattern(recentAmounts, limit, proximityPct = 0.05, minOccurrences = 3) {
  if (!recentAmounts.length || limit <= 0) return false;
  const threshold = limit * (1 - proximityPct);
  const closeCalls = recentAmounts.filter((a) => a >= threshold && a <= limit * 1.01);
  return closeCalls.length >= minOccurrences;
}

// ---------------------------------------------------------------------
// Decision engine (mirrors engines/decision_engine.py)
// Deterministic rules always run first and always win -- see the Python
// file for the full explanation of why.
// ---------------------------------------------------------------------
function evaluateTransaction({ category, amount, mission, forbiddenActions, monthSpentInMission, baseline, recentAmounts }) {
  if (!mission) {
    const anomaly = checkAmountAnomaly(amount, baseline);
    if (anomaly.isAnomaly) {
      return {
        status: "REVIEW",
        reasons: ["Este gasto es más alto de lo habitual para esta categoría."],
        comparison: { baselineAvg: anomaly.baselineAvg, amount, multiplier: anomaly.multiplier },
      };
    }
    return { status: "APPROVED", reasons: ["Movimiento de la cuenta propia."], comparison: null };
  }

  const allForbidden = new Set([...NON_DELEGABLE_ACTIONS, ...forbiddenActions]);
  if (allForbidden.has(category)) {
    return {
      status: "BLOCKED",
      reasons: [`'${category}' no está permitido bajo ninguna misión.`, "Regla determinista: ninguna IA puede aprobar esta acción."],
      comparison: null,
    };
  }

  if (!mission.allowed_categories.includes(category)) {
    return { status: "BLOCKED", reasons: [`La misión activa no incluye la categoría '${category}'.`], comparison: null };
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
      comparison: { baselineAvg: anomaly.baselineAvg, amount, multiplier: anomaly.multiplier },
    };
  }

  if (checkBoundaryPattern([...recentAmounts, amount], mission.monthly_limit)) {
    return {
      status: "REVIEW",
      reasons: ["Comercio autorizado.", "Dentro del límite mensual.", "Varias transacciones recientes se acercan repetidamente al límite de la misión."],
      comparison: null,
    };
  }

  return {
    status: "APPROVED",
    reasons: ["Comercio autorizado.", "Dentro del límite mensual.", "Monto habitual.", "Misión activa."],
    comparison: null,
  };
}

// ---------------------------------------------------------------------
// Mission compiler (mirrors engines/mission_compiler.py)
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
// Seed data -- same scenario as backend/app/seed.py
// ---------------------------------------------------------------------
function buildStore() {
  const userId = "maria";
  const lauraId = uid();
  const carlosId = uid();
  const missionId = uid();

  const transactions = [];
  const addHistory = (merchant, category, amount, whenIso, missionIdField = null) => {
    transactions.push({
      id: uid(),
      user_id: userId,
      mission_id: missionIdField,
      merchant,
      category,
      amount,
      timestamp: whenIso,
      status: "APPROVED",
      reasons: ["Historial de gastos personales."],
    });
  };

  addHistory("CFE", "CFE", 205, daysAgo(85));
  addHistory("CFE", "CFE", 190, daysAgo(75));
  addHistory("CFE", "CFE", 183, daysAgo(65));
  addHistory("CFE", "CFE", 195, daysAgo(40));

  addHistory("Farmacia San Pablo", "Farmacia", 300, daysAgo(42));
  addHistory("Farmacia San Pablo", "Farmacia", 320, daysAgo(35));
  addHistory("Farmacia San Pablo", "Farmacia", 350, daysAgo(11));
  addHistory("Farmacia San Pablo", "Farmacia", 340, daysAgo(8));
  addHistory("Farmacia San Pablo", "Farmacia", 350, daysAgo(3));

  addHistory("Soriana", "Supermercado", 1250, daysAgo(38));
  addHistory("Soriana", "Supermercado", 1200, daysAgo(20));
  addHistory("Soriana", "Supermercado", 1220, daysAgo(10));
  addHistory("Soriana", "Supermercado", 1230, daysAgo(1));

  addHistory("Gas Natural", "Gas", 150, daysAgo(33));
  addHistory("Gas Natural", "Gas", 150, daysAgo(6));

  addHistory("Agua y Drenaje", "Agua", 220, daysAgo(30));

  addHistory("Administración Condominio", "Vivienda", 3600, daysAgo(28));
  addHistory("Administración Condominio", "Vivienda", 3600, daysAgo(7));

  addHistory("Uber", "Transporte", 460, daysAgo(25));
  addHistory("Uber", "Transporte", 710, daysAgo(4));

  addHistory("Restaurante El Tigre", "Restaurante", 500, daysAgo(15));
  addHistory("Restaurante El Tigre", "Restaurante", 500, daysAgo(2));

  transactions.push({
    id: uid(), user_id: userId, mission_id: missionId, merchant: "Luz", category: "CFE",
    amount: 183, timestamp: daysAhead(6), status: "SCHEDULED", reasons: [],
  });
  transactions.push({
    id: uid(), user_id: userId, mission_id: missionId, merchant: "Agua", category: "Agua",
    amount: 240, timestamp: daysAhead(10), status: "SCHEDULED", reasons: [],
  });

  return {
    user: { id: userId, name: "María Balcázar", age: 72, available_balance: 12430.0 },
    familyMembers: [
      { id: lauraId, user_id: userId, name: "Laura", relationship: "hija" },
      { id: carlosId, user_id: userId, name: "Carlos", relationship: "sobrino" },
    ],
    trustNetwork: [
      { id: uid(), user_id: userId, member_id: lauraId, role: "Ayudante principal", can_pay_bills: true, can_review_alerts: true, can_change_beneficiaries: false },
      { id: uid(), user_id: userId, member_id: carlosId, role: "Respaldo", can_pay_bills: false, can_review_alerts: true, can_change_beneficiaries: false },
    ],
    missions: [
      {
        id: missionId,
        owner_id: userId,
        delegate_id: lauraId,
        delegate_name: "Laura",
        purpose: "Ayudar con gastos esenciales mientras María se recupera",
        start_date: daysAgo(12),
        end_date: daysAhead(18),
        monthly_limit: 4000.0,
        allowed_categories: ["CFE", "Agua", "Gas", "Farmacia", "Supermercado"],
        forbidden_actions: [...NON_DELEGABLE_ACTIONS],
        status: "active",
        source_text: "Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome.",
      },
    ],
    transactions,
    auditLog: [],
    alerts: [],
    continuityRule: {
      id: uid(),
      user_id: userId,
      trigger_label: "Si María no puede administrar sus finanzas",
      delegate_id: lauraId,
      delegate_name: "Laura",
      backup_id: carlosId,
      backup_name: "Carlos",
      allowed_categories: ["CFE", "Agua", "Gas", "Farmacia"],
      monthly_limit: 4000.0,
      days: 30,
      active: false,
      activated_at: null,
    },
  };
}

let store = buildStore();

function resetStore() {
  store = buildStore();
}

// ---------------------------------------------------------------------
// Public local-API surface (shape-matches api.js's network calls)
// ---------------------------------------------------------------------

function nonScheduled(txs) {
  return txs.filter((t) => t.status !== "SCHEDULED");
}

const localApi = {
  getSummary(userId) {
    const user = store.user;
    const thisMonth = monthKey(new Date().toISOString());
    const txs = nonScheduled(store.transactions.filter((t) => t.user_id === userId));
    const spentThisMonth = txs
      .filter((t) => monthKey(t.timestamp) === thisMonth && t.status !== "BLOCKED")
      .reduce((s, t) => s + t.amount, 0);
    const upcoming = store.transactions
      .filter((t) => t.user_id === userId && t.status === "SCHEDULED")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
    const now = new Date();
    const thisMonth = monthKey(now.toISOString());
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = monthKey(lastMonthDate.toISOString());
    const txs = store.transactions.filter(
      (t) => t.user_id === userId && t.status !== "SCHEDULED" && t.status !== "BLOCKED"
    );
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
        category,
        this_month: Math.round(v.this_month * 100) / 100,
        last_month: Math.round(v.last_month * 100) / 100,
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
    const thisMonth = monthKey(new Date().toISOString());
    const result = store.missions
      .filter((m) => m.owner_id === ownerId)
      .map((m) => {
        const spent = store.transactions
          .filter(
            (t) =>
              t.mission_id === m.id &&
              t.status !== "BLOCKED" &&
              t.status !== "SCHEDULED" &&
              monthKey(t.timestamp) === thisMonth
          )
          .reduce((s, t) => s + t.amount, 0);
        return { ...m, spent_this_month: spent };
      });
    return Promise.resolve(result);
  },

  compileMission(ownerId, text) {
    const userTxs = nonScheduled(store.transactions.filter((t) => t.user_id === ownerId));
    const categories = [...new Set(userTxs.map((t) => t.category))];
    const baselines = {};
    for (const c of categories) baselines[c] = buildBaseline(userTxs, c);
    const draft = compileMissionLocal(text, baselines);
    let delegateName = null;
    if (draft.delegate_relationship) {
      const member = store.familyMembers.find(
        (f) => f.user_id === ownerId && f.relationship === draft.delegate_relationship
      );
      if (member) delegateName = member.name;
    }
    return Promise.resolve({ ...draft, delegate_name: delegateName, source_text: text });
  },

  confirmMission({ owner_id, delegate_name, purpose, days, monthly_limit, allowed_categories, source_text }) {
    const delegate = store.familyMembers.find((f) => f.user_id === owner_id && f.name === delegate_name);
    if (!delegate) return Promise.reject(new Error(`No se encontró a ${delegate_name}`));
    const id = uid();
    store.missions.push({
      id,
      owner_id,
      delegate_id: delegate.id,
      delegate_name: delegate.name,
      purpose,
      start_date: new Date().toISOString(),
      end_date: daysAhead(days),
      monthly_limit,
      allowed_categories,
      forbidden_actions: [...NON_DELEGABLE_ACTIONS],
      status: "active",
      source_text,
    });
    return Promise.resolve({ id, status: "active" });
  },

  listTransactions(userId, missionId) {
    let txs = nonScheduled(store.transactions.filter((t) => t.user_id === userId));
    if (missionId) txs = txs.filter((t) => t.mission_id === missionId);
    return Promise.resolve([...txs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  },

  simulateTransaction({ user_id, merchant, category, amount, mission_id }) {
    const missionRow =
      store.missions.find((m) => (mission_id ? m.id === mission_id : m.owner_id === user_id && m.status === "active")) ||
      null;
    const missionDict = missionRow
      ? { id: missionRow.id, allowed_categories: missionRow.allowed_categories, monthly_limit: missionRow.monthly_limit }
      : null;
    const thisMonth = monthKey(new Date().toISOString());
    const monthSpent = missionDict
      ? store.transactions
          .filter(
            (t) =>
              t.mission_id === missionDict.id &&
              t.status !== "BLOCKED" &&
              t.status !== "SCHEDULED" &&
              monthKey(t.timestamp) === thisMonth
          )
          .reduce((s, t) => s + t.amount, 0)
      : 0;

    const historyForCategory = nonScheduled(store.transactions.filter((t) => t.user_id === user_id && t.category === category))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 12);
    const baseline = buildBaseline(historyForCategory, category);
    const recentAmounts = historyForCategory.slice(0, 5).map((t) => t.amount).reverse();

    const decision = evaluateTransaction({
      category,
      amount,
      mission: missionDict,
      forbiddenActions: [],
      monthSpentInMission: monthSpent,
      baseline,
      recentAmounts,
    });

    const id = uid();
    const now = new Date().toISOString();
    const tx = {
      id,
      user_id,
      mission_id: missionDict ? missionDict.id : null,
      merchant,
      category,
      amount,
      timestamp: now,
      status: decision.status,
      reasons: decision.reasons,
    };
    store.transactions.push(tx);
    store.auditLog.unshift({
      id: uid(),
      action: decision.status,
      reasons: decision.reasons,
      timestamp: now,
      merchant,
      category,
      amount,
    });
    if (decision.status !== "APPROVED") {
      store.alerts.unshift({
        id: uid(),
        user_id,
        transaction_id: id,
        type: decision.status === "BLOCKED" ? "blocked_attempt" : "anomaly",
        message: decision.reasons[decision.reasons.length - 1],
        created_at: now,
        resolved: false,
        merchant,
        category,
        amount,
      });
    }
    return Promise.resolve({ ...tx, comparison: decision.comparison });
  },

  getAuditTrail() {
    return Promise.resolve([...store.auditLog]);
  },

  getAlerts(userId, unresolvedOnly = true) {
    let alerts = store.alerts.filter((a) => a.user_id === userId);
    if (unresolvedOnly) alerts = alerts.filter((a) => !a.resolved);
    return Promise.resolve(alerts);
  },

  resolveAlert(alertId) {
    const alert = store.alerts.find((a) => a.id === alertId);
    if (alert) alert.resolved = true;
    return Promise.resolve({ ok: true });
  },

  getTrustNetwork(userId) {
    const result = store.trustNetwork
      .filter((t) => t.user_id === userId)
      .map((t) => {
        const member = store.familyMembers.find((f) => f.id === t.member_id);
        return { ...t, name: member?.name, relationship: member?.relationship };
      });
    return Promise.resolve(result);
  },

  addTrustMember({ user_id, name, relationship, role, can_pay_bills, can_review_alerts }) {
    const memberId = uid();
    store.familyMembers.push({ id: memberId, user_id, name, relationship });
    const trustId = uid();
    store.trustNetwork.push({
      id: trustId, user_id, member_id: memberId, role,
      can_pay_bills: !!can_pay_bills, can_review_alerts: !!can_review_alerts, can_change_beneficiaries: false,
    });
    return Promise.resolve({ id: trustId, member_id: memberId });
  },

  getContinuity(userId) {
    const rule = store.continuityRule && store.continuityRule.user_id === userId ? store.continuityRule : null;
    return Promise.resolve(rule);
  },

  setContinuityRule(payload) {
    store.continuityRule = { ...store.continuityRule, ...payload, id: store.continuityRule?.id || uid() };
    return Promise.resolve({ id: store.continuityRule.id });
  },

  activateContinuity(userId) {
    const rule = store.continuityRule;
    if (!rule || rule.user_id !== userId) return Promise.reject(new Error("No hay un plan de continuidad configurado"));
    const missionId = uid();
    store.missions.push({
      id: missionId,
      owner_id: userId,
      delegate_id: rule.delegate_id,
      delegate_name: rule.delegate_name,
      purpose: rule.trigger_label,
      start_date: new Date().toISOString(),
      end_date: daysAhead(rule.days),
      monthly_limit: rule.monthly_limit,
      allowed_categories: rule.allowed_categories,
      forbidden_actions: [...NON_DELEGABLE_ACTIONS],
      status: "active",
      source_text: "Activado por Continuidad Financiera",
    });
    rule.active = true;
    rule.activated_at = new Date().toISOString();
    return Promise.resolve({ mission_id: missionId, active: true });
  },

  deactivateContinuity(userId) {
    const rule = store.continuityRule;
    if (!rule || rule.user_id !== userId) return Promise.reject(new Error("No hay un plan de continuidad configurado"));
    rule.active = false;
    const mission = store.missions.find((m) => m.owner_id === userId && m.source_text === "Activado por Continuidad Financiera" && m.status === "active");
    if (mission) mission.status = "ended_early";
    return Promise.resolve({ active: false });
  },
};

export { localApi, resetStore };
