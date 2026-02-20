# Diagrama FSM - PasajeroApp Bot (Formato Conversacional)

## 📊 ESTADOS PRINCIPALES

```
1. menu (punto de partida)
2. aguardando_ruta (espera A/B/C)
3. aguardando_variante_violeta (espera 1-7)
4. aguardando_variante_sitt (espera 1-2)
5. aguardando_variante_suburbaja (espera 1-2)
6. aguardando_parada (espera 1-16)
7. validando_reporte (verifica input)
8. verificando_spam (checa último reporte)
9. guardando_reporte (INSERT en BD)
10. rechazando_spam (mensaje de espera)
11. consultando_ruta (espera A/B/C)
12. consultando_variante (espera 1-7)
13. mostrando_resultados (muestra últimos 5)
14. confirmando_avistamiento (procesa confirmación)
15. validando_confirmacion (¿nuevo o incrementar?)
16. guardando_confirmacion (+1 a confirm_count)
17. guardando_nuevo_reporte (nuevo INSERT)
18. mostrando_mapas (enlaces)
```

---

## 🔄 FLUJO COMPLETO: REPORTAR

```
[Usuario inicia chat]
    ↓
Estado: menu
Bot: "¡Hola! ¿Qué deseas hacer?
      1. Reportar avistamiento
      2. Consultar última vez visto
      3. Ver mapas"
    ↓
Usuario escribe: "1"
    ↓
Estado: aguardando_ruta
Bot: "¿Qué ruta viste?
      A. Violeta
      B. SITT
      C. Suburbaja
      0. Regresar"
    ↓
Usuario escribe: "A"
    ↓
Estado: aguardando_variante_violeta
Bot: "¿Qué variante de Violeta?
      1. Centro → Presa
      2. Presa → Centro
      3. Centro → Playas
      4. Playas → Centro
      5. Presa → Playas
      6. Playas → Presa
      7. Circular
      0. Regresar"
    ↓
Usuario escribe: "1"
    ↓
Estado: aguardando_parada
Bot: "¿En qué parada?
      1. Zona Centro
      2. Torre Aguacaliente
      3. Calimax Aguacaliente
      4. Clínica 1
      5. Clínica 7
      ... (hasta 16)
      0. Regresar"
    ↓
Usuario escribe: "5"
    ↓
Estado: validando_reporte
[Sistema verifica: ¿parada existe en BD?]
    ↓ SÍ
Estado: verificando_spam
[Query: SELECT * FROM reports WHERE user_psid='123' AND reported_at > NOW() - 10 min]
    ↓
¿Ya reportó hace <10 min?
    ↙ NO                    SÍ ↘
Estado: guardando_reporte   Estado: rechazando_spam
[INSERT INTO reports]       Bot: "⏳ Ya reportaste hace 3 min.
Bot: "✅ ¡Reporte guardado!      Espera 7 minutos más"
      Violeta (Centro→Presa)     ↓
      Clínica 7"              Estado: menu
    ↓
Estado: menu
Bot: "¿Qué más deseas hacer?
      1. Reportar...
      2. Consultar...
      3. Mapas..."
```

---

## 🔍 FLUJO COMPLETO: CONSULTAR

```
Estado: menu
Usuario escribe: "2"
    ↓
Estado: consultando_ruta
Bot: "¿Qué ruta consultar?
      A. Violeta
      B. SITT
      C. Suburbaja
      0. Regresar"
    ↓
Usuario escribe: "A"
    ↓
Estado: consultando_variante
Bot: "¿Qué variante de Violeta?
      1. Centro → Presa
      2. Presa → Centro
      ... (todas las variantes)"
    ↓
Usuario escribe: "1"
    ↓
Estado: mostrando_resultados
[Query: SELECT * FROM reports WHERE variant_id=1 AND is_active=true ORDER BY reported_at DESC LIMIT 5]
    ↓
¿Hay reportes activos?
  ↙ NO                          SÍ ↘
Bot: "Sin reportes recientes"   Bot: "📋 Últimos avistamientos:
  ↓                                  • Clínica 7 - hace 5 min ✅✅✅ (3 confirmaciones)
Estado: menu                         • Torre Aguacaliente - hace 12 min ✅ (1)
                                     • Calimax - hace 45 min (0)
                                     
                                     ¿Qué hacer?
                                     1. Yo también la vi
                                     2. Regresar al menú"
                                  ↓
                            Usuario escribe: "1"
                                  ↓
                            Estado: confirmando_avistamiento
                            [Query: último reporte de variant_id=1]
                                  ↓
                            Estado: validando_confirmacion
                            [Calcular tiempo desde último reporte]
                                  ↓
                            ¿Hace cuánto fue el último?
                              ↙ <10 min         >20 min ↘
                    Estado: guardando_confirmacion    Estado: guardando_nuevo_reporte
                    [UPDATE reports                   [INSERT INTO reports
                     SET confirm_count += 1]           nuevo reporte]
                    Bot: "✅ ¡Confirmación guardada!  Bot: "✅ ¡Nuevo reporte creado!
                          Ahora tiene 4 confirmaciones"      Ya pasó mucho tiempo"
                              ↓                              ↓
                          Estado: menu                  Estado: menu
```

---

## ❌ MANEJO DE ERRORES

```
Estado: aguardando_ruta
Usuario escribe: "999"
    ↓
[Validación: input no es A/B/C/0]
    ↓
Bot: "❌ Opción no válida. Escribe:
      A - Violeta
      B - SITT
      C - Suburbaja
      0 - Regresar"
    ↓
Estado: aguardando_ruta (NO CAMBIA)
[Usuario sigue en el mismo estado]
```

---

## ⏰ MANEJO DE TIMEOUTS

```
Estado: aguardando_variante_violeta
[Usuario no responde por 31 minutos]
    ↓
[Sistema detecta: Date.now() - userState.timestamp > 30 min]
    ↓
Estado: menu (RESET AUTOMÁTICO)
userState.data = { timestamp: Date.now() }
    ↓
Bot: "⏰ Se acabó el tiempo. ¿Qué deseas hacer?
      1. Reportar
      2. Consultar
      3. Mapas"
```

---

## 🔙 OPCIÓN "0" REGRESAR

```
Estado: aguardando_parada
Usuario escribe: "0"
    ↓
Estado: menu
Bot: "Regresando al menú principal...
      1. Reportar
      2. Consultar
      3. Mapas"
```

---

## 🛡️ FLUJO ANTI-SPAM (Detallado)

```
1. Usuario está en aguardando_parada
2. Usuario escribe "5" (Clínica 7)
3. Sistema: validando_reporte
   - ¿Input es número? ✓
   - ¿Número entre 1-16? ✓
   - ¿Parada existe en BD? ✓
4. Sistema: verificando_spam
   - Query BD: "¿Este PSID reportó en últimos 10 min?"
   
   Escenario A: NO hay reportes recientes
   → guardando_reporte
   → INSERT INTO reports (variant_id=1, stop_id=5, user_psid='123')
   → menu con "✅ Guardado"
   
   Escenario B: SÍ hay reporte hace 3 minutos
   → rechazando_spam
   → Calcular tiempo restante: 10 - 3 = 7 minutos
   → menu con "⏳ Espera 7 minutos"
```

---

## ✅ FLUJO CONFIRMACIÓN INTELIGENTE (Detallado)

```
1. Usuario consulta variante "Centro → Presa"
2. Bot muestra: "Clínica 7 - hace 5 min ✅✅✅"
3. Usuario escribe "1" (Yo también la vi)
4. Sistema: confirmando_avistamiento
5. Sistema: validando_confirmacion
   - Query: último reporte de variant_id=1
   - Resultado: reportado hace 5 minutos
   
   Decisión:
   ¿5 minutos < 10 minutos? SÍ
   → guardando_confirmacion
   → UPDATE reports SET confirm_count = 4 WHERE id=X
   → Bot: "✅ Confirmación #4 guardada"
   
   Si hubiera sido hace 25 minutos:
   ¿25 minutos > 20 minutos? SÍ
   → guardando_nuevo_reporte
   → INSERT nuevo reporte
   → Bot: "✅ Nuevo reporte creado (ya pasó mucho tiempo)"
```

---

## 💾 DATOS QUE GUARDA CADA ESTADO

### Estado: menu
```json
{
  "state": "menu",
  "data": {
    "timestamp": 1708337400000
  }
}
```

### Estado: aguardando_variante_violeta
```json
{
  "state": "aguardando_variante_violeta",
  "data": {
    "ruta_id": 1,
    "ruta_nombre": "Violeta",
    "timestamp": 1708337450000
  }
}
```

### Estado: aguardando_parada
```json
{
  "state": "aguardando_parada",
  "data": {
    "ruta_id": 1,
    "ruta_nombre": "Violeta",
    "variant_id": 3,
    "variant_name": "Centro → Presa",
    "timestamp": 1708337480000
  }
}
```

---

## 📋 TABLA RESUMEN: ESTADO → INPUTS → SIGUIENTE ESTADO

### Estado: menu
```
Input "1" → aguardando_ruta
Input "2" → consultando_ruta
Input "3" → mostrando_mapas
Input "999" → menu (mantiene + error)
```

### Estado: aguardando_ruta
```
Input "A" → aguardando_variante_violeta
Input "B" → aguardando_variante_sitt
Input "C" → aguardando_variante_suburbaja
Input "0" → menu
Input "XYZ" → aguardando_ruta (mantiene + error)
```

### Estado: aguardando_variante_violeta
```
Input "1" → aguardando_parada
Input "2" → aguardando_parada
... hasta "7"
Input "0" → menu
Input inválido → aguardando_variante_violeta (mantiene)
```

### Estado: aguardando_parada
```
Input "1-16" → validando_reporte → verificando_spam
                   ↓
                guardando_reporte O rechazando_spam
                   ↓
                 menu
Input "0" → menu
Input inválido → aguardando_parada (mantiene)
```

### Estado: consultando_variante
```
Input "1-7" → mostrando_resultados
Input "0" → menu
Input inválido → consultando_variante (mantiene)
```

### Estado: mostrando_resultados
```
Input "1" → confirmando_avistamiento
Input "2" → menu
Cualquier otro → menu
```

---

## ⚠️ REGLAS CRÍTICAS

### 1. Timeout de 30 minutos
- CUALQUIER estado + 30 min inactivo = reset a menu

### 2. Anti-spam de 10 minutos
- 1 usuario = máximo 1 reporte cada 10 minutos

### 3. Confirmación inteligente
- Último reporte <10 min = +1 a confirm_count
- Último reporte >20 min = nuevo reporte

### 4. Input inválido
- NO cambiar de estado
- Mostrar mensaje de error
- Esperar nuevo input

### 5. Reportes expiran a 90 minutos
- Campo `expires_at` en BD
- Job automático marca `is_active = false`

---

## 🎨 Leyenda de Colores para FigJam

- 🟦 **Azul** = Estados del flujo "Reportar"
- 🟩 **Verde** = Estados del flujo "Consultar"
- 🟧 **Naranja** = Estados de validación/procesamiento
- 🟥 **Rojo** = Estados de error/rechazo
- 🟪 **Morado** = Estado "menu" (central)
- ⚫ **Gris** = Estados especiales (timeout, mapas)

---

## 💡 Notas de Implementación

### Estados que NO se Guardan en BD (MVP)
- Usar `Map<string, UserState>` en memoria
- Aceptable perder estados al reiniciar servidor en MVP
- En producción: migrar a tabla `user_sessions`

### Estados que SÍ se Guardan en BD
- `reports` (persistente, expira a 90 min)
- `confirmations` (persistente)
- `users` (persistente)

### Limpieza Automática de Reportes Expirados
```sql
-- Ejecutar este query cada 15 minutos (cron job)
UPDATE reports 
SET is_active = false 
WHERE expires_at < NOW() 
AND is_active = true;
```

### Código de Validación de Timeout
```javascript
if (Date.now() - userState.data.timestamp > 30 * 60 * 1000) {
  userState.state = 'menu';
  userState.data = { timestamp: Date.now() };
}
```

### Código de Validación Anti-Spam
```javascript
const recentReports = await db.query(`
  SELECT * FROM reports 
  WHERE user_psid = $1 
  AND reported_at > NOW() - INTERVAL '10 minutes'
`, [psid]);

if (recentReports.length > 0) {
  const minutesLeft = 10 - Math.floor((Date.now() - recentReports[0].reported_at) / 60000);
  await sendMessage(psid, `⏳ Espera ${minutesLeft} minutos`);
  userState.state = 'menu';
}
```
