# Acompañamiento Financiero

Prototipo para el hackathon de Capital One.

> "Helping with your money shouldn't mean giving up control."
> "Que te ayuden con tu dinero no debería significar perder el control sobre él."

Una plataforma web donde un adulto mayor puede delegar
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

| Escenario | Tema | Qué demuestra |
|---|---|---|
|  María | Delegación segura | Mission Compiler, permisos granulares, transacciones permitidas/no permitidas |
|  Carlos | Comportamiento anómalo | Un cargo autorizado pero fuera de lo habitual → `REVIEW` |
|  Elena | Continuidad financiera | Un plan pre-autorizado que se activa y expira solo |
|  Roberto | Límites de permisos | Un límite *por transacción* (no solo mensual) → `BLOCKED` + solicitud de excepción |
|  Patricia | Búsqueda del límite | Pagos que suben poco a poco y se acercan al límite autorizado |

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
diferencia entre meses en lugar de mostrar una gráfica), **Personas que me
ayudan** (la red de confianza — agregar y quitar personas es decisión del
adulto mayor, sección 5), **Mi continuidad** (configurar/activar/desactivar
el plan de continuidad, también solo el adulto mayor), **¿Quieres cambiar
algo?** (la caja de texto del Intent Engine — mission compiler, revocar
permisos, todo, ver sección 5), y **Solicitudes de tu familia** (aprobar o
rechazar excepciones, sección 6).

### Modo Familiar / Ayudante (👩)
Panel de solo lectura sobre lo que el adulto mayor ya autorizó: la misión
activa (con su barra de límite y permisos), un simulador de transacciones
para ver el motor de decisiones en vivo, sus solicitudes de excepción, la
bitácora de auditoría completa, la red de confianza y el estado de
Continuidad. Nada de esto se puede crear ni editar desde este lado — ni
una misión, ni una persona de confianza, ni el plan de continuidad.

Ambos modos leen y escriben la misma base de datos — no son dos apps
separadas, son dos vistas de la misma cuenta.

## 5. El Intent Engine: una sola caja de texto para todo

Este es el cambio conceptual más importante del proyecto: **la intención
siempre viene de quien es dueño del dinero, nunca de quien va a ayudar**.
El familiar jamás decide sus propios permisos, ni los agrega, ni los quita.

En vez de una pantalla distinta por cada acción posible (crear misión,
revocar un permiso, agregar a alguien, configurar continuidad...), el
adulto mayor tiene UNA sola caja: "¿Quieres cambiar algo?"
(`components/elder/ElderIntentBox.jsx`). El Intent Engine
(`backend/app/engines/intent_engine.py`) clasifica el texto en uno de 12
intents y propone una acción estructurada:

```
CREATE_MISSION · MODIFY_MISSION · REVOKE_PERMISSION · GRANT_PERMISSION
MODIFY_LIMIT · MODIFY_DURATION · ADD_TRUSTED_PERSON · REMOVE_TRUSTED_PERSON
ENABLE_CONTINUITY · MODIFY_CONTINUITY · DISABLE_CONTINUITY
GENERAL_FINANCIAL_QUESTION
```

Flujo, siempre el mismo sin importar el intent:

```
ADULTO MAYOR describe lo que quiere en lenguaje natural
        ↓
INTENT ENGINE clasifica la intención y arma una propuesta
        ↓
Muestra "Esto es lo que entendí" -- nunca ejecuta todavía
        ↓
ADULTO MAYOR revisa (puede editar los campos clave) y CONFIRMA
        ↓
Solo AHORA se escribe en la base de datos (POST /api/intent/execute)
        ↓
El familiar ve el resultado ya autorizado, en su propio modo (solo lectura)
        ↓
Permission Engine + Risk Engine evalúan cada transacción como siempre
```

Ejemplo real (probado, no hipotético): María escribe *"Ya no quiero que mi
hijo pueda hacer transferencias"* → el motor identifica REVOKE_PERMISSION
sobre Carlos y responde *"Entendí que quieres quitarle a Carlos el permiso
para 'Transferencia'. Buena noticia: eso nunca estuvo permitido para
nadie..."* -- porque las transferencias son una regla dura, ninguna misión
puede otorgarlas, con o sin Intent Engine de por medio.

Los casos donde crear una misión sigue siendo el resultado correcto
reutilizan el **Mission Compiler** original
(`backend/app/engines/mission_compiler.py`) sin duplicar su lógica de
categorías/duración/límite -- el Intent Engine solo decide *cuándo*
llamarlo.

Una misión sigue siendo una fila en la base de datos con:

- **delegate**: quién ayuda (debe estar en la red de confianza)
- **allowed_categories**: en qué puede gastar (ej. CFE, Agua, Farmacia) --
  esto es exactamente lo que REVOKE_PERMISSION/GRANT_PERMISSION modifican
- **monthly_limit** / **per_transaction_limit** *(opcional)*: MODIFY_LIMIT
  cambia cualquiera de los dos
- **forbidden actions**: siempre incluye transferencias, retiros, cambios
  de beneficiario y de titularidad, préstamos -- ninguna de las 12 intents
  puede tocar esta lista, ni siquiera como "excepción" (ver `routers/
  exceptions.py`, que la vuelve a comprobar de forma independiente)
- **start_date / end_date**: MODIFY_DURATION cambia esto; el Decision
  Engine también lo revisa en cada transacción, no solo al crear la misión

Nada de esto se guarda hasta que el adulto mayor presiona "Sí, hacer este
cambio" -- el Intent Engine **propone**, nunca autoriza.

## 6. Excepciones: el familiar pide, el adulto mayor decide

Cuando una transacción se bloquea *únicamente* por exceder un límite de
gasto (mensual o por transacción — nunca por una acción no delegable como
una transferencia), la familia puede pedir una excepción de una sola vez.
El Decision Engine marca esto como `exception_eligible` (ver
`decision_engine.py`, y persistido en `transactions.exception_eligible`);
solo entonces aparece el botón "Solicitar excepción" en la bitácora del
familiar.

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

El Intent Engine no tiene tabla propia: cada acción que ejecuta escribe una
fila más en `audit_log`, con `transaction_id = NULL` (porque no fue una
transacción). `GET /api/audit` usa un LEFT JOIN con `transactions` para no
perder esas filas -- un INNER JOIN las habría descartado en silencio; ese
fue justo uno de los bugs que corrigió esta versión.

## 11. Cómo ejecutar el proyecto

Exactamente igual que en la v1 y la v2 — nada de esto cambió.

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
5. En Modo Adulto Mayor, prueba **"¿Quieres cambiar algo?"** -- este es el
   guion que más vale la pena mostrar en el hackathon:
   - Escribe *"Ya no quiero que mi hijo pueda hacer transferencias"* (con
     María, cuyo hijo es Carlos) → el Intent Engine identifica
     REVOKE_PERMISSION y explica que eso ya estaba bloqueado por regla dura.
   - Escribe *"Quiero que Laura me ayude con mis servicios este mes"* →
     propone (o actualiza, si Laura ya tiene una misión) una misión
     estructurada; confirma y ve a Modo Familiar para ver a Laura con esos
     permisos ya autorizados.
   - Escribe *"Quiero agregar a mi sobrina Fernanda para que me ayude con
     el supermercado"* (usa un nombre que no exista ya en el escenario) →
     ADD_TRUSTED_PERSON.
6. Ve a **"Personas que me ayudan"** para ver/quitar a alguien de la red de
   confianza directamente (sin pasar por texto libre).
7. Ve a **"Mi continuidad"** para configurar, activar o desactivar el plan
   de continuidad -- en Elena, ya viene configurado (no activado); pruébalo
   ahí primero.
8. Para el escenario de Roberto o Patricia: dispara una transacción que
   exceda el límite por transacción, cambia a Modo Familiar y presiona
   "Solicitar excepción" -- luego regresa a Modo Adulto Mayor para
   aprobarla o rechazarla desde "Solicitudes de tu familia".
9. Usa **"Reiniciar escenario"** (en el menú de cualquiera de los dos
   modos) para regresar ese escenario a su estado inicial sin recargar la
   página ni reiniciar el backend. **"Cambiar demo"** regresa a la
   cuadrícula de escenarios; **"Inicio"** regresa a la pantalla de entrada.
10. Prueba **"Empezar desde cero"** desde la pantalla de inicio para armar
    una misión con tus propios nombres, en un espacio completamente
    aislado de los 5 escenarios.

## 13. Qué parte utiliza IA / ML

El **Intent Engine** (`backend/app/engines/intent_engine.py`) y el
**Mission Compiler** que reutiliza (`mission_compiler.py`), y de forma
deliberadamente limitada: es clasificación e interpretación de intención
por palabras clave y patrones, sin llamadas a un LLM (para que la demo no
dependa de internet ni de una API key). Su única salida es una *propuesta*
editable que el adulto mayor revisa y confirma — nunca escribe permisos,
misiones, personas de confianza ni reglas de continuidad directamente. En
producción, este paso se sustituiría por un LLM con más comprensión de
lenguaje natural (y mejor extracción de nombres propios, hoy el punto más
frágil — ver Limitaciones), pero el diseño no cambia: seguiría sin tener
autoridad para ejecutar nada por sí mismo.

## 14. Qué parte utiliza reglas deterministas

Todo lo demás: qué categorías están permitidas, el límite mensual y por
transacción, la vigencia de la misión, y sobre todo, la lista de acciones
que **nunca** se pueden delegar — ni siquiera por excepción, ni siquiera si
el Intent Engine "entiende" una petición para hacerlo (transferencias,
retiros, cambios de beneficiario/titularidad, préstamos). Esa lista vive
como código en `decision_engine.py` y se vuelve a comprobar de forma
independiente en `routers/exceptions.py` y en cada rama de
`routers/intent.py` que toca permisos — ninguna de las 12 intents puede
tocarla, es la garantía central del producto.

## 15. Por qué nuestra solución es diferente

No es una app de presupuesto, ni un chatbot financiero, ni un detector de
fraude genérico, ni "banca familiar" con acceso compartido. Es un sistema
de **delegación controlada**: el adulto mayor conserva la cuenta, decide
qué se delega, puede revocarlo con una frase, y puede ver exactamente qué
pasó y por qué en cualquier momento. La familia obtiene herramientas reales
para ayudar sin heredar control total ni responsabilidad ilimitada — y
cuando necesita más de lo autorizado, tiene que pedirlo, no tomarlo.

## 16. Limitaciones del prototipo

- El saldo disponible de cada escenario es un valor fijo, no se recalcula a
  partir de las transacciones (en producción vendría de la cuenta real vía
  Nessie/Capital One).
- Los perfiles de comportamiento (`behavior_profiles`) se calculan al vuelo
  desde el historial de transacciones en cada request, en lugar de
  guardarse y actualizarse de forma incremental.
- El Mission Compiler y el Intent Engine son reglas por palabra clave, no
  un modelo de lenguaje real. El punto más frágil es la extracción de
  nombres propios para ADD_TRUSTED_PERSON (`_extract_capitalized_name`):
  toma la primera palabra con mayúscula que no sea ya una persona conocida.
  Funciona bien con "Quiero agregar a mi sobrina **Fernanda**...", pero
  puede fallar con frases atípicas — una razón más por la que el paso de
  confirmación siempre muestra el nombre detectado antes de guardar nada.
- El Intent Engine prioriza patrones de negación ("ya no quiero que...")
  sobre los de autorización cuando ambos aparecen en la misma frase (son
  substrings el uno del otro en español); esto cubre los casos probados
  pero no es NLU real — frases suficientemente raras pueden clasificarse
  distinto de lo esperado. Como siempre, nada se ejecuta sin que el adulto
  mayor vea y confirme la interpretación primero.
- Sin autenticación ni control de acceso real: la separación "el familiar
  no puede hacer X" es una decisión de qué muestra la interfaz, no una
  regla que el backend haga cumplir por rol — cualquiera que llame a la
  API directamente podría, por ejemplo, activar Continuidad. Igual que la
  ausencia general de login, es una simplificación consciente para el
  prototipo.
- El motor de respaldo del frontend (`localEngine.js`) duplica a mano la
  lógica de Python, incluyendo los 5 escenarios y el Intent Engine
  completo; en producción esa duplicación no debería existir — es una
  decisión explícita solo para blindar la demo ante fallas de red. Los dos
  se probaron por separado y producen las mismas decisiones para los casos
  de la sección 12, pero pueden divergir en frases no probadas.
- "Reiniciar escenario" reinicia los 5 escenarios de demo a su estado
  original; un escenario de "empezar desde cero" no se puede reiniciar
  (no tiene un estado original al que volver) — simplemente se abandona y
  se crea uno nuevo.

## 17. Qué podría hacerse en producción

- Sustituir el mock de Nessie por la API real y mover `behavior_profiles` a
  una tabla que se actualiza de forma incremental (o a un job de ML real
  con pandas/scikit-learn, como sugiere el brief original).
- Reemplazar el Intent Engine y el Mission Compiler por un LLM con function
  calling, sin tocar el Decision Engine ni el flujo de confirmación del
  adulto mayor -- la interfaz entre "interpretar" y "ejecutar" ya está
  separada exactamente para permitir este cambio sin tocar nada más.
- Añadir autenticación real, control de acceso por rol (para que "el
  familiar no puede activar continuidad" sea una regla del backend, no
  solo de la interfaz), y multi-cuenta.
- Notificaciones push/SMS cuando una transacción cae en `REVIEW`/`BLOCKED`,
  o cuando hay una solicitud de excepción o un cambio de permisos pendiente.
- Mover SQLite a Postgres y el esquema plano a migraciones versionadas.

## CHANGELOG (v1 → v2)

- Landing con "Explorar demos" / "Empezar desde cero"; 5 escenarios
  precargados (María, Carlos, Elena, Roberto, Patricia) definidos como
  datos en `scenarios.py`, no como código por persona.
- El Mission Compiler se movió del Modo Familiar al Modo Adulto Mayor
  (más tarde ampliado al Intent Engine general, ver v3) — el familiar ya
  no puede crear ni editar su propia misión.
- Nuevo flujo de excepciones: el familiar pide, el adulto mayor aprueba o
  rechaza (`exceptions.py`, `ElderApprovals.jsx`).
- Nuevo `per_transaction_limit` en las misiones (tope por pago individual,
  además del límite mensual).
- El Decision Engine ahora revisa la vigencia de la misión (auto-expira) y
  detecta patrones de escalamiento, además de anomalías y boundary-seeking.
- "Cambiar demo" / "Reiniciar escenario" / "Inicio" en ambos modos — nunca
  hace falta reiniciar el backend para cambiar de escenario.

## CHANGELOG (v2 → v3)

- **Corregido**: el panel de Continuidad del familiar se quedaba en
  "Cargando…" para siempre en cualquier escenario sin un plan configurado
  (Carlos, Roberto, Patricia). Causa: el frontend usaba `null` tanto para
  "todavía no cargó" como para "ya cargó y no hay nada" y no podía
  distinguirlos. `GET /api/continuity/{user_id}` ahora también devuelve un
  `status` calculado (`no_configurado` / `configurado` / `activo` /
  `expirado`).
- **Corregido**: `GET /api/audit` usaba un INNER JOIN con `transactions`,
  así que cualquier fila de auditoría sin transacción asociada (todo lo que
  ahora escribe el Intent Engine) desaparecía en silencio. Ahora es un LEFT
  JOIN, con un campo `kind` (`transaction` | `account_change`) para que el
  frontend sepa cómo mostrar cada fila.
- **Nuevo: Intent Engine** (`backend/app/engines/intent_engine.py` +
  `routers/intent.py`, con gemelo en `frontend/src/data/localEngine.js`) --
  clasifica lenguaje natural en 12 intents (CREATE_MISSION,
  MODIFY_MISSION, REVOKE_PERMISSION, GRANT_PERMISSION, MODIFY_LIMIT,
  MODIFY_DURATION, ADD_TRUSTED_PERSON, REMOVE_TRUSTED_PERSON,
  ENABLE_CONTINUITY, MODIFY_CONTINUITY, DISABLE_CONTINUITY,
  GENERAL_FINANCIAL_QUESTION) y siempre exige confirmación antes de
  ejecutar. Reutiliza el Mission Compiler existente para los casos de
  misión, sin duplicar su lógica de categorías/duración/límite.
- La caja "¿Necesitas ayuda con tu dinero?" del Modo Adulto Mayor se
  convirtió en "¿Quieres cambiar algo?" (`ElderIntentBox.jsx`) -- una sola
  entrada para todo, en vez de una pantalla por acción.
- **Nuevo**: `DELETE /api/trust-network/{id}` -- quitar a alguien de la red
  de confianza también termina, de inmediato, cualquier misión activa que
  tuviera.
- La Red de Confianza y la Continuidad se movieron por completo al control
  del adulto mayor: nuevas pantallas `ElderPeople.jsx` (agregar/quitar) y
  `ElderContinuity.jsx` (configurar/activar/desactivar). El lado familiar
  (`TrustNetwork.jsx`, `ContinuityPanel.jsx`) ahora es de solo lectura --
  ya no tiene botones para agregarse permisos ni activar nada.
- Corregido de paso: `activate_continuity` no estaba escribiendo las filas
  de `permissions` para las acciones no delegables en la misión que crea,
  así que esa misión mostraba "No permitido: (nada)" aunque el Decision
  Engine sí la bloqueaba correctamente por otra vía. Ahora usa el mismo
  `create_mission()` que todo lo demás.
- A Carlos (backup de María) se le cambió la relación de "sobrino" a
  "hijo" para que el ejemplo de revocación del brief funcione tal cual con
  el escenario precargado.
