"""
routers/scenarios.py
----------------------
Lets the frontend switch between demos, or start a blank one, without ever
restarting the backend:

  GET  /api/scenarios              -> the 5 demo cards for the landing page
  POST /api/scenarios/custom       -> "Empezar desde cero": a brand-new,
                                       empty user_id, isolated from the demos
  POST /api/scenarios/{id}/reset   -> wipes ONE scenario's data and
                                       re-provisions it from scratch (only
                                       works for the 5 known demo ids --
                                       a custom scenario is just abandoned
                                       and a new one is created instead)
"""

from fastapi import APIRouter, HTTPException
from ..database import db_cursor
from ..schemas import CustomScenarioRequest
from ..scenarios import SCENARIOS_BY_ID, list_scenario_meta, wipe_scenario, provision_scenario, provision_custom_scenario

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("")
def get_scenarios():
    return list_scenario_meta()


@router.post("/custom")
def create_custom_scenario(body: CustomScenarioRequest):
    with db_cursor(commit=True) as cur:
        result = provision_custom_scenario(cur, body.owner_name, body.delegate_name, body.delegate_relationship)
    return result


@router.post("/{scenario_id}/reset")
def reset_scenario(scenario_id: str):
    scenario = SCENARIOS_BY_ID.get(scenario_id)
    if not scenario:
        raise HTTPException(
            404,
            "Este no es uno de los escenarios de demo -- solo los 5 escenarios "
            "precargados se pueden reiniciar. Un escenario 'desde cero' simplemente "
            "se abandona; crea uno nuevo desde la pantalla de inicio.",
        )
    with db_cursor(commit=True) as cur:
        wipe_scenario(cur, scenario_id)
        provision_scenario(cur, scenario)
    return {"ok": True, "user_id": scenario_id}
