# ARCHITECTURE.md — Consumer Microservice (Worker)

**Proyecto:** Gestión de Quejas ISP — Microservicio Consumer  
**Fecha:** 1 de marzo de 2026  
**Analizado por:** Antigravity (AI Coding Assistant)

---

## 1. Resumen Ejecutivo

El **Consumer** es un componente de tipo *Worker* encargado de procesar las quejas encoladas en RabbitMQ por el microservicio Producer. Su función principal es aplicar reglas de negocio para determinar la prioridad y el estado inicial de cada incidente, persistir la información en la base de datos PostgreSQL compartida y gestionar el ciclo de vida de los mensajes (ack/nack).

---

## 2. Responsabilidades y Flujo de Datos

El Consumer opera de forma asíncrona, desacoplando la recepción de quejas de su procesamiento persistente y análisis.

### 2.1 Flujo de Procesamiento
1.  **Consumo**: Escucha activamente la cola `complaints.queue` en RabbitMQ.
2.  **Validación**: Deserializa el JSON y valida la estructura y el tipo de incidente (`IncidentType`).
3.  **Análisis de Negocio (Processor)**:
    *   Determina la **Prioridad** (`HIGH`, `MEDIUM`, `LOW`, `PENDING`) basándose en el tipo de incidente.
    *   Asigna el **Estado** inicial (`RECEIVED` o `IN_PROGRESS`) según la prioridad calculada.
4.  **Persistencia**: Guarda o actualiza el registro en la tabla `tickets` de PostgreSQL usando el patrón *Repository*.
5.  **Confirmación**:
    *   Si el procesamiento es exitoso, envía un `acknowledgment` (`ack`) a RabbitMQ.
    *   Si hay errores estructurales (mensaje inválido), envía un `negative acknowledgment` (`nack`) sin reencolar (va a Dead Letter Queue - DLQ).
    *   Si hay errores transitorios (ej. DB caída), reencola el mensaje hasta un máximo de **3 reintentos**.

---

## 3. Patrones de Diseño Aplicados

| Patrón | Implementación | Propósito |
| :--- | :--- | :--- |
| **Strategy** | `PriorityResolver` | Permite cambiar la lógica de asignación de prioridad por tipo de incidente sin modificar el procesador principal. |
| **Repository** | `PostgresIncidentRepository` | Abstrae la lógica de persistencia en PostgreSQL, permitiendo cambiar la fuente de datos (ej. a In-Memory para tests). |
| **Singleton** | `RabbitMQConnectionManager` | Gestiona una única conexión compartida a RabbitMQ en todo el proceso. |
| **Circuit Breaker / Retries** | `ExponentialBackoff` | Gestiona la reconexión a RabbitMQ y DB con esperas exponenciales para evitar saturar servicios en recuperación. |

---

## 4. Estructura de Proyecto

```
src/
├── messaging/           # Gestión de RabbitMQ y MessageHandler core logic.
├── repository/          # Persistencia en PostgreSQL.
├── strategies/          # Implementaciones de lógica de prioridad.
├── lifecycle/           # Health-checks y apagado gracioso (graceful shutdown).
├── utils/               # Logger, métricas, conexión DB y backoff.
└── processor.ts         # Orquestador de la lógica de negocio.
```

---

## 5. Observabilidad y Resiliencia

### 5.1 Health Check (§5.2)
El servicio expone un servidor HTTP interno (usualmente en el puerto definido por ENV) que retorna un snapshot de métricas operacionales:
*   Mensajes procesados exitosamente.
*   Mensajes rechazados (DLQ).
*   Mensajes reintentados.
*   Uptime del proceso.

### 5.2 Manejo de Errores y DLQ
*   **Max Retries**: 3 intentos.
*   **Dead Letter Queue**: Los mensajes que fallan tras los reintentos o que tienen formato inválido son descartados a una cola de errores para auditoría manual.

---

## 6. Configuración de Base de Datos

El Consumer es el responsable de **crear y actualizar** la tabla `tickets`. 
*   **Tabla**: `tickets`
*   **Campos Clave**: `ticket_id` (PK, UUID), `line_number`, `email`, `type`, `description`, `priority`, `status`, `created_at`, `processed_at`.

---
