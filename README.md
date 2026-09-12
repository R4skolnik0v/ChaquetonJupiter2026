# Acompañamiento Financiero — María &amp; Laura

Prototipo para el hackathon de Capital One.

> "Helping with your money shouldn't mean giving up control."
> "Que te ayuden con tu dinero no debería significar perder el control sobre él."

Una plataforma web (no una app móvil) donde un adulto mayor puede delegar
**tareas financieras específicas** a una persona de confianza — sin
entregarle el control total de su cuenta.

---

## 1. Qué problema resolvemos

Muchos adultos mayores tienen dificultad para usar aplicaciones bancarias y
terminan dependiendo de un hijo, nieto o cuidador para pagar sus servicios.
El problema es que "ayudar" casi siempre implica compartir una contraseña o
dar acceso total a la cuenta — todo o nada.

Este prototipo propone un punto intermedio: **misiones financieras**. El
adulto mayor delega una tarea concreta ("ayúdame a pagar mis servicios este
mes"), con un límite de gasto, categorías permitidas, y una lista de
acciones que jamás se delegan (transferencias, retiros, cambios de
beneficiario). Un motor de decisiones evalúa cada transacción contra esas
reglas en tiempo real.

## 2. Para quién es

- **María** (72 años): quiere ver que su dinero está bien, sin jerga
  financiera ni pantallas saturadas.
- **Laura** (su hija): quiere ayudar de forma concreta, con visibilidad y
  límites claros, sin tener que "tomar el control" de la cuenta de su mamá.
- **Carlos** (sobrino, respaldo): puede revisar alertas, pero no tiene
  poder de gasto — pertenecer a la red de confianza no otorga permisos por
  sí solo.

## 3. Cómo funciona, en una frase

María describe lo que necesita → el **Mission Compiler** propone una
misión estructurada → María la confirma → cada transacción que llegue bajo
esa misión pasa por un **Decision Engine** determinista que la aprueba,
la bloquea, o la manda a revisión — explicando siempre por qué.

## 4. Qué hace cada modo

### Modo Adulto Mayor (👵)
Una sola columna, tipografía grande, máximo 3–5 acciones por pantalla, cero
jerga ("Risk Score", "APR", "Cash Flow" no existen aquí). Pantallas:
Inicio, Mis movimientos, Próximos pagos, Explícame mis gastos (narra la
diferencia entre meses en lugar de mostrar una gráfica), y Ayuda (quién
puede apoyarla).

### Modo Familiar / Ayudante (👩)
Panel operativo: misión activa con barra de límite y permisos, un
simulador de transacciones para ver el motor de decisiones en vivo, la
bitácora de auditoría completa, la red de confianza, y el panel de
Continuidad Financiera.

Ambos modos leen y escriben la misma base de datos — no son dos apps
separadas, son dos vistas de la misma cuenta.

## 5. Cómo funcionan las Financial Missions

Una misión es una fila en la base de datos con:

- **delegate**: quién ayuda (debe estar en la red de confianza)
- **allowed_categories**: en qué puede gastar (ej. CFE, Agua, Farmacia)
- **monthly_limit**: cuánto, como máximo, por mes
- **forbidden actions**: siempre incluye transferencias, retiros, cambios
  de beneficiario y de titularidad, préstamos — sin excepción, sin importar
  lo que pida la misión.
- **start_date / end_date**: la misión expira sola.

El **Mission Compiler** (`backend/app/engines/mission_compiler.py`) toma
texto libre como *"Quiero que mi hija me ayude con mis gastos mientras
estoy recuperándome"* y propone: persona, propósito, duración, categorías
y límite sugerido (calculado a partir del historial real de gasto de esa
categoría). Nada de esto se guarda hasta que el dueño de la cuenta presiona
"Confirmar misión" — el compilador **propone**, nunca autoriza.

## 6. Cómo funciona el Risk Engine

Dos señales, ninguna decide sola:

1. **Anomalía de monto** (`behavior_baseline.py` + `risk_engine.py`):
   compara una transacción contra el promedio histórico de esa categoría
   para ese usuario. Un monto ≥2× el promedio se marca para revisión.
2. **Boundary detection**: si varias transacciones recientes se acercan
   repetidamente al límite de la misión (ej. $195, $198, $199 contra un
   límite de $200), se marca para revisión. Esto **no** acusa de fraude —
   solo pide que un humano lo mire.

El **Decision Engine** (`decision_engine.py`) combina esto con las reglas
duras y siempre resuelve en uno de tres estados: `APPROVED`, `REVIEW`,
`BLOCKED`. Las reglas duras (categoría no permitida, límite excedido,
acción no delegable) **siempre ganan** — ninguna señal de comportamiento
puede aprobar algo que una regla determinista ya bloqueó.

## 7. Cómo usamos los datos de Capital One / Nessie

Este prototipo usa datos simulados (`backend/app/seed.py`) con la misma
forma que tendría un feed real de Nessie: comercio, categoría, monto,
fecha. La arquitectura está separada exactamente donde tendría que
conectarse la API real:

```
Capital One / Nessie
        ↓
Transaction Parser        (la forma del dict que recibe el Decision Engine)
        ↓
Mission / Permission Engine
        ↓
Behavioral Analysis
        ↓
Risk Engine
        ↓
Decision Engine
        ↓
APPROVE / REVIEW / BLOCK
        ↓
Audit Log
```

Sustituir Nessie por datos reales significa cambiar únicamente de dónde
vienen las filas de `transactions` — nada en `missions.py`,
`decision_engine.py` o el audit log necesita cambiar.

## 8. Arquitectura

```
frontend/   React + Vite. Dos experiencias (Elder / Family) sobre la
            misma API. Incluye un motor de respaldo en el navegador
            (src/data/localEngine.js) que replica las mismas reglas por
            si el backend no está corriendo durante la demo.

backend/    FastAPI + SQLite (sqlite3 puro, sin ORM, para que el código
            sea fácil de leer en voz alta frente a los jueces).
              app/engines/   Mission Compiler, Behavior Baseline,
                              Risk Engine, Decision Engine.
              app/routers/   users, missions, transactions, audit,
                              trust, continuity.
              app/seed.py    Datos mock estilo Nessie + escenario completo
                              de demo (María + Laura).
```

## 9. Base de datos

SQLite, un archivo (`backend/money_companion.db`, se genera al correr el
seed). Tablas: `users`, `family_members`, `trust_network`, `missions`,
`permissions`, `transactions`, `behavior_profiles` (calculado al vuelo,
no persistido, ver limitaciones), `alerts`, `approvals`, `audit_log`,
`continuity_rules`. El esquema completo con comentarios está en
`backend/app/database.py`.

## 10. Cómo ejecutar el proyecto

**Backend** (requiere Python 3.10+ y conexión a internet para instalar
dependencias la primera vez):

```bash
cd backend
./run.sh
# crea/reinicia la base de datos con el escenario de demo y levanta
# la API en http://localhost:8000
```

**Frontend** (requiere Node.js 18+):

```bash
cd frontend
npm install
npm run dev
# abre http://localhost:5173
```

Si el backend no está corriendo, el frontend sigue funcionando: cae
automáticamente a `src/data/localEngine.js`, que reimplementa las mismas
reglas dentro del navegador con el mismo escenario de demo. Un aviso
discreto en el dashboard indica cuándo está usando este modo de respaldo.

## 11. Cómo ejecutar la demo

1. Abre la app → elige **"Soy familiar / ayudante"**.
2. En **Resumen** verás la misión de Laura ya activa (creada en el seed).
3. Usa los botones de **"Simular transacción entrante"** en este orden
   para reproducir el guion de la demo:
   - CFE — $183 → `APPROVED`
   - Farmacia — $420 → `APPROVED`
   - Transferencia — $5,000 → `BLOCKED` (regla determinista)
   - CFE — $1,420 → `REVIEW` (el **wow moment**: el motor explica que es
     ~7× el monto habitual, con el promedio real calculado en vivo)
4. Haz clic en cualquier fila de la bitácora para expandir el "¿Por qué?".
5. Ve a **Nueva misión** y escribe una petición en texto libre para ver al
   Mission Compiler proponer una misión desde cero.
6. Ve a **Continuidad** y actívala en vivo para mostrar cómo un plan
   pre-autorizado se convierte automáticamente en una misión normal.
7. Cambia a **"Soy María"** para mostrar la otra mitad de la historia:
   la misma cuenta, contada de forma simple.

## 12. Qué parte utiliza IA / ML

Solo el **Mission Compiler**, y de forma deliberadamente limitada: es
interpretación de intención por palabras clave (sin llamadas a un LLM, para
que la demo no dependa de internet ni de una API key). Su única salida es
un *borrador* editable — nunca escribe permisos directamente. En
producción, este paso se sustituiría por un LLM con más comprensión de
lenguaje natural, pero el diseño no cambia: seguiría sin tener autoridad
para aprobar nada por sí mismo.

## 13. Qué parte utiliza reglas deterministas

Todo lo demás: qué categorías están permitidas, el límite mensual, y sobre
todo, la lista de acciones que **nunca** se pueden delegar (transferencias,
retiros, cambios de beneficiario/titularidad, préstamos). Esa lista vive
como código en `decision_engine.py`, no como configuración editable desde
la UI — es la garantía central del producto.

## 14. Por qué nuestra solución es diferente

No es una app de presupuesto, ni un chatbot financiero, ni un detector de
fraude genérico, ni "banca familiar" con acceso compartido. Es un sistema
de **delegación controlada**: el adulto mayor conserva la cuenta, decide
qué se delega, y puede ver exactamente qué pasó y por qué en cualquier
momento. La familia obtiene herramientas reales para ayudar sin heredar
control total ni responsabilidad ilimitada.

## 15. Limitaciones del prototipo

- El saldo disponible de María es un valor fijo, no se recalcula a partir
  de las transacciones (en producción vendría de la cuenta real vía
  Nessie/Capital One).
- Los perfiles de comportamiento (`behavior_profiles`) se calculan al
  vuelo desde el historial de transacciones en cada request, en lugar de
  guardarse y actualizarse de forma incremental.
- El Mission Compiler es reglas por palabra clave, no un modelo de
  lenguaje real.
- No hay autenticación: el usuario activo está fijo (`USER_ID = "maria"`)
  para simplificar la demo.
- El motor de respaldo del frontend (`localEngine.js`) duplica a mano la
  lógica de Python; en producción esa duplicación no debería existir — es
  una decisión explícita solo para blindar la demo ante fallas de red.

## 16. Qué podría hacerse en producción

- Sustituir el mock de Nessie por la API real y mover `behavior_profiles`
  a una tabla que se actualiza de forma incremental (o a un job de ML real
  con pandas/scikit-learn, como sugiere el brief original).
- Reemplazar el Mission Compiler por un LLM con function calling, sin
  tocar el Decision Engine.
- Añadir autenticación real y multi-cuenta.
- Notificaciones push/SMS cuando una transacción cae en `REVIEW` o
  `BLOCKED`, y un flujo de aprobación real para los `alerts`/`approvals`.
- Mover SQLite a Postgres y el esquema plano a migraciones versionadas.
