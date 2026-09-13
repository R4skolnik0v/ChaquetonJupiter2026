import json
import os
from typing import Any

from google import genai
from google.genai import types


class GeminiIntentService:
    """Backend-only Gemini integration for intent interpretation.

    This service is intentionally narrow: it only interprets natural-language
    requests into structured JSON and returns a proposal for human confirmation.
    It never executes any financial action.
    """

    MODEL_NAME = "gemini-3.5-flash-lite"
    RESPONSE_SCHEMA = {
        "type": "OBJECT",
        "properties": {
            "intent": {"type": "STRING"},
            "target_person": {"type": "STRING"},
            "permission": {"type": "STRING"},
            "enabled": {"type": "BOOLEAN"},
            "amount_limit": {"type": "NUMBER"},
            "frequency": {"type": "STRING"},
            "duration_days": {"type": "INTEGER"},
            "reason": {"type": "STRING"},
            "confidence": {"type": "NUMBER"},
            "needs_clarification": {"type": "BOOLEAN"},
            "clarification_question": {"type": "STRING"},
        },
        "required": [
            "intent",
            "target_person",
            "permission",
            "enabled",
            "amount_limit",
            "frequency",
            "duration_days",
            "reason",
            "confidence",
            "needs_clarification",
            "clarification_question",
        ],
    }

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None

    def is_available(self) -> bool:
        return self.client is not None

    @staticmethod
    def _normalize_value(value: Any, default: Any = "") -> Any:
        if value is None:
            return default
        return value

    def _build_context_snapshot(self, context: dict | None) -> str:
        if not context:
            return "Sin contexto previo de la cuenta."

        lines = [
            "Contexto de la cuenta del adulto mayor:",
            f"owner_id: {context.get('owner_id', '')}",
        ]

        trust = context.get("trust_network") or []
        if trust:
            people = ", ".join(item.get("name", "") for item in trust if item.get("name"))
            lines.append(f"personas_de_confianza: {people or 'ninguna'}")

        missions = context.get("missions") or []
        if missions:
            mission_lines = []
            for mission in missions[:3]:
                delegate = mission.get("delegate_name") or mission.get("delegate_id") or "persona"
                purpose = mission.get("purpose") or "sin propósito"
                mission_lines.append(f"- {delegate}: {purpose}")
            lines.append("misiones_activas: " + ("; ".join(mission_lines) if mission_lines else "ninguna"))

        continuity = context.get("continuity_rule")
        if continuity:
            lines.append(f"continuidad: {continuity.get('trigger_label') or 'sin nombre'}")

        return "\n".join(lines)

    def _build_history(self, conversation_history: list[dict] | None) -> list[dict]:
        if not conversation_history:
            return []
        cleaned = []
        for item in conversation_history[-8:]:
            role = str(item.get("role") or "user").strip().lower()
            content = item.get("content") or item.get("text") or ""
            if not content:
                continue
            cleaned.append({"role": role if role in {"user", "model"} else "user", "content": str(content)})
        return cleaned

    def _build_system_prompt(self) -> str:
        return (
            "Eres un asistente financiero seguro para un adulto mayor. "
            "Interpretas lenguaje natural, nunca ejecutas acciones financieras, y siempre devuelves JSON estructurado. "
            "Tu trabajo es ayudar a entender lo que quiere cambiar en la cuenta, permisos, misiones, personas de confianza y transferencias. "
            "No inventes nombres, personas, cantidades, montos, duraciones o permisos si el usuario no los menciona. "
            "Si falta información, devuelve needs_clarification=true y escribe la pregunta correcta en clarification_question. "
            "Distingue entre permisos y acciones no delegables. Nunca autorices transferencias, retiros, cambios de beneficiario, o solicitudes de crédito por ningún medio. "
            "Cuando alguien dice 'quitar permiso' o 'ya no quiero', setea enabled=false. Cuando dice 'dar permiso', 'puede' o 'quiero que', setea enabled=true. "
            "Necesitas entender la relación del adulto mayor con sus familiares, no los confundas. "
            "Conserva el contexto conversacional de la conversación previa para seguir la discusión. "
            "La salida debe ser un objeto JSON con las claves exactas: intent, target_person, permission, enabled, amount_limit, frequency, duration_days, reason, confidence, needs_clarification, clarification_question." 
            "Los intents validos son: CREATE_MISSION, MODIFY_PERMISSION, GRANT_PERMISSION, REVOKE_PERMISSION, MODIFY_LIMIT, MODIFY_FREQUENCY, MODIFY_DURATION, ADD_TRUSTED_PERSON, REMOVE_TRUSTED_PERSON, ENABLE_CONTINUITY, DISABLE_CONTINUITY, MODIFY_CONTINUITY, TRANSFER_MONEY, GENERAL_FINANCIAL_QUESTION, UNKNOWN. "
            "Las permissions validas son: CASH_WITHDRAWAL, TRANSFER, BILL_PAYMENT, PURCHASE, PHARMACY, GROCERIES, UTILITIES, BENEFICIARY_CHANGE, CREDIT_REQUEST."
        )

    def interpret(self, text: str, context: dict | None = None, conversation_history: list[dict] | None = None) -> dict | None:
        if not self.client:
            return None

        prompt_lines = [
            self._build_context_snapshot(context),
            "",
            "Conversación previa:",
        ]

        for msg in self._build_history(conversation_history):
            prompt_lines.append(f"{msg['role']}: {msg['content']}")

        prompt_lines.extend([
            "",
            "Nueva entrada del adulto mayor:",
            text,
            "",
            "Devuelve solamente JSON válido con el esquema requerido."
        ])

        try:
            response = self.client.models.generate_content(
                model=self.MODEL_NAME,
                contents="\n".join(prompt_lines),
                config=types.GenerateContentConfig(
                    temperature=0.15,
                    top_p=0.9,
                    max_output_tokens=500,
                    response_mime_type="application/json",
                    response_schema=self.RESPONSE_SCHEMA,
                    system_instruction=self._build_system_prompt(),
                ),
            )
            raw = getattr(response, "text", None)
            if not raw:
                return None
            payload = json.loads(raw)
            intent = str(payload.get("intent") or "UNKNOWN").upper()
            proposal = {
                "intent": intent,
                "target_person": self._normalize_value(payload.get("target_person"), ""),
                "permission": self._normalize_value(payload.get("permission"), ""),
                "enabled": bool(payload.get("enabled", True)),
                "amount_limit": float(payload.get("amount_limit") or 0.0),
                "frequency": self._normalize_value(payload.get("frequency"), ""),
                "duration_days": int(payload.get("duration_days") or 30),
                "reason": self._normalize_value(payload.get("reason"), "Interpretado por Gemini."),
                "confidence": float(payload.get("confidence") or 0.0),
                "needs_clarification": bool(payload.get("needs_clarification", False)),
                "clarification_question": self._normalize_value(payload.get("clarification_question"), ""),
            }

            confirmation = proposal["reason"] or (
                f"Entendí que quieres {proposal['permission']} para {proposal['target_person'] or 'la persona indicada'}."
                if proposal.get("permission") and proposal.get("target_person") else "Entendí tu petición."
            )
            if proposal["needs_clarification"] and proposal["clarification_question"]:
                confirmation = proposal["clarification_question"]

            result = {
                "intent": intent,
                "requires_confirmation": not proposal["needs_clarification"],
                "confirmation_text": confirmation,
                "proposal": proposal,
                "structured": payload,
            }
            return result
        except Exception:
            return None
