// api.js
// -----------------------------------------------------------------------
// Every function here first tries the real backend (http://localhost:8000).
// If that fails for any reason -- backend not started, CORS issue, no
// network -- it transparently falls back to localEngine.js, which
// re-implements the same rules and the same seeded scenario entirely in
// the browser. Components never need to know which path answered them.
// -----------------------------------------------------------------------

import { localApi, resetStore } from "./data/localEngine.js";

const API_BASE = "http://localhost:8000/api";
const TIMEOUT_MS = 2500;

export let usingLocalFallback = false;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Error ${res.status}`);
    }
    usingLocalFallback = false;
    return res.status === 204 ? null : res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function withFallback(networkCall, localCall) {
  try {
    return await networkCall();
  } catch (err) {
    usingLocalFallback = true;
    return localCall();
  }
}

export const api = {
  getSummary: (userId) =>
    withFallback(
      () => request(`/users/${userId}/summary`),
      () => localApi.getSummary(userId)
    ),

  explainSpending: (userId) =>
    withFallback(
      () => request(`/users/${userId}/explain-spending`),
      () => localApi.explainSpending(userId)
    ),

  listMissions: (ownerId) =>
    withFallback(
      () => request(`/missions?owner_id=${ownerId}`),
      () => localApi.listMissions(ownerId)
    ),

  compileMission: (ownerId, text) =>
    withFallback(
      () => request(`/missions/compile`, { method: "POST", body: JSON.stringify({ owner_id: ownerId, text }) }),
      () => localApi.compileMission(ownerId, text)
    ),

  confirmMission: (payload) =>
    withFallback(
      () => request(`/missions`, { method: "POST", body: JSON.stringify(payload) }),
      () => localApi.confirmMission(payload)
    ),

  listTransactions: (userId, missionId) =>
    withFallback(
      () => request(`/transactions?user_id=${userId}${missionId ? `&mission_id=${missionId}` : ""}`),
      () => localApi.listTransactions(userId, missionId)
    ),

  simulateTransaction: (payload) =>
    withFallback(
      () => request(`/transactions/simulate`, { method: "POST", body: JSON.stringify(payload) }),
      () => localApi.simulateTransaction(payload)
    ),

  getAuditTrail: (userId) =>
    withFallback(
      () => request(`/audit?user_id=${userId}`),
      () => localApi.getAuditTrail(userId)
    ),

  getAlerts: (userId, unresolvedOnly = true) =>
    withFallback(
      () => request(`/audit/alerts?user_id=${userId}&unresolved_only=${unresolvedOnly}`),
      () => localApi.getAlerts(userId, unresolvedOnly)
    ),

  resolveAlert: (alertId, approvedBy, decision) =>
    withFallback(
      () => request(`/audit/alerts/${alertId}/resolve?approved_by=${encodeURIComponent(approvedBy)}&decision=${decision}`, { method: "POST" }),
      () => localApi.resolveAlert(alertId, approvedBy, decision)
    ),

  getTrustNetwork: (userId) =>
    withFallback(
      () => request(`/trust-network?user_id=${userId}`),
      () => localApi.getTrustNetwork(userId)
    ),

  addTrustMember: (payload) =>
    withFallback(
      () => request(`/trust-network`, { method: "POST", body: JSON.stringify(payload) }),
      () => localApi.addTrustMember(payload)
    ),

  getContinuity: (userId) =>
    withFallback(
      () => request(`/continuity/${userId}`),
      () => localApi.getContinuity(userId)
    ),

  setContinuityRule: (payload) =>
    withFallback(
      () => request(`/continuity`, { method: "POST", body: JSON.stringify(payload) }),
      () => localApi.setContinuityRule(payload)
    ),

  activateContinuity: (userId) =>
    withFallback(
      () => request(`/continuity/${userId}/activate`, { method: "POST" }),
      () => localApi.activateContinuity(userId)
    ),

  deactivateContinuity: (userId) =>
    withFallback(
      () => request(`/continuity/${userId}/deactivate`, { method: "POST" }),
      () => localApi.deactivateContinuity(userId)
    ),

  // Only resets the in-browser fallback store. To reset the real backend,
  // rerun `python3 -m app.seed` — this button can't reach into the API's
  // database from the frontend, and shouldn't pretend to.
  resetLocalDemoData: () => {
    resetStore();
  },
};
