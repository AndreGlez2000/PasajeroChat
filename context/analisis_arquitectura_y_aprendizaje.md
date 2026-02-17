# Análisis de Arquitectura y Plan de Aprendizaje - PasajeroApp Bot

**Fecha de Creación:** 2026-02-17  
**Contexto:** Sesión de análisis técnico y planificación de implementación  
**Estudiante:** Junior Developer  
**Instructor:** Senior Software Engineer  

---

## 📊 PANORAMA GENERAL DEL PROYECTO

### Dos Proyectos en Paralelo

#### **PROYECTO 1: PasajeroApp Bot (PRIORIDAD ACTUAL)**
- **Objetivo:** Sistema "última vez visto" para transporte público en Tijuana
- **Rutas específicas:** Violeta, Suburbaja, SITT
- **Canal:** Facebook Messenger (flujo conversacional numérico)
- **Usuarios potenciales:** ~7,000
- **Funcionalidades MVP:**
  - Reportar avistamientos de transporte
  - Consultar "última vez visto" de una ruta
  - Sistema de confirmaciones comunitarias
- **Base de datos:** PostgreSQL normalizada

#### **PROYECTO 2: Transportation API (Existente - Referencia)**
- **Estado:** Ya implementado en Python/FastAPI (`main.py`)
- **Objetivo:** API REST para búsqueda de rutas de transporte
- **Datos:** 175 rutas con paradas, horarios, costos
- **Problema identificado:** BD desnormalizada (Excel → SQLite directo)
- **Uso futuro:** Referencia de aprendizaje, NO copiar código

---

## 🔍 ANÁLISIS TÉCNICO DE LA BASE DE DATOS ACTUAL

### Evidencias de Conversión Excel → SQLite

#### **1. Nombre de Tabla Genérico**
- Tabla: `tableName` (placeholder de herramienta de conversión automática)
- Indica: Importación rápida sin diseño de schema

#### **2. Todos los Campos son TEXT**
```
Calidad: TEXT (debería ser INTEGER)
KM: TEXT (debería ser DECIMAL)
Costo_local: TEXT (debería ser NUMERIC)
Tiempo_entre: TEXT (debería ser dos campos INT)
```

#### **3. Patrones de Excel**
- **Listas delimitadas:** `"Parada1 | Parada2 | Parada3"` en una celda
- **Formato de moneda:** `"$13.00"` como string
- **Rangos:** `"0:00 - 0:15"` requiere parsing complejo
- **Celdas vacías:** Convertidas a `''` en vez de `NULL`
- **Formato inconsistente:** `"4:30 am"` vs `"06:00"`

#### **4. Estructura Actual**
```sql
tableName (
    Ruta_ID TEXT,
    Tipo_Vehiculo TEXT,
    Color_vehiculo TEXT,
    Nombre_ruta TEXT,
    Paradas_ida TEXT,        -- ❌ Lista con pipes
    Paradas_vuelta TEXT,     -- ❌ Lista con pipes
    Tiempo_entre TEXT,       -- ❌ Rango como string
    Horario_inicio TEXT,
    Horario_fin TEXT,
    Base1 TEXT,
    Base2 TEXT,
    Costo_local TEXT,        -- ❌ Debería ser NUMERIC
    Costo_ruta TEXT,         -- ❌ Debería ser NUMERIC
    Costo_nocturno TEXT,     -- ❌ Debería ser NUMERIC
    Calidad TEXT,            -- ❌ Debería ser INTEGER
    KM TEXT,                 -- ❌ Debería ser DECIMAL
    Notas TEXT,
    Patrocinio TEXT,
    Anuncio TEXT
)
```

**Total de registros:** 175 rutas

---

## ❌ PROBLEMAS DE LA ARQUITECTURA ACTUAL

### **1. Violación de Normalización (1NF, 2NF, 3NF)**
- `Paradas_ida` y `Paradas_vuelta` son listas delimitadas (hasta 23 paradas)
- Imposible hacer queries eficientes: requiere `LIKE '%Plaza Sendero%'`
- Sin integridad referencial: paradas son strings libres con inconsistencias

### **2. Redundancia Sin Control**
- `Tipo_Vehiculo`: "Taxi" repetido 127 veces
- `Color_vehiculo`: 46 variaciones únicas repetidas
- Cambiar un nombre de color = actualizar N filas

### **3. Tipos de Datos Incorrectos**
- Todos TEXT → parsing en runtime (líneas 106-143 en main.py)
- Costos como strings con símbolo `$`
- Calidad numérica almacenada como texto

### **4. Sin Relaciones Entre Entidades**
- Paradas no son entidades independientes
- No se puede saber "qué paradas conectan con qué paradas"
- Búsqueda de transbordos requiere parsing de strings en tiempo real

---

## ✅ ARQUITECTURA PROPUESTA - NORMALIZADA

### **Schema PostgreSQL Recomendado**

```sql
-- ============================================
-- CATÁLOGOS (Tablas Maestras)
-- ============================================

CREATE TABLE tipos_vehiculo (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE colores_vehiculo (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE paradas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) UNIQUE NOT NULL,
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    zona VARCHAR(100)
);

-- ============================================
-- RUTAS ESTÁTICAS (del Excel actual)
-- ============================================

CREATE TABLE rutas (
    id SERIAL PRIMARY KEY,
    ruta_id VARCHAR(20) UNIQUE NOT NULL,
    nombre_ruta VARCHAR(300),
    tipo_vehiculo_id INT REFERENCES tipos_vehiculo(id),
    color_vehiculo_id INT REFERENCES colores_vehiculo(id),
    tiempo_entre_min INT,          -- Minutos (parseado de "0:15")
    tiempo_entre_max INT,          -- Minutos (parseado de "0:30")
    horario_inicio TIME,           -- Tipo TIME nativo
    horario_fin TIME,              -- Tipo TIME nativo
    costo_local DECIMAL(6,2),      -- Numérico sin símbolo $
    costo_ruta DECIMAL(6,2),
    costo_nocturno DECIMAL(6,2),
    calidad INT CHECK(calidad BETWEEN 1 AND 3),
    km_distancia DECIMAL(8,2),
    base1_url TEXT,
    base2_url TEXT,
    notas TEXT,
    patrocinio VARCHAR(50),
    anuncio VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- RELACIÓN RUTAS ↔ PARADAS (Secuencial)
-- ============================================

CREATE TABLE ruta_paradas (
    ruta_id INT REFERENCES rutas(id) ON DELETE CASCADE,
    parada_id INT REFERENCES paradas(id),
    direccion VARCHAR(10) CHECK(direccion IN ('ida', 'vuelta')),
    orden_secuencia INT NOT NULL,
    PRIMARY KEY(ruta_id, direccion, orden_secuencia)
);

CREATE INDEX idx_ruta_paradas_parada ON ruta_paradas(parada_id);
CREATE INDEX idx_paradas_nombre ON paradas(nombre);

-- ============================================
-- DATOS DINÁMICOS (Bot Messenger)
-- ============================================

CREATE TABLE route_variants (
    id SERIAL PRIMARY KEY,
    route_name VARCHAR(100) NOT NULL,     -- "Ruta Violeta"
    variant_name VARCHAR(100) NOT NULL,   -- "Centro → Presa"
    ruta_id INT REFERENCES rutas(id),     -- Link opcional con rutas estáticas
    UNIQUE(route_name, variant_name)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    facebook_psid VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP DEFAULT NOW(),
    report_count INT DEFAULT 0,
    is_blocked BOOLEAN DEFAULT FALSE
);

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    variant_id INT REFERENCES route_variants(id) ON DELETE CASCADE,
    stop_id INT REFERENCES paradas(id),
    user_id INT REFERENCES users(id),
    reported_at TIMESTAMP DEFAULT NOW(),
    confirm_count INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,              -- reported_at + 90 minutos
    CONSTRAINT fk_variant FOREIGN KEY (variant_id) REFERENCES route_variants(id),
    CONSTRAINT fk_stop FOREIGN KEY (stop_id) REFERENCES paradas(id),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE confirmations (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES reports(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id),
    confirmed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(report_id, user_id)         -- Un usuario no puede confirmar 2 veces
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX idx_reports_active ON reports(variant_id, is_active, reported_at DESC);
CREATE INDEX idx_reports_expires ON reports(expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_users_psid ON users(facebook_psid);
CREATE INDEX idx_confirmations_report ON confirmations(report_id);
```

---

## 🏗️ ARQUITECTURA COMPLETA DEL SISTEMA

```
┌─────────────────────────────────────────────────────┐
│         CAPA DE ENTRADA DE DATOS                     │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Google Sheets (Editable por administradores)        │
│  ├─ Hoja 1: Rutas estáticas (175 rutas actuales)   │
│  ├─ Hoja 2: Paradas normalizadas                    │
│  └─ Hoja 3: Configuración de variantes             │
│                                                       │
│          ↓ Google Sheets API / Webhook               │
│                                                       │
├─────────────────────────────────────────────────────┤
│         RAILWAY - ETL WORKER (Cron 10-15 min)       │
├─────────────────────────────────────────────────────┤
│  Script Python/Node:                                 │
│  • Lee Google Sheets                                 │
│  • Valida y normaliza datos                          │
│  • Parsea strings complejos (tiempo, costos)        │
│  • Hace UPSERT en PostgreSQL                         │
│  • Log de errores y cambios                          │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│         POSTGRESQL (Railway)                         │
├─────────────────────────────────────────────────────┤
│                                                       │
│  DATOS ESTÁTICOS:        DATOS DINÁMICOS:           │
│  ├─ tipos_vehiculo       ├─ route_variants          │
│  ├─ colores_vehiculo     ├─ reports                 │
│  ├─ rutas                ├─ users                   │
│  ├─ paradas              └─ confirmations           │
│  └─ ruta_paradas                                     │
│                                                       │
└─────────────────────────────────────────────────────┘
           ↓                           ↓
┌──────────────────────┐    ┌──────────────────────┐
│   FASTAPI (Python)   │    │  EXPRESS (Node.js)   │
│   Búsqueda de rutas  │    │  Webhook Messenger   │
│   (main.py - futuro) │    │  (BOT - PRIORIDAD)   │
└──────────────────────┘    └──────────────────────┘
           ↓                           ↓
┌──────────────────────┐    ┌──────────────────────┐
│  Web Pasajero.com    │    │  Facebook Messenger  │
│  (frontend futuro)   │    │  (usuarios finales)  │
└──────────────────────┘    └──────────────────────┘
```

---

## 📚 LECCIÓN: ¿QUÉ HACE UN BACKEND API?

### Análisis de `main.py` (FastAPI)

#### **Componente 1: Inicialización del Servidor**
```python
app = FastAPI(
    title="Tijuana Transportation Routes API",
    description="...",
    version="1.0.0"
)
app.add_middleware(CORSMiddleware, allow_origins=["*"])
```

**Función:**
- Crea aplicación que escucha peticiones HTTP
- Configura CORS para permitir acceso desde navegadores
- Define metadatos de la API

**Equivalente Express:**
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
```

---

#### **Componente 2: Conexión a Base de Datos**
```python
def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn
```

**Función:**
- Helper para obtener conexión a BD
- Configura formato de resultados (diccionario)
- Maneja errores de conexión

**Equivalente Express (PostgreSQL):**
```javascript
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
```

---

#### **Componente 3: Endpoints HTTP**

##### **GET / - Health Check**
```python
@app.get("/")
async def root():
    return {
        "message": "API activa",
        "status": "active",
        "version": "1.0.0"
    }
```

**Flujo:**
```
Cliente:     GET http://localhost:8000/
Servidor:    200 OK
             Content-Type: application/json
             Body: {"message": "API activa", ...}
```

##### **POST /search - Búsqueda Compleja**
```python
@app.post("/search", response_model=SearchResponse)
async def search_routes(request: RouteSearchRequest):
    # 1. Validar entrada (automático con Pydantic)
    # 2. Conectar a BD
    # 3. Construir query SQL dinámico
    # 4. Ejecutar query
    # 5. Procesar resultados (parsear, calcular puntos)
    # 6. Ordenar por relevancia
    # 7. Buscar transbordos si no hay directos
    # 8. Devolver JSON estructurado
```

**Flujo:**
```
Cliente:     POST http://localhost:8000/search
             Body: {"origen": "Centro", "destino": "Presa"}

Servidor:    
    1. Valida que tenga origen y destino
    2. Busca rutas que contengan ambos términos
    3. Calcula puntos (tiempo, calidad, tipo)
    4. Ordena resultados
    5. Si no hay → busca transbordos
    6. Responde: 200 OK + JSON con rutas
```

---

#### **Componente 4: Validación de Datos (Schemas)**
```python
class RouteSearchRequest(BaseModel):
    origen: str
    destino: str

class RouteInfo(BaseModel):
    route_id: str
    origin: str
    destination: str
    type: str
    color: str
    main_stops: List[str]
    # ... más campos
```

**Función:**
- Define contratos de datos (qué esperas recibir/enviar)
- Validación automática por FastAPI
- Si falta campo → error 422 Unprocessable Entity

**Equivalente Express (con Zod):**
```javascript
const { z } = require('zod');

const RouteSearchSchema = z.object({
  origen: z.string(),
  destino: z.string()
});

app.post('/search', (req, res) => {
  const validation = RouteSearchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  // ... continuar con búsqueda
});
```

---

## 🔄 COMPARACIÓN: FastAPI vs Express

| **Aspecto** | **FastAPI (Python)** | **Express (Node.js)** |
|-------------|---------------------|---------------------|
| **Crear servidor** | `app = FastAPI()` | `const app = express()` |
| **Ruta GET** | `@app.get("/path")` | `app.get("/path", (req, res) => {...})` |
| **Ruta POST** | `@app.post("/path")` | `app.post("/path", (req, res) => {...})` |
| **Validación** | Automática (Pydantic) | Manual o con `zod`, `joi` |
| **Async/Await** | `async def function()` | `async function()` |
| **Responder JSON** | `return {...}` (auto) | `res.json({...})` |
| **Middleware** | `app.add_middleware()` | `app.use()` |
| **CORS** | `CORSMiddleware` | `cors()` package |
| **Conexión BD** | `sqlite3`, `psycopg2` | `pg` (PostgreSQL) |
| **Variables entorno** | `os.getenv()` | `process.env` |
| **Docs API** | Auto-generadas `/docs` | Manual (Swagger) |

---

## 🎯 METODOLOGÍA SCRUM PARA ESTE PROYECTO

### **Sprint 0: Fundamentos (1-2 días)**
**Objetivo:** Diseño completo antes de codear

**Entregables:**
- [ ] Diagrama de arquitectura visual
- [ ] Modelo de datos (schema PostgreSQL normalizado)
- [ ] Diagrama de flujo conversacional del bot
- [ ] Product Backlog priorizado
- [ ] Decisiones técnicas documentadas

**Criterios de Aceptación:**
- Todos los diagramas están validados por el instructor
- El estudiante puede explicar cada decisión técnica
- No quedan dudas sobre el alcance del MVP

---

### **Sprint 1: Base de Datos y API Core (1 semana)**
**Objetivo:** PostgreSQL + Express funcionando localmente

**User Stories:**
1. Como desarrollador, quiero una BD PostgreSQL normalizada para almacenar reportes
2. Como desarrollador, quiero un servidor Express que responda a health checks
3. Como desarrollador, quiero endpoints para crear y consultar reportes

**Tareas Técnicas:**
- [ ] Instalar PostgreSQL localmente
- [ ] Ejecutar schema SQL (crear tablas)
- [ ] Proyecto Node.js con Express + TypeScript
- [ ] Endpoint `GET /health`
- [ ] Endpoint `POST /reports` (crear reporte)
- [ ] Endpoint `GET /reports/:variantId` (consultar últimos reportes)
- [ ] Middleware de validación con Zod
- [ ] Manejo de errores centralizado

**Definición de "Done":**
- Todos los endpoints responden correctamente
- Datos se guardan en PostgreSQL
- Tests manuales con Postman/curl funcionan
- Código en Git con commits descriptivos

---

### **Sprint 2: Webhook Messenger (1 semana)**
**Objetivo:** Bot responde en Messenger

**User Stories:**
1. Como usuario, quiero enviar un mensaje a la página y recibir el menú principal
2. Como usuario, quiero seleccionar opciones con números
3. Como desarrollador, quiero que Facebook pueda verificar mi webhook

**Tareas Técnicas:**
- [ ] Endpoint `GET /webhook` (verificación Facebook)
- [ ] Endpoint `POST /webhook` (recibir mensajes)
- [ ] Parsear eventos de Messenger
- [ ] Enviar respuestas a usuarios (Send API)
- [ ] Implementar máquina de estados (menú principal)
- [ ] Deploy a Railway con HTTPS
- [ ] Configurar Meta Developers App

**Definición de "Done":**
- Bot responde "Hola" cuando usuario envía mensaje
- Menú principal se muestra correctamente
- Configuración de webhook en Facebook exitosa

---

### **Sprint 3: Flujo Reportar (1 semana)**
**Objetivo:** Usuario puede reportar avistamiento completo

**User Stories:**
1. Como usuario, quiero seleccionar ruta (Violeta/SITT/Suburbaja)
2. Como usuario, quiero seleccionar variante (Centro→Presa)
3. Como usuario, quiero seleccionar parada donde vi la unidad
4. Como usuario, quiero recibir confirmación del reporte

**Tareas Técnicas:**
- [ ] Diseñar máquina de estados del flujo
- [ ] Implementar estado "seleccionar_ruta"
- [ ] Implementar estado "seleccionar_variante"
- [ ] Implementar estado "seleccionar_parada"
- [ ] Guardar reporte en BD
- [ ] Validaciones (usuario no puede reportar cada 5 min)
- [ ] Mensajes de error amigables

---

### **Sprint 4: Flujo Consultar (1 semana)**
**Objetivo:** Usuario puede ver "última vez visto"

**User Stories:**
1. Como usuario, quiero consultar una ruta y ver cuándo fue vista
2. Como usuario, quiero ver las últimas 5 ubicaciones reportadas
3. Como usuario, quiero ver cuántos usuarios confirmaron cada reporte

**Tareas Técnicas:**
- [ ] Query optimizado para últimos reportes
- [ ] Formato de respuesta legible ("hace 12 minutos en 5 y 10")
- [ ] Mostrar confirmaciones
- [ ] Expiración automática (reportes >90 min no se muestran)

---

## 🎓 EJERCICIOS PENDIENTES (ANTES DE SPRINT 0)

### **Ejercicio 1: Comprensión de Backend API**

**Pregunta A:**  
Si un usuario hace `POST /search` con `{"origen": "Centro", "destino": "Presa"}`:
1. ¿Qué hace el servidor primero?
2. ¿Cómo sabe qué datos buscar en la BD?
3. ¿Qué devuelve al usuario?

**Pregunta B:**  
En el bot de Messenger, necesitarás endpoints:
- `POST /webhook` - Recibir mensajes de Facebook
- `GET /webhook` - Verificar tu servidor con Facebook

¿Cuál es la diferencia entre un GET y un POST? ¿Qué tipo de datos llevan?

**Pregunta C:**  
Para el bot, necesitas guardar reportes. Conceptualmente:
- ¿Qué información necesitas guardar cuando un usuario reporta "Vi la Violeta en 5 y 10"?
- ¿Qué tablas necesitarías consultar/actualizar?

---

### **Ejercicio 2: Diseño de Flujo Conversacional**

Dibuja (en papel o herramienta digital) el flujo completo de:

```
Usuario envía "Hola"
   ↓
Bot muestra menú principal (6 opciones)
   ↓
Usuario selecciona "1" (Reportar Violeta)
   ↓
Bot muestra variantes (Centro→Presa, etc.)
   ↓
Usuario selecciona variante
   ↓
Bot muestra paradas (1-16)
   ↓
Usuario selecciona parada
   ↓
Bot guarda reporte y confirma
```

**Identifica:**
- ¿Cuántos "estados" tiene el bot?
- ¿Qué pasa si el usuario envía un número inválido?
- ¿Cómo vuelve al menú principal?

---

### **Ejercicio 3: Modelo de Datos**

Usando el schema PostgreSQL propuesto, responde:

1. Si quieres saber "cuántos reportes hay de la Ruta Violeta Centro→Presa en las últimas 2 horas", ¿qué tablas necesitas consultar?

2. ¿Por qué `confirmations` es una tabla separada y no solo un campo `confirm_count` en `reports`?

3. ¿Qué pasa si un usuario reporta la misma parada 10 veces en 1 minuto? ¿Cómo lo previene el schema?

---

## 📝 REGLAS DE APRENDIZAJE

### **Como Instructor, YO me comprometo a:**
1. ✅ No dar código completo copy-paste para la solución final
2. ✅ Explicar el "por qué" de cada decisión técnica
3. ✅ Proveer pseudo-código y ejemplos aislados
4. ✅ Validar comprensión antes de avanzar al siguiente paso
5. ✅ Fomentar buenas prácticas desde el día 1

### **Como Estudiante, TÚ te comprometes a:**
1. ✅ Implementar la mayor parte del código tú mismo
2. ✅ Hacer preguntas cuando no entiendas algo
3. ✅ Documentar decisiones en el roadmap
4. ✅ Completar ejercicios antes de avanzar
5. ✅ Mantener focus en comprender, no solo "hacer que funcione"

---

## 🚀 PRÓXIMOS PASOS INMEDIATOS

### **Paso 1: Responder Ejercicios Pendientes**
Antes de diseñar el Sprint 0, debes completar los 3 ejercicios de arriba.

### **Paso 2: Setup del Entorno de Desarrollo**
- Instalar Node.js (versión LTS)
- Instalar PostgreSQL localmente
- Instalar VS Code + extensiones (ESLint, Prettier)
- Crear repositorio Git

### **Paso 3: Sprint 0 - Diseño**
- Diagrama de arquitectura
- Modelo de datos (validado)
- Flujo conversacional del bot
- Definir Product Backlog

### **Paso 4: Sprint 1 - Código**
- Inicializar proyecto Node + TypeScript
- Crear schema en PostgreSQL
- Implementar endpoints básicos
- Pruebas con Postman

---

## 📚 RECURSOS DE APRENDIZAJE

### **Express.js**
- [Documentación oficial](https://expressjs.com/)
- Conceptos clave: middleware, routing, error handling

### **PostgreSQL**
- [Tutorial oficial](https://www.postgresql.org/docs/current/tutorial.html)
- Conceptos clave: schemas, foreign keys, indexes, transactions

### **Facebook Messenger API**
- [Quick Start](https://developers.facebook.com/docs/messenger-platform/getting-started)
- Conceptos clave: webhook verification, Send API, message types

### **TypeScript**
- [Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- Conceptos clave: types, interfaces, async/await

---

## 📊 MÉTRICAS DE ÉXITO DEL PROYECTO

### **Sprint 0**
- [ ] Todos los diagramas completos y validados
- [ ] Schema SQL ejecutado sin errores
- [ ] Backlog con al menos 15 user stories priorizadas

### **Sprint 1**
- [ ] 100% de endpoints responden correctamente
- [ ] 0 errores no manejados
- [ ] Datos persisten en PostgreSQL

### **Sprint 2**
- [ ] Bot responde en <3 segundos
- [ ] Webhook verificado por Facebook
- [ ] Deploy exitoso en Railway

### **Sprint 3-4**
- [ ] Usuario completa flujo de reporte sin errores
- [ ] Consultas muestran datos actualizados
- [ ] Anti-spam funciona (1 reporte cada 10 min)

---

## ⚠️ RIESGOS Y MITIGACIONES

| **Riesgo** | **Probabilidad** | **Impacto** | **Mitigación** |
|------------|-----------------|-------------|----------------|
| Complejidad de Messenger API | Alta | Alto | Leer docs cuidadosamente, empezar con webhook básico |
| Diseño de BD incorrecto | Media | Alto | Validar en Sprint 0, no avanzar sin aprobación |
| Deploy en Railway falla | Media | Medio | Testear localmente primero, revisar logs |
| Facebook rechaza webhook | Media | Alto | Seguir guía oficial paso a paso, verificar HTTPS |
| Overflow de mensajes | Baja | Medio | Implementar rate limiting desde Sprint 1 |

---

## 📌 DECISIONES TÉCNICAS TOMADAS

### **Stack Definitivo**
- **Backend:** Node.js + Express + TypeScript
- **Base de Datos:** PostgreSQL (Railway)
- **Hosting:** Railway (API + PostgreSQL)
- **Canal:** Facebook Messenger
- **Validación:** Zod
- **Control de versiones:** Git + GitHub

### **Prioridades**
1. ✅ Bot de Messenger (última vez visto)
2. ⏸️ API de búsqueda de rutas (futuro)
3. ⏸️ Panel administrativo (futuro)
4. ⏸️ Integración con Google Sheets (futuro)

### **Alcance del MVP**
**Incluido:**
- Reportar avistamiento (Violeta, SITT, Suburbaja)
- Consultar "última vez visto"
- Sistema de confirmaciones
- Anti-spam básico (1 reporte cada 10 min)

**NO Incluido (futuro):**
- Mapas visuales
- Notificaciones push
- Reportes de desvíos
- Panel web de estadísticas
- Integración con Google Sheets

---

## 📞 CONTACTO Y SOPORTE

**Instructor:** Senior Software Engineer (LLM)  
**Estudiante:** Junior Developer  
**Metodología:** Scrum incremental con validación continua  
**Duración estimada MVP:** 4 sprints (4 semanas)

---

## 🔖 HISTORIAL DE VERSIONES

- **v1.0 (2026-02-17):** Documento inicial creado
  - Análisis de arquitectura actual
  - Propuesta de normalización
  - Definición de sprints
  - Ejercicios pendientes

---

**Este documento es vivo y debe actualizarse en cada sprint con:**
- Decisiones nuevas tomadas
- Lecciones aprendidas
- Cambios en el alcance
- Problemas encontrados y soluciones

**Última actualización:** 2026-02-17 17:27 UTC
