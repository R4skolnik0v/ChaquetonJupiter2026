import React, { useEffect, useState } from "react";
import { api } from "../../api.js";
import { formatMoney } from "../../utils.js";

export default function ElderExplain({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.explainSpending(userId).then(setData);
  }, [userId]);

  if (!data) return <p>Cargando…</p>;

  if (!data.headline) {
    return (
      <div className="elder-explain-card">
        <p className="elder-explain-headline">Tus gastos van igual que el mes pasado. No hay nada fuera de lo común.</p>
      </div>
    );
  }

  const top = data.comparisons[0];

  return (
    <div>
      <div className="elder-explain-card">
        <p className="elder-explain-headline">{data.headline}</p>
        <div className="elder-explain-compare">
          <div className="col">
            <div className="label">Mes pasado</div>
            <div className="value">{formatMoney(top.last_month)}</div>
          </div>
          <div className="col">
            <div className="label">Este mes</div>
            <div className="value" style={{ color: "var(--amber)" }}>
              {formatMoney(top.this_month)}
            </div>
          </div>
        </div>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", padding: "0 4px" }}>
        Esto no significa que algo esté mal. Si quieres, puedes pedirle a tu familia que lo revise contigo.
      </p>
    </div>
  );
}
