from pydantic import BaseModel, Field
from typing import Optional


class MissionCompileRequest(BaseModel):
    owner_id: str
    text: str = Field(..., description="Free text, e.g. 'Quiero que mi hija me ayude con mis gastos mientras estoy recuperándome'")


class MissionConfirmRequest(BaseModel):
    owner_id: str
    delegate_name: str
    purpose: str
    days: int
    monthly_limit: float
    per_transaction_limit: Optional[float] = None
    allowed_categories: list[str]
    source_text: Optional[str] = None


class SimulateTransactionRequest(BaseModel):
    user_id: str
    merchant: str
    category: str
    amount: float
    mission_id: Optional[str] = None


class TrustMemberRequest(BaseModel):
    user_id: str
    name: str
    relationship: str
    role: str
    can_pay_bills: bool = False
    can_review_alerts: bool = False


class ContinuityActivateRequest(BaseModel):
    user_id: str


class CustomScenarioRequest(BaseModel):
    owner_name: str
    delegate_name: Optional[str] = None
    delegate_relationship: str = "familiar"


class ExceptionRequestCreate(BaseModel):
    user_id: str
    mission_id: str
    merchant: str
    category: str
    amount: float
    requested_by: str


class ExceptionResolveRequest(BaseModel):
    decision: str  # "approved" | "denied"
    resolved_by: str
