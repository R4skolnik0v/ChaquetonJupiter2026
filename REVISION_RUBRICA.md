**Revisión de Júpiter frente a la rúbrica del hackathon**

Revisión: 13 de septiembre de 2026. Base: README, código de backend y frontend, imágenes de `rubricas/`, pruebas aisladas de los motores y comparación breve con fuentes oficiales de productos existentes. No se modificó la aplicación ni la base de datos del proyecto.

**Veredicto: cumple parcialmente.** Hay una propuesta de producto clara, una persona concreta y lógica funcional para una demostración. Las mayores carencias están en la sustentación comercial y en que varias garantías del README no coinciden con el código actual. No asigno una nota numérica: la tabla da pesos, pero no niveles de desempeño, y no hemos observado la presentación ni una prueba completa en navegador.

**Evaluación de los 14 criterios**

| Categoría | Criterio y peso | Estado | Evidencia y pendiente |
|---|---|---|---|
| Originalidad, 30% | Diferenciación competitiva sustentada, 10% | Parcial | El encargo por persona, propósito, monto y vigencia es un enfoque presentable. El README no incluye una comparación que demuestre ventaja frente a productos existentes. |
| Originalidad | Identificación de oportunidad desatendida, 10% | Parcial | Se plantea recibir apoyo conservando autonomía. Faltan entrevistas o evidencia de que las alternativas actuales no resuelven bien esa necesidad para el segmento elegido. |
| Originalidad | Solución no trivial, 10% | Bien encaminado | Combina misiones, permisos, historial, anomalías, explicaciones y excepciones. Hay lógica detrás del flujo. |
| Profundidad técnica, 25% | Base de datos/datos de partida, 6% | Parcial | Datos estructurados, cinco escenarios e historial por categoría. Son datos sintéticos; Nessie está simulado y no se demostró una fuente bancaria en tiempo real. |
| Profundidad técnica | Lógica algorítmica/inteligencia, 9% | Parcial | Hay comprobación de categorías, límites y fechas, detección por comparación con el promedio, proximidad a límites y montos crecientes. Falta medir aciertos y falsas alertas. Existe integración opcional con Gemini, sin validar aquí una llamada real. |
| Profundidad técnica | Diseño del sistema, 5% | Parcial | Interpretación y ejecución separadas, motores diferenciados y bitácora. Faltan controles efectivos de identidad, titularidad y estado de misión; el respaldo local puede discrepar del servidor. |
| Profundidad técnica | Calidad y demo funcional, 5% | Parcial | Tres decisiones del caso María comprobadas con datos aislados. Existen fallos en flujos adicionales. No se ejecutó build ni demo completa en navegador. |
| Impacto y factibilidad, 25% | Modelo de negocio sustentado, 10% | Sin evidencia suficiente | No encontré comprador definido, precio, costos ni validación de disposición a pagar. La propuesta de vender a bancos del pitch es nueva y debe validarse. |
| Impacto y factibilidad | TAM/SAM/SOM, 5% | Sin evidencia suficiente | No están dimensionados el mercado total pertinente, el segmento atendible ni la captación inicial. Población mayor no equivale automáticamente a clientes. |
| Impacto y factibilidad | Factibilidad regulatoria y operativa, 5% | Parcial | Se reconocen limitaciones del prototipo. Falta una ruta concreta de integración, protección de datos, consentimiento, operación de alertas y revisión de requisitos aplicables al mercado elegido. No es una solución bancaria lista para desplegar. |
| Impacto y factibilidad | Estrategia de adopción, 5% | Sin evidencia suficiente | No encontré canal, socio confirmado, piloto ni métricas de adopción. |
| Diseño y experiencia, 20% | Persona específica, 7% | Bien encaminado | María, 72 años, recuperación de cirugía y apoyo de su hija Laura. Es una persona de demo, sin evidencia de investigación con usuarios reales. |
| Diseño y experiencia | Mapa estructurado del recorrido, 7% | Parcial | El flujo permite expresar intención, revisar, confirmar, ejecutar y consultar. Falta documentar objetivos, fricciones y puntos de decisión; también probar accesibilidad con usuarios. |
| Diseño y experiencia | Pitch, 6% | Preparado; entrega pendiente | El archivo `PITCH_5_MINUTOS.md` propone historia, demo, diferencia, negocio, siguiente paso y cierre. La puntuación dependerá de la presentación. |

**Lo que sí defendería ante el jurado**

- Una necesidad específica: apoyo financiero cotidiano para una persona mayor que conserva capacidad de decidir.
- Un encargo delimitado: quién ayuda, qué puede pagar, cuánto y durante cuánto tiempo.
- La separación entre interpretar una petición y confirmar un cambio. Véanse [ElderIntentBox.jsx](frontend/src/components/elder/ElderIntentBox.jsx) y [intent.py](backend/app/routers/intent.py).
- La distinción entre una operación fuera de permisos y una operación permitida que resulta inusual. Véanse [decision_engine.py](backend/app/engines/decision_engine.py), [risk_engine.py](backend/app/engines/risk_engine.py) y [behavior_baseline.py](backend/app/engines/behavior_baseline.py).
- Explicaciones visibles y una bitácora, con interfaces diferentes para el titular y su familiar.

**Hallazgos que deben corregirse o limitar las promesas**

1. **Las prohibiciones universales del README ya no existen como tales.** `NON_DELEGABLE_ACTIONS` está vacío en [decision_engine.py](backend/app/engines/decision_engine.py), línea 39. Una prueba aislada confirmó que habilitar la categoría Transferencia puede producir una transferencia simulada aprobada. El caso María bloquea esa operación por quedar fuera de sus categorías autorizadas. Evitar «nadie puede autorizar una transferencia bajo ninguna circunstancia».
2. **La revocación no se hace cumplir en todas las rutas.** Quitar a Laura marca su misión como `ended_early`; una simulación que conserva el identificador anterior puede seguir aprobando pagos. [transactions.py](backend/app/routers/transactions.py), líneas 56–65, busca una misión explícita sin comprobar titular ni estado, y no pasa el estado al motor.
3. **Las excepciones no revalidan las restricciones relevantes.** En una base temporal se pudo solicitar una excepción de una categoría ajena sobre una misión revocada y aprobarla. [exceptions.py](backend/app/routers/exceptions.py), líneas 26–43 y 59–85. Además, la identidad del aprobador no se autentica. Por eso «solo el titular puede autorizar» describe hoy la intención del flujo, sin ser una garantía de acceso del servidor.
4. **El respaldo puede anunciar una transferencia inexistente.** [api.js](frontend/src/api.js), líneas 111–115, devuelve `APPROVED` y «Transferencia realizada» ante un fallo del servidor, sin registrar ni validar el movimiento. El respaldo se activa también ante errores de validación HTTP, no solo ante desconexión.
5. **Editar permisos puede fallar con el arranque documentado.** [ElderEditPermissions.jsx](frontend/src/components/elder/ElderEditPermissions.jsx) utiliza rutas relativas `/api/...`; [vite.config.js](frontend/vite.config.js) no configura un proxy al backend. Hallazgo por inspección de código, sin prueba en navegador.
6. **El README mezcla versiones.** Al principio describe Gemini y después afirma que no hay llamadas a un modelo. También conserva las garantías absolutas que el código ya no impone. Unificar qué existe, qué está simulado y qué queda pendiente.
7. **Gemini y el ejecutor usan formatos incompatibles para crear misiones.** [gemini_intent_service.py](backend/app/services/gemini_intent_service.py), líneas 157–168, entrega `target_person`, `amount_limit` y `duration_days`; [intent.py](backend/app/routers/intent.py), líneas 129–135, espera `delegate_name`, `purpose`, `days`, `suggested_limit` y `allowed_categories`. Una respuesta simulada conforme al esquema de Gemini provocó `KeyError: 'delegate_name'` al ejecutarse. No presentar esa integración como validada. Además, una prueba de cambio de límite pudo modificar una misión de María enviando el identificador de Carlos como usuario: falta comprobar la propiedad de la misión, además de autenticar a quien llama.

**Diferenciación: qué respalda la comparación**

| Alternativa | Capacidades declaradas por el proveedor | Consecuencia para el argumento |
|---|---|---|
| [True Link](https://www.truelinkfinancial.com/care-agency) | Controles de gasto para cuidadores, restricciones, alertas e historial. | Los límites y el apoyo de cuidadores no bastan para afirmar originalidad. |
| [EverSafe](https://www.eversafe.com/faqs/) | Monitoreo multicuenta, anomalías y personas de confianza cuyo acceso puede revocarse. | Las alertas familiares y la revocación también tienen precedentes. |
| [Greenlight](https://greenlight.com/financial-caregiving) | Monitoreo para personas mayores, cuidadores y tarjeta opcional con controles. | También existe una combinación de supervisión familiar y gasto controlado. |

Estas fuentes verifican características anunciadas; no prueban eficacia comparativa ni disponibilidad en México. Tampoco permiten afirmar que esos productos carecen de alguna función de Júpiter.

La diferencia que conviene demostrar es: **«Convertimos un encargo cotidiano en una autorización comprensible: quién, para qué, cuánto y hasta cuándo, con la persona mayor al centro del flujo».** Es el enfoque del prototipo; su superioridad comercial sigue pendiente de validación.

**Qué añadir para cubrir negocio y adopción**

Hipótesis propuesta: un banco ofrece Júpiter a clientes mayores que necesitan ayuda cotidiana y paga una licencia por familia activa. Validar comprador, precio, integración, soporte y costos de operación; no presentarlo como convenio o ingreso conseguido.

Para México, INEGI reportó que en 2023 las personas de 60 años o más representaban el 14.7% de la población. Es contexto demográfico fechado, no una estimación de clientes. [ENADID 2023, página 2](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2024/ENADID/ENADID2023.pdf).

- **TAM:** familias con una persona mayor bancarizada que necesita este tipo de apoyo, dentro de una geografía definida. Estimar el segmento con fuentes y supuestos; no multiplicar porcentajes de encuestas incompatibles.
- **SAM:** parte de ese segmento que podría atenderse con las instituciones e integraciones disponibles.
- **SOM:** familias que podrían captarse y atenderse en un plazo concreto, dadas las capacidades del canal y soporte. Un objetivo de piloto no equivale a una estimación del SOM.
- Si se expresa el mercado en ingresos, usar la misma unidad —familias activas— y un precio anual justificado.

Siguiente paso propuesto: probar el prototipo con 20 familias durante cuatro semanas, con datos simulados mientras se corrigen los controles. Medir comprensión de permisos, finalización de tareas sin asistencia, tiempo necesario y falsas alertas. Es una propuesta, no un piloto realizado ni evidencia de demanda.

Recorrido para una diapositiva: **María necesita ayuda → elige a Laura → define tarea, monto y duración → revisa y confirma → Laura intenta un pago → ve la decisión y su explicación → María consulta o cambia el encargo.** Añadir debajo de cada paso la duda del usuario y cómo la pantalla la resuelve.

**Encaje con los tracks**

Según [tracks.jpeg](rubricas/tracks.jpeg), el track 3, detección de anomalías y seguridad, parece el encaje más directo para las funciones comprobadas. La autonomía financiera del adulto mayor sería el beneficio central. El track 1 también tiene afinidad por autonomía, aunque el prototipo no demuestra los ejemplos de ahorro o construcción de crédito de esa diapositiva. La imagen presenta Nessie como recurso; no demuestra que su uso sea obligatorio. Sí queda pendiente el componente de datos bancarios en tiempo real del planteamiento general.

**Verificación realizada y límites**

Se revisó el código y se ejecutaron decisiones con Node en memoria y funciones de rutas Python sobre SQLite temporal. En María se verificaron CFE $183 aprobado, Transferencia $5,000 bloqueada y CFE $1,420 para revisión. También se reprodujeron los problemas de revocación, permisos, propiedad de misión, excepciones y formato de propuesta descritos arriba. El preset Farmacia $420, etiquetado «normal», produce revisión por montos crecientes: no usarlo como ejemplo de aprobación.

No se instalaron dependencias. `frontend/node_modules` no estaba disponible, por lo que no se verificó el build. No se inspeccionó la interfaz en navegador ni se validó una llamada real a Gemini, una conexión bancaria o accesibilidad con usuarios. Los resultados prueban esas rutas lógicas, no una garantía general de seguridad ni una demo completa.
