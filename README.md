# Acompañamiento Financiero con IA segura

> “Que te ayuden con tu dinero no debería significar perder el control sobre él.”

Este proyecto es una prueba de concepto de producto para adultos mayores que necesitan apoyo financiero sin perder la autoridad sobre su dinero. La idea central no es delegar el control total, sino crear una capa de ayuda segura: el usuario define qué puede hacer otra persona, qué cantidades están permitidas y qué acciones jamás pueden realizarse.

La innovación más importante es la combinación de dos cosas:

- IA para interpretar lenguaje natural y convertirlo en una propuesta estructurada
- reglas deterministas para validar que esa propuesta sea segura y no pueda romper las restricciones del usuario

En otras palabras, la IA ayuda a entender la intención, pero no decide ni ejecuta el dinero por sí sola.

---

## Qué resolvemos

Muchos adultos mayores necesitan ayuda para pagar servicios, revisar movimientos o delegar tareas sencillas, pero la solución tradicional suele implicar:

- compartir contraseñas,
- dar acceso total a la cuenta,
- o abandonar el control del propio dinero.

Nuestra propuesta crea un punto intermedio: misiones financieras con permisos granulares, límites, personas autorizadas y un mecanismo de revisión humana.

El adulto mayor mantiene el control final. La familia o cuidador puede ayudar, pero nunca sustituye la decisión del titular de la cuenta.

---

## Lo que descubrimos

La parte más valiosa del proyecto no fue “dejar que la IA administre finanzas”, sino entender que la IA debe trabajar como asistente de interpretación y apoyo, nunca como autoridad financiera.

Lo que encontramos fue esto:

- La IA es útil para convertir frases naturales en propuestas estructuradas.
- Las decisiones financieras deben seguir reglas explicitas y no opcionales.
- Las transferencias, retiros, cambios de beneficiario y otras acciones sensibles deben estar bloqueadas por diseño.
- El adulto mayor siempre debe revisar y confirmar la propuesta antes de ejecutarse.
- El familiar puede solicitar excepciones, pero no autorizar decisiones críticas.

Esa idea define el producto completo: ayuda con IA, control humano y validación robusta.

---

## Funcionalidad principal

### 1. Misión financiera
El adulto mayor puede asignar una misión a una persona de confianza, por ejemplo:

- pagar servicios del hogar,
- comprar medicamento,
- cubrir gastos del mes,
- gestionar ciertos proveedores.

Cada misión incluye:

- persona delegada,
- categorías permitidas,
- límite mensual,
- límite por transacción,
- duración,
- acciones prohibidas por defecto.

### 2. Red de confianza
El usuario puede añadir o quitar personas de su red de confianza. Esa relación se usa para decidir quién puede ayudar y bajo qué condiciones.

### 3. Intent Engine
La caja de texto del adulto mayor permite describir cualquier cambio natural, por ejemplo:

- “quiero que mi hija pueda pagar la luz”
- “ya no quiero que mi hijo haga transferencias”
- “aumenta mi límite mensual para farmacia”
- “quiero activar mi plan de continuidad”

La intención se interpreta y se devuelve como propuesta. La ejecución real solo ocurre tras confirmación.

### 4. Reglas duras del sistema
El sistema tiene reglas que nunca pueden ser ignoradas:

- transferencias no permitidas por misión,
- retiros no autorizados,
- cambios de beneficiario prohibidos,
- categorías no permitidas,
- misión vencida o fuera de rango,
- límite excedido.

Estas condiciones se evalúan determinísticamente y rigen por encima de señales de comportamiento.

### 5. Risk Engine y revisión humana
El sistema también analiza anomalías de gasto y patrones de comportamiento para marcar transacciones como REVIEW.

Esto permite detectar cambios inusuales sin convertir la IA en el árbitro final de la cuenta.

### 6. Excepciones
Cuando una transacción está bloqueada solo por un límite, la familia puede pedir una excepción. La decisión final de aprobarla o rechazarla la toma el adulto mayor.

---

## Integración con IA

El proyecto tiene una integración con Gemini en el backend, pero su rol es específico y restringido:

- interpreta texto libre del usuario,
- devuelve una propuesta estructurada,
- nunca ejecuta movimientos financieros,
- nunca supera las reglas duras del sistema.

El servicio se encuentra en [backend/app/services/gemini_intent_service.py](backend/app/services/gemini_intent_service.py).

Si no hay API key disponible, la app sigue funcionando con el flujo determinista local del motor de intención, sin romper la experiencia.

La intención de esta arquitectura es clara: la IA sirve para desacelerar la fricción, no para quitar la responsabilidad humana.

---

## Arquitectura del proyecto

### Frontend
La app web está construida con React + Vite y presenta dos experiencias principales:

- modo adulto mayor,
- modo familiar / ayudante.

Además tiene una landing con demos y un flujo de “empezar desde cero”.

Carpetas principales:

- [frontend/src/App.jsx](frontend/src/App.jsx)
- [frontend/src/api.js](frontend/src/api.js)
- [frontend/src/components](frontend/src/components)
- [frontend/src/data/localEngine.js](frontend/src/data/localEngine.js)

### Backend
El backend está hecho en FastAPI y usa SQLite sin ORM.

Principales componentes:

- [backend/app/main.py](backend/app/main.py)
- [backend/app/database.py](backend/app/database.py)
- [backend/app/scenarios.py](backend/app/scenarios.py)
- [backend/app/engines](backend/app/engines)
- [backend/app/routers](backend/app/routers)
- [backend/app/services/gemini_intent_service.py](backend/app/services/gemini_intent_service.py)

### Motores clave

- Mission Compiler: convierte la intención del usuario en una misión estructurada.
- Intent Engine: interpreta lenguaje natural y propone cambios.
- Risk Engine: analiza riesgo y anomalías.
- Decision Engine: resuelve si una transacción debe ser aprobada, revisada o bloqueada.

---

## Casos de demo

El proyecto ya incluye varios escenarios para mostrar distintas capacidades del producto:

- María: delegación segura
- Carlos: comportamiento anómalo
- Elena: continuidad financiera
- Roberto: límites de permisos
- Patricia: búsqueda del límite

También existe un flujo para crear un escenario desde cero con nombres propios.

---

## Cómo arrancarlo

### Backend
Desde la carpeta [backend](backend):

```bash
./run.sh
```

o con uvicorn directamente:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Frontend
Desde la carpeta [frontend](frontend):

```bash
npm install
npm run dev
```

Si se quiere usar Gemini, configura la variable de entorno:

```bash
export GEMINI_API_KEY=tu_api_key
```

---

## Resumen

Este proyecto demuestra una idea muy clara: la IA puede ayudar a entender lo que una persona quiere hacer con su dinero, pero la seguridad financiera no puede depender de la IA como decisor final.

Nuestra propuesta combina:

- lenguaje natural,
- decisiones humanas,
- reglas duras,
- auditoría clara,
- y una relación de confianza entre adulto mayor y familia.

Eso es lo que realmente descubrimos: no se trata de automatizar el dinero, sino de diseñar una experiencia de apoyo financiera segura, explicable y controlada por quien realmente tiene la cuenta.


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

## Checar branch de ReadMe si main no funciona 
