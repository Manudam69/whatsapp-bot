# WhatsApp Operations Bot

Backend en Node.js + Express + TypeORM + PostgreSQL para operar un bot de WhatsApp enfocado en flujos fijos, reportes de incidencia y notificaciones programadas.

## Decision tecnica de WhatsApp

Para este caso la opcion practica es Baileys sobre WhatsApp Multi-Device.

- La API oficial de WhatsApp Business es estable para conversaciones empresariales, pero no resuelve bien la operacion centrada en grupos grandes y multiples grupos internos.
- Cuando el requerimiento principal es publicar mensajes en mas de 100 grupos, sincronizar esos grupos y operar como un asistente operativo interno, Baileys ofrece mejor cobertura funcional.
- El costo de esta decision es operativo: manejo cuidadoso de la sesion, monitoreo, reintentos, throttling y disciplina para evitar bloqueos.

Si despues necesitas una capa mas robusta o compliance formal, este backend puede conservar la misma API y cambiar el proveedor de WhatsApp detras del servicio.

## Modulos implementados

### 1. Reportes por WhatsApp

- Cuando entra un mensaje directo al bot, responde con el texto fijo y empieza la captura guiada.

  `GENERACION DE REPORTE`

- El flujo ahora pide un dato a la vez y confirma cada etapa.
- Secuencia fija:
  - Servicio
  - Fecha
  - Hora
  - Incidencia
  - Confirmacion final con `SI` o `NO`
- `CANCELAR` reinicia la captura.
- El reporte se guarda en PostgreSQL con folio, remitente, nombre, fecha de recepcion y estado.
- Si `OPERATIONS_GROUP_JID` esta configurado, el reporte se reenvia al grupo operativo.

### 2. Atencion sistematica

- No hay IA conversacional.
- No hay respuestas libres.
- El flujo esta definido por estado:
  - Inicio de captura.
  - Solicitud de servicio.
  - Solicitud de fecha.
  - Solicitud de hora.
  - Solicitud de incidencia.
  - Confirmacion final.

### 3. Notificaciones programadas

- Programaciones almacenadas en PostgreSQL.
- Permiten texto, imagen o texto + imagen.
- Configuracion por dias de semana, horarios, grupos destino, reintentos, throttle y activacion.
- Historial de envios con exito o error por grupo.
- Cola persistente de salida para no perder envios si WhatsApp se desconecta temporalmente.

### 4. Multimedia reutilizable

- Carga de imagenes por API.
- Catalogo reutilizable por nombre y categoria.
- Referencia directa desde las programaciones.

## Estructura

Se sigue el layout general:

```text
src/
  config/
  controllers/
  database/
  entities/
  middlewares/
  routes/
  services/
  utils/
  main.ts
```

Las rutas HTTP se registran por archivos desde `src/routes`, igual que en la referencia.

## Variables de entorno

Usa `.env.example` como base.

Variables relevantes:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_SYNCHRONIZE=true` para desarrollo rapido
- `OPERATIONS_GROUP_JID` grupo donde se publican reportes
- `SCHEDULE_TIME_ZONE` zona horaria para programaciones
- `MESSAGE_THROTTLE_MS` espera entre envios masivos
- `MAX_SEND_RETRIES` reintentos por envio

## Tablas de base de datos

Las tablas actuales se generan a partir de las entidades de TypeORM y cubren la operacion principal del bot.

### `client_contacts`

Guarda a cada remitente que escribe al bot por mensaje directo.

Uso:

- Identificar al cliente por numero y JID de WhatsApp.
- Guardar nombre de contacto si WhatsApp lo entrega.
- Recordar en que paso del flujo va el usuario.
- Mantener el borrador del reporte mientras se captura paso por paso.
- Registrar ultima actividad y ultimo reporte enviado.

Campos funcionales principales:

- `phone_number`: numero del cliente.
- `whatsapp_jid`: identificador interno de WhatsApp.
- `contact_name`: nombre visible del contacto.
- `current_flow`: estado actual de la captura.
- `draft_service_name`, `draft_incident_date`, `draft_incident_time`, `draft_incident_text`: borrador temporal del reporte.

### `inbound_messages`

Bitacora de mensajes entrantes recibidos por el bot.

Uso:

- Auditar exactamente que escribio cada remitente.
- Tener trazabilidad del flujo de captura.
- Guardar payload crudo por si luego necesitas depurar incidencias o reconstruir conversaciones operativas.

Campos funcionales principales:

- `contact_id`: relacion con el remitente.
- `external_message_id`: id del mensaje en WhatsApp.
- `from_jid`: origen del mensaje.
- `body`: contenido textual recibido.
- `raw_payload`: mensaje original almacenado como JSON.

### `incident_reports`

Tabla principal de reportes de incidencia ya capturados y confirmados.

Uso:

- Guardar el reporte formal con folio.
- Conservar servicio, fecha, hora e incidencia.
- Registrar si el reporte ya fue reenviado al grupo operativo o si fallo.
- Tener historial consultable desde API o panel administrativo futuro.

Campos funcionales principales:

- `folio`: identificador operativo del reporte.
- `contact_id`: cliente que genero el reporte.
- `service_name`, `incident_date`, `incident_time`, `incident_text`: datos operativos del reporte.
- `status`: `RECEIVED`, `QUEUED`, `FORWARDED` o `FAILED`.
- `received_at`, `forwarded_at`: fechas clave del proceso.
- `forwarded_group_jid`, `forwarded_group_name`: destino operativo.

### `whatsapp_groups`

Catalogo de grupos de WhatsApp sincronizados desde la sesion activa.

Uso:

- Mostrar grupos disponibles en administracion.
- Seleccionar grupos destino para programaciones.
- Guardar nombre y cantidad aproximada de participantes.
- Relacionar reportes y envios con nombres de grupo mas legibles.

Campos funcionales principales:

- `jid`: identificador del grupo en WhatsApp.
- `name`: nombre visible del grupo.
- `participant_count`: referencia operativa de participantes.
- `is_active`: bandera para control interno.
- `last_synced_at`: ultima sincronizacion.

### `media_assets`

Repositorio de imagenes precargadas para envios programados.

Uso:

- Subir imagenes una sola vez.
- Clasificarlas por nombre y categoria.
- Reutilizarlas en multiples programaciones.
- Evitar volver a cargar el mismo recurso para cada envio.

Campos funcionales principales:

- `name`: nombre operativo del recurso.
- `category`: clasificacion interna.
- `file_name`, `file_path`: archivo almacenado.
- `mime_type`: tipo del archivo.
- `public_url`: ruta publica interna para consulta.
- `is_active`: disponibilidad del recurso.

### `notification_schedules`

Programaciones de mensajes automaticos a grupos.

Uso:

- Definir textos, imagenes o ambos.
- Configurar dias de la semana y horarios.
- Seleccionar multiples grupos destino.
- Activar o desactivar programaciones sin eliminarlas.
- Controlar reintentos y tiempo entre envios.

Campos funcionales principales:

- `name`: nombre de la programacion.
- `message_text`: texto del mensaje.
- `days_of_week`: dias configurados.
- `times`: horarios configurados.
- `group_jids`: grupos destino.
- `is_active`: activacion de la programacion.
- `retry_limit`, `throttle_ms`: control operativo de envio.
- `media_asset_id`: imagen asociada opcional.
- `last_execution_key`: evita doble ejecucion en la misma ventana.

### `notification_dispatches`

Historial de ejecucion de los envios programados.

Uso:

- Saber que mensajes se enviaron, a que grupo y cuando.
- Registrar cuantos intentos se hicieron.
- Guardar errores de envio para monitoreo.
- Facilitar auditoria y futura pantalla de historial en Angular.

Campos funcionales principales:

- `schedule_id`: programacion origen.
- `group_jid`, `group_name`: destino ejecutado.
- `status`: `PENDING`, `SENT` o `FAILED`.
- `attempts`: cantidad de intentos.
- `executed_at`: fecha de ejecucion.
- `error_message`: detalle de fallo si existio.

### `outbound_messages`

Cola persistente de mensajes salientes para soportar reconexion y reintentos.

Uso:

- Guardar cada salida antes de enviarla por WhatsApp.
- Reintentar automaticamente cuando hay fallos temporales.
- Reprocesar pendientes al reconectar la sesion.
- Evitar perder reportes y programaciones por desconexiones breves.

Campos funcionales principales:

- `recipient_jid`: destino del mensaje.
- `message_type`: texto o imagen.
- `status`: `PENDING`, `SENT` o `FAILED`.
- `attempts`, `max_attempts`, `retry_delay_ms`: control de reintentos.
- `source_type`, `source_id`: origen operativo del envio.
- `sent_at`, `error_message`: resultado final del intento.

## Relacion funcional entre tablas

- Un registro en `client_contacts` puede tener muchos `inbound_messages`.
- Un `client_contact` puede generar muchos `incident_reports`.
- Un `media_asset` puede ser reutilizado por muchas `notification_schedules`.
- Una `notification_schedule` puede generar muchos `notification_dispatches`.
- `whatsapp_groups` funciona como catalogo operativo para programaciones y trazabilidad de envios.

## Endpoints principales

### Salud

- `GET /api/healthcheck`

### WhatsApp

- `GET /api/whatsapp/session`: estado actual de la sesion.
- `POST /api/whatsapp/session`: inicia o intenta iniciar la sesion actual.
- `DELETE /api/whatsapp/session`: desconecta la sesion activa sin borrar credenciales.
- `POST /api/whatsapp/session/reset`: desconecta, limpia `auth` y genera una nueva vinculacion para cambiar de numero.

- `GET /api/whatsapp/session`
- `POST /api/whatsapp/session`
- `DELETE /api/whatsapp/session`
- `GET /api/whatsapp/groups`
- `POST /api/whatsapp/groups`

### Reportes

- `GET /api/reports`
- `GET /api/reports/:id`

### Multimedia

- `GET /api/media-assets`
- `POST /api/media-assets` con `multipart/form-data` y campo `file`
- `PATCH /api/media-assets/:id`

### Programaciones

- `GET /api/schedules`
- `POST /api/schedules`
- `PATCH /api/schedules/:id`
- `GET /api/schedules/history`

## Ejemplo de payload para programacion

```json
{
  "name": "Consigna matutina",
  "messageText": "RECORDATORIO DE BITACORA Y UNIFORME",
  "daysOfWeek": [1, 2, 3, 4, 5, 6],
  "times": ["07:00"],
  "groupJids": ["1203630xxxxxxxx@g.us"],
  "isActive": true,
  "retryLimit": 3,
  "throttleMs": 1500,
  "mediaAssetId": null
}
```

## Instalacion

```bash
npm install
cp .env.example .env
```

Configura PostgreSQL y despues ejecuta:

```bash
npm run dev
```

## Variables de entorno

Obligatorias para arrancar el servidor:

- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `DEFAULT_ADMIN_NAME`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

Opcionales con valor por defecto:

- `ENV`
- `APP_NAME`
- `PORT`
- `FRONTEND_URL`
- `ALLOW_ORIGINS`
- `DB_HOST`
- `DB_PORT`
- `DB_SYNCHRONIZE`
- `OPERATIONS_GROUP_JID`
- `DEFAULT_COUNTRY_CODE`
- `SCHEDULE_TIME_ZONE`
- `MESSAGE_THROTTLE_MS`
- `MAX_SEND_RETRIES`
- `SESSION_AUTH_DIR`
- `MEDIA_UPLOAD_DIR`
- `JWT_EXPIRES_IN`

Si falta una obligatoria o una numérica tiene un valor inválido, el servidor aborta el arranque con un error de configuración.

## Sistema anti-ban

El bot implementa un middleware anti-ban propio (`src/services/antiban.service.ts`) que protege el numero de WhatsApp conectado simulando patrones humanos de mensajeria.

### Como funciona

Cada mensaje saliente pasa por tres capas antes de enviarse:

1. **Rate limiter con jitter gaussiano**: los delays entre mensajes se distribuyen alrededor del punto medio del rango configurado en lugar de ser uniformes, imitando el comportamiento humano. Hay un `burstAllowance` para los primeros mensajes (igual que un humano que escribe rapido al principio) y una penalizacion extra para chats nuevos (`newChatDelayMs`).

2. **Warm-up gradual**: si el numero es nuevo o estuvo inactivo mas de 72 horas, entra en un periodo de calentamiento de 7 dias donde el limite diario crece progresivamente:

   | Dia | Limite |
   |-----|--------|
   | 1   | 20     |
   | 2   | 36     |
   | 3   | 65     |
   | 4   | 117    |
   | 5   | 210    |
   | 6   | 378    |
   | 7+  | Sin limite de warm-up |

   El estado de warm-up se persiste en `data/antiban-warmup.json` para sobrevivir reinicios del servidor.

3. **Monitor de salud**: registra señales de riesgo de baneo — desconexiones frecuentes, errores 403/401, mensajes fallidos — y calcula un score de 0 a 100:

   | Nivel    | Score   | Accion automatica                         |
   |----------|---------|-------------------------------------------|
   | Bajo     | 0–29    | Operacion normal                          |
   | Medio    | 30–59   | Advertencia en logs                       |
   | Alto     | 60–84   | **Auto-pausa** de todos los envios        |
   | Critico  | 85–100  | Pausa + log de alerta urgente             |

   Cuando el riesgo baja de nivel, el score decae naturalmente para evitar falsos positivos permanentes.

### Integracion en el flujo de envio

El metodo `deliver()` del servicio de mensajes salientes consulta al antiban **antes de cada intento**:

- Si `allowed: false` → el mensaje queda como `PENDING` y se reintenta en el siguiente ciclo de flush.
- Si `allowed: true` → espera el `delayMs` recomendado (que incluye jitter + typing simulation) y luego envia.
- Despues de cada envio exitoso llama a `afterSend()` para actualizar los contadores internos.
- Despues de cada fallo llama a `afterSendFailed(errorMessage)` para que el monitor de salud evalue si el error indica riesgo de baneo.

Los eventos de conexion/desconexion de Baileys tambien se reportan al antiban (`onDisconnect` / `onReconnect`).

### Endpoints del panel

- `GET /api/session/antiban` — retorna el estado actual del antiban (riesgo, score, contadores, warm-up).
- `POST /api/session/antiban` con `{ "action": "pause" }` — pausa manualmente todos los envios.
- `POST /api/session/antiban` con `{ "action": "resume" }` — reanuda los envios.

### Panel de salud en la UI

El dashboard del panel administrativo tiene un tab **"Proteccion anti-ban"** que muestra:

- Nivel de riesgo actual con barra de score
- Botón para pausar/reanudar manualmente
- Contadores de mensajes (hoy, esta hora, este minuto) vs limites
- Estado del warm-up con barra de progreso diaria

### Configuracion actual

Los parametros configurados en el singleton `antibanService` estan en `src/services/antiban.service.ts` al final del archivo. Puedes ajustarlos sin cambiar la logica interna.

## Notas operativas

- La primera vinculacion de WhatsApp requiere escanear el QR que Baileys imprime en consola.
- La sesion se guarda en `./auth`.
- Las imagenes se guardan en `./uploads/media`.
- El estado del warm-up anti-ban se guarda en `./data/antiban-warmup.json` — no borrar entre reinicios.
- Para produccion conviene reemplazar `DB_SYNCHRONIZE=true` por migraciones formales.
- Para operar en muchos grupos, mantén el `MESSAGE_THROTTLE_MS` y monitorea el historial de fallos.
- Revisa regularmente el tab "Proteccion anti-ban" en el dashboard. Si el nivel llega a "Alto" el bot se pausa automaticamente hasta que lo reanudes manualmente.