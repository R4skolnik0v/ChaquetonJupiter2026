// api.js
// -----------------------------------------------------------------------
// Every function here first tries the real backend (http://localhost:8000).
// If that fails for any reason -- backend not started, CORS issue, no
// network -- it transparently falls back to localEngine.js, which
// re-implements the same rules and the same seeded scenarios entirely in
// the browser. Components never need to know which path answered them.
// -----------------------------------------------------------------------

import { localApi } from "./data/localEngine.js";

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
  // ---- Scenarios (demos + "empezar desde cero") ----
  listScenarios: () =>
    withFallback(
      () => request(`/scenarios`),
      () => localApi.listScenarios()
    ),

  createCustomScenario: (ownerName, delegateName, delegateRelationship) =>
    withFallback(
      () => request(`/scenarios/custom`, { method: "POST", body: JSON.stringify({ owner_name: ownerName, delegate_name: delegateName, delegate_relationship: delegateRelationship }) }),
      () => localApi.createCustomScenario(ownerName, delegateName, delegateRelationship)
    ),

  resetScenario: (userId) =>
    withFallback(
      () => request(`/scenarios/${userId}/reset`, { method: "POST" }),
      () => localApi.resetScenario(userId)
    ),

  // ---- Elder / Family core ----
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

  resolveAlert: (userId, alertId, approvedBy, decision) =>
    withFallback(
      () => request(`/audit/alerts/${alertId}/resolve?approved_by=${encodeURIComponent(approvedBy)}&decision=${decision}`, { method: "POST" }),
      () => localApi.resolveAlert(userId, alertId)
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

  removeTrustedPerson: (userId, trustId) =>
    withFallback(
      () => request(`/trust-network/${trustId}?user_id=${userId}`, { method: "DELETE" }),
      () => localApi.removeTrustedPerson(userId, trustId)
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

  // ---- Exceptions: family asks, only the account owner can grant ----
  requestException: (payload) =>
    withFallback(
      () => request(`/exceptions`, { method: "POST", body: JSON.stringify(payload) }),
      () => localApi.requestException(payload)
    ),

  listExceptions: (userId, status) =>
    withFallback(
      () => request(`/exceptions?user_id=${userId}${status ? `&status=${status}` : ""}`),
      () => localApi.listExceptions(userId, status)
    ),

  resolveException: (requestId, decision, resolvedBy) =>
    withFallback(
      () => request(`/exceptions/${requestId}/resolve`, { method: "POST", body: JSON.stringify({ decision, resolved_by: resolvedBy }) }),
      () => localApi.resolveException(requestId, { decision, resolved_by: resolvedBy })
    ),

  // ---- Intent Engine: the elder's natural-language box for everything
  // beyond the first mission -- interpret returns a proposal, nothing is
  // written until execute is called with the (possibly edited) proposal. ----
  interpretIntent: (userId, text) =>
    withFallback(
      () => request(`/intent/interpret`, { method: "POST", body: JSON.stringify({ user_id: userId, text }) }),
      () => localApi.interpretIntent(userId, text)
    ),

  executeIntent: (userId, intent, proposal) =>
    withFallback(
      () => request(`/intent/execute`, { method: "POST", body: JSON.stringify({ user_id: userId, intent, proposal }) }),
      () => localApi.executeIntent(userId, intent, proposal)
    ),

  // Only resets the in-browser fallback stores (all of them). To reset the
  // real backend's data, use "Reiniciar escenario" (calls resetScenario)
  // or rerun `python3 -m app.seed` -- this can't reach into the API's
  // database from the frontend, and shouldn't pretend to.
  resetAllLocalScenarios: () => {
    localApi.resetAllLocalScenarios();
  },
};
