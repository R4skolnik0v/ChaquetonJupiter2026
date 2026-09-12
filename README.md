# Acompañamiento Financiero

Prototipo para el hackathon de Capital One.

> "Helping with your money shouldn't mean giving up control."
> "Que te ayuden con tu dinero no debería significar perder el control sobre él."

Una plataforma web (no una app móvil) donde un adulto mayor puede delegar
**tareas financieras específicas** a una persona de confianza — sin
entregarle el control total de su cuenta.

**v2**: ahora la misma app tiene 5 demos precargadas (una por capacidad del
producto) más un flujo "empezar desde cero", y el Mission Compiler se movió
al Modo Adulto Mayor — ver la sección 4 y el CHANGELOG al final.

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

## 2. Para quién es — y los 5 escenarios de demo

En vez de un solo caso (María), la app ahora trae 5 escenarios precargados,
cada uno mostrando una capacidad distinta:

| Escenario | Tema | Qué demuestra |
|---|---|---|
| 🧓🏽 María | Delegación segura | Mission Compiler, permisos granulares, transacciones permitidas/no permitidas |
| 💊 Carlos | Comportamiento anómalo | Un cargo autorizado pero fuera de lo habitual → `REVIEW` |
| 🛟 Elena | Continuidad financiera | Un plan pre-autorizado que se activa y expira solo |
| 🧾 Roberto | Límites de permisos | Un límite *por transacción* (no solo mensual) → `BLOCKED` + solicitud de excepción |
| 🚨 Patricia | Búsqueda del límite | Pagos que suben poco a poco y se acercan al límite autorizado |

Cada uno es una fila de datos en `backend/app/scenarios.py`, no código
distinto — los 5 pasan por exactamente el mismo Mission Compiler, Risk
Engine y Decision Engine. También existe **"Empezar desde cero"**: un
escenario en blanco, sin ningún dato de los 5 anteriores, para armar una
misión con nombres propios.

## 3. Cómo funciona, en una frase

El adulto mayor describe lo que necesita → el **Mission Compiler** propone
una misión estructurada → el adulto mayor la confirma → cada transacción
que llegue bajo esa misión pasa por un **Decision Engine** determinista que
la aprueba, la bloquea, o la manda a revisión — explicando siempre por qué.

## 4. Qué hace cada modo

### Modo Adulto Mayor (👵) — el más importante
Una sola columna, tipografía grande, máximo 3–5 acciones por pantalla, cero
jerga ("Risk Score", "APR", "Cash Flow" no existen aquí). Pantallas:
Inicio, Mis movimientos, Próximos pagos, Explícame mis gastos (narra la
diferencia entre meses en lugar de mostrar una gráfica), Ayuda (quién puede
apoyarlo), **Pedir ayuda** (el Mission Compiler, ver sección 5) y
**Solicitudes de tu familia** (aprobar o rechazar excepciones, sección 6).

### Modo Familiar / Ayudante (👩)
Panel operativo: la misión que el adulto mayor ya autorizó (con su barra de
límite y permisos — de solo lectura, el familiar no la puede editar), un
simulador de transacciones para ver el motor de decisiones en vivo, sus
solicitudes de excepción, la bitácora de auditoría completa, la red de
confianza, y el panel de Continuidad Financiera.

Ambos modos leen y escriben la misma base de datos — no son dos apps
separadas, son dos vistas de la misma cuenta.

## 5. El Mission Compiler vive en el Modo Adulto Mayor

Este es el cambio conceptual más importante del proyecto: **la intención
de la misión tiene que venir de quien es dueño del dinero, nunca de quien
va a ayudar**. El familiar jamás decide sus propios permisos.

Flujo (`components/elder/ElderRequestHelp.jsx`, banner "¿Necesitas ayuda
con tu dinero?" en la pantalla de Inicio):

```
ADULTO MAYOR describe la ayuda en lenguaje natural
        ↓
MISSION COMPILER interpreta la intención (backend/app/engines/mission_compiler.py)
        ↓
Propone: ayudante, propósito, duración, límite, categorías permitidas
        ↓
ADULTO MAYOR revisa (puede editar cada campo) y CONFIRMA
        ↓
Se crea la misión — el familiar la ve, ya autorizada, en su propio modo
        ↓
El familiar ejecuta tareas dentro de lo autorizado
        ↓
Permission Engine + Risk Engine evalúan cada transacción
```

Una misión es una fila en la base de datos con:

- **delegate**: quién ayuda (debe estar en la red de confianza)
- **allowed_categories**: en qué puede gastar (ej. CFE, Agua, Farmacia)
- **monthly_limit**: cuánto, como máximo, por mes
- **per_transaction_limit** *(opcional)*: un tope por pago individual — ej.
  "hasta $500 por recibo de CFE" (usado por los escenarios de Roberto y
  Patricia; el Compiler no lo sugiere todavía, solo el límite mensual)
- **forbidden actions**: siempre incluye transferencias, retiros, cambios
  de beneficiario y de titularidad, préstamos — sin excepción
- **start_date / end_date**: la misión expira sola (el Decision Engine
  revisa esto en cada transacción, no solo al crearla)

Nada de esto se guarda hasta que el adulto mayor presiona "Confirmar
misión" — el compilador **propone**, nunca autoriza.

## 6. Excepciones: el familiar pide, el adulto mayor decide

Cuando una transacción se bloquea *únicamente* por exceder un límite de
gasto (mensual o por transacción — nunca por una acción no delegable como
una transferencia), la familia puede pedir una excepción de una sola vez.
El Decision Engine marca esto como `exception_eligible` (ver
`decision_engine.py`); solo entonces aparece el botón "Solicitar
excepción" en la bitácora del familiar.

```
Familiar intenta CFE $742 (límite: $500 por transacción)
        ↓
🔴 BLOCKED, exception_eligible = true
        ↓
Familiar presiona "Solicitar excepción"
        ↓
Adulto mayor ve, en su propio modo: "Andrés quiere pagar $742 a CFE.
Tu límite actual es $500." → [Aprobar una vez] [Rechazar]
        ↓
Si aprueba: se crea una transacción APPROVED (no cambia el límite de la
misión, solo autoriza ese pago). Si rechaza: queda BLOCKED, con la razón
registrada en el audit trail.
```

Esto refuerza la regla central: el familiar puede pedir, pero solo el
adulto mayor autoriza. Ver `backend/app/routers/exceptions.py`.

## 7. Cómo funciona el Risk Engine

Tres señales, ninguna decide sola:

1. **Anomalía de monto** (`behavior_baseline.py` + `risk_engine.py`):
   compara una transacción contra el promedio histórico de esa categoría
   para ese usuario. Un monto ≥2× el promedio se marca para revisión.
2. **Boundary detection**: si varias transacciones recientes se acercan
   repetidamente al límite autorizado (mensual o por transacción, el que
   aplique), se marca para revisión.
3. **Escalamiento**: si los últimos montos suben de forma sostenida (ej.
   $200 → $400 → $700), se marca para revisión aunque cada monto individual
   parezca razonable (`behavior_baseline.detect_escalation`).

Ninguna de las tres acusa de fraude — solo piden que un humano lo revise.

El **Decision Engine** (`decision_engine.py`) combina esto con las reglas
duras y siempre resuelve en uno de tres estados: `APPROVED`, `REVIEW`,
`BLOCKED`. Las reglas duras (misión expirada, categoría no permitida,
límite excedido, acción no delegable) **siempre ganan** — ninguna señal de
comportamiento puede aprobar algo que una regla determinista ya bloqueó.

## 8. Cómo usamos los datos de Capital One / Nessie

Este prototipo usa datos simulados (`backend/app/scenarios.py`) con la
misma forma que tendría un feed real de Nessie: comercio, categoría, monto,
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

## 9. Arquitectura

```
frontend/   React + Vite. Dos experiencias (Elder / Family) sobre la
            misma API, más una landing con selector de escenario. Incluye
            un motor de respaldo en el navegador (src/data/localEngine.js)
            que replica las mismas reglas y los mismos 5 escenarios por si
            el backend no está corriendo durante la demo.

backend/    FastAPI + SQLite (sqlite3 puro, sin ORM).
              app/engines/    Mission Compiler, Behavior Baseline,
                               Risk Engine, Decision Engine.
              app/scenarios.py  Los 5 escenarios como datos + UNA función
                               que los provisiona (sin ifs por nombre).
              app/routers/    users, missions, transactions, audit, trust,
                               continuity, scenarios, exceptions.
              app/seed.py     Provisiona los 5 escenarios al arrancar.
```

Un escenario = un `user_id`. Cambiar de demo en el frontend es solo cambiar
qué `user_id` se le pregunta a una API que ya es genérica — por eso nunca
hace falta reiniciar el backend para cambiar de escenario.

## 10. Base de datos

SQLite, un archivo (`backend/money_companion.db`, se genera al correr el
seed). Tablas: `users`, `family_members`, `trust_network`, `missions`
(incluye `per_transaction_limit`), `permissions`, `transactions` (incluye
`exception_eligible`), `behavior_profiles` (calculado al vuelo, no
persistido, ver limitaciones), `alerts`, `approvals`, `audit_log`,
`continuity_rules`, `exception_requests`. El esquema completo con
comentarios está en `backend/app/database.py`.

## 11. Cómo ejecutar el proyecto

Exactamente igual que antes — nada de esto cambió con la v2.

**Backend** (Python 3.10+, conexión a internet la primera vez):

```bash
cd backend
./run.sh
# crea/reinicia la base de datos con los 5 escenarios y levanta
# la API en http://localhost:8000
```

**Frontend** (Node.js 18+):

```bash
cd frontend
npm install
npm run dev
# abre http://localhost:5173
```

Si el backend no está corriendo, el frontend sigue funcionando: cae
automáticamente a `src/data/localEngine.js`. Un aviso discreto en el
dashboard indica cuándo está usando este modo de respaldo.

## 12. Cómo ejecutar la demo

1. Abre la app → **"Explorar demos"** → elige un escenario (empieza con
   María si es tu primera vez).
2. Elige **"Soy familiar"** para ver la misión ya activa y usar los botones
   de **"Simular transacción entrante"** (varían según el escenario —
   revisa la tabla de la sección 2 para saber qué esperar de cada uno).
3. Haz clic en cualquier fila de la bitácora para expandir el "¿Por qué?".
4. Cambia a **"Soy [nombre]"** (botón "Cambiar de modo") para ver la otra
   mitad de la historia, contada de forma simple.
5. En Modo Adulto Mayor, prueba **"¿Necesitas ayuda con tu dinero?"** para
   ver el Mission Compiler crear una misión nueva desde cero.
6. Para el escenario de Roberto o Patricia: dispara una transacción que
   exceda el límite por transacción, luego cambia a Modo Familiar y
   presiona "Solicitar excepción" — luego regresa a Modo Adulto Mayor para
   aprobarla o rechazarla desde "Solicitudes de tu familia".
7. Para Elena: activa Continuidad en vivo desde el Modo Familiar.
8. Usa **"Reiniciar escenario"** (en el menú de cualquiera de los dos
   modos) para regresar ese escenario a su estado inicial sin recargar la
   página ni reiniciar el backend. **"Cambiar demo"** regresa a la
   cuadrícula de escenarios; **"Inicio"** regresa a la pantalla de entrada.
9. Prueba **"Empezar desde cero"** desde la pantalla de inicio para armar
   una misión con tus propios nombres, en un espacio completamente aislado
   de los 5 escenarios.

## 13. Qué parte utiliza IA / ML

Solo el **Mission Compiler**, y de forma deliberadamente limitada: es
interpretación de intención por palabras clave (sin llamadas a un LLM, para
que la demo no dependa de internet ni de una API key). Su única salida es
un *borrador* editable que el adulto mayor revisa y confirma — nunca
escribe permisos directamente. En producción, este paso se sustituiría por
un LLM con más comprensión de lenguaje natural, pero el diseño no cambia:
seguiría sin tener autoridad para aprobar nada por sí mismo.

## 14. Qué parte utiliza reglas deterministas

Todo lo demás: qué categorías están permitidas, el límite mensual y por
transacción, la vigencia de la misión, y sobre todo, la lista de acciones
que **nunca** se pueden delegar — ni siquiera por excepción (transferencias,
retiros, cambios de beneficiario/titularidad, préstamos). Esa lista vive
como código en `decision_engine.py` y se vuelve a aplicar en
`routers/exceptions.py`, no como configuración editable desde la UI — es la
garantía central del producto.

## 15. Por qué nuestra solución es diferente

No es una app de presupuesto, ni un chatbot financiero, ni un detector de
fraude genérico, ni "banca familiar" con acceso compartido. Es un sistema
de **delegación controlada**: el adulto mayor conserva la cuenta, decide
qué se delega, y puede ver exactamente qué pasó y por qué en cualquier
momento. La familia obtiene herramientas reales para ayudar sin heredar
control total ni responsabilidad ilimitada — y cuando necesita más de lo
autorizado, tiene que pedirlo, no tomarlo.

## 16. Limitaciones del prototipo

- El saldo disponible de cada escenario es un valor fijo, no se recalcula a
  partir de las transacciones (en producción vendría de la cuenta real vía
  Nessie/Capital One).
- Los perfiles de comportamiento (`behavior_profiles`) se calculan al vuelo
  desde el historial de transacciones en cada request, en lugar de
  guardarse y actualizarse de forma incremental.
- El Mission Compiler es reglas por palabra clave, no un modelo de lenguaje
  real, y todavía no sugiere un límite por transacción (solo mensual) —
  los escenarios de Roberto y Patricia lo traen precargado como dato.
- No hay autenticación real: cualquiera que abra la app puede entrar a
  cualquier escenario o crear uno nuevo.
- El motor de respaldo del frontend (`localEngine.js`) duplica a mano la
  lógica de Python, incluyendo los 5 escenarios; en producción esa
  duplicación no debería existir — es una decisión explícita solo para
  blindar la demo ante fallas de red.
- "Reiniciar escenario" reinicia los 5 escenarios de demo a su estado
  original; un escenario de "empezar desde cero" no se puede reiniciar
  (no tiene un estado original al que volver) — simplemente se abandona y
  se crea uno nuevo.

## 17. Qué podría hacerse en producción

- Sustituir el mock de Nessie por la API real y mover `behavior_profiles` a
  una tabla que se actualiza de forma incremental (o a un job de ML real
  con pandas/scikit-learn, como sugiere el brief original).
- Reemplazar el Mission Compiler por un LLM con function calling, sin tocar
  el Decision Engine ni el flujo de confirmación del adulto mayor.
- Añadir autenticación real y multi-cuenta (hoy el "login" es solo elegir
  un escenario).
- Notificaciones push/SMS cuando una transacción cae en `REVIEW`/`BLOCKED`,
  o cuando hay una solicitud de excepción pendiente.
- Mover SQLite a Postgres y el esquema plano a migraciones versionadas.

## CHANGELOG (v1 → v2)

- Landing con "Explorar demos" / "Empezar desde cero"; 5 escenarios
  precargados (María, Carlos, Elena, Roberto, Patricia) definidos como
  datos en `scenarios.py`, no como código por persona.
- El Mission Compiler se movió del Modo Familiar al Modo Adulto Mayor
  (`ElderRequestHelp.jsx`) — el familiar ya no puede crear ni editar su
  propia misión.
- Nuevo flujo de excepciones: el familiar pide, el adulto mayor aprueba o
  rechaza (`exceptions.py`, `ElderApprovals.jsx`).
- Nuevo `per_transaction_limit` en las misiones (tope por pago individual,
  además del límite mensual).
- El Decision Engine ahora revisa la vigencia de la misión (auto-expira) y
  detecta patrones de escalamiento, además de anomalías y boundary-seeking.
- "Cambiar demo" / "Reiniciar escenario" / "Inicio" en ambos modos — nunca
  hace falta reiniciar el backend para cambiar de escenario.
