# Proyecto: Última Vez Visto - Por PasajeroApp

## CONTEXTO DEL PROYECTO

Estamos desarrollando una función dentro de Pasajero App para ayudar a los usuarios del transporte público en Tijuana.

### Actualmente:
- El transporte es irregular e impredecible.
- Rutas como la Violeta pueden tardar hasta 2 horas.
- Los usuarios dependen de grupos privados de WhatsApp.
- Muchas personas han sido expulsadas sin explicación.
- No existe una fuente abierta y confiable de información.

### Además:
- Muchas personas no tienen datos móviles constantes.
- No descargan apps nuevas.
- Pero sí utilizan Facebook Messenger.
- Nuestra solución puede incorporarse posteriormente a Pasajero.
- Evita problemas con rastreo exacto ya que solo es "última vez visto".

Por eso construiremos una solución dentro de Messenger e incluso sería posible hacerlo por WhatsApp.

---

## PROBLEMA QUE ESTAMOS RESOLVIENDO

Los usuarios necesitan saber:
- si la unidad ya pasó
- hace cuánto pasó
- por dónde fue vista
- si realmente está circulando

Hoy esta información:
- es informal
- es excluyente
- no es confiable
- depende de administradores privados

**La solución debe ser:** abierta, comunitaria, fácil de usar, accesible sin gastar datos.

---

## IMPACTO SOCIAL

Esto ayudará a:

### Estudiantes
- Evitar esperar horas sin saber si el autobús viene.

### Trabajadores
- Reducir retrasos y pérdida de ingresos por transporte irregular.

### Adultos mayores
- Tener información clara sin depender de tecnología compleja.

### Usuarios excluidos de grupos privados
- Acceso abierto sin discriminación.

---

## OPORTUNIDAD DE MERCADO

Nadie está resolviendo este problema.

Las apps existentes:
- requieren datos móviles
- no tienen información local precisa
- no reflejan la realidad diaria

Pasajero puede convertirse en:
- la fuente comunitaria de movilidad urbana
- la infraestructura informativa del transporte
- el estándar de información en Tijuana

---

## POR QUÉ USAMOS FACEBOOK MESSENGER

Messenger permite:
- uso con datos mínimos
- acceso inmediato
- no instalar apps
- interfaz familiar
- adopción masiva en México

Será nuestro canal de entrada de reportes.

---

## ARQUITECTURA GENERAL

Usuario ➔ Facebook Messenger (o WhatsApp) ➔ Webhook (nuestro servidor) ➔ Base de datos ➔ Web Pasajero muestra "último visto"

Messenger captura datos. La web muestra resultados.

---

## COMPONENTES TÉCNICOS NECESARIOS

### 1. Página de Facebook
Será el punto de acceso al bot.

### 2. Meta Developers App
Necesaria para conectar Messenger con nuestro servidor.

### 3. Webhook HTTPS (OBLIGATORIO)
Messenger enviará eventos a:

https://nuestroservidor.com/webhook
text

Debe estar online 24/7. Si el servidor cae, el bot deja de funcionar.

---

## FUNCIONAMIENTO DEL BOT

Usaremos un flujo basado en números para reducir fricción. Este flujo fue diseñado utilizando datos de paradas existentes.

### MENÚ PRINCIPAL

El usuario escribe cualquier cosa. El bot responde:

¿Qué deseas hacer?
1 Reportar Ruta Violeta
2 Reportar Ruta Suburbaja o SITT
3 Última Vez Visto Ruta Violeta
4 Última Vez Visto Suburbaja o SITT
5 Desviación u otro
6 Mapas de Rutas
text


### REPORTAR RUTA

Usuario elige transporte:

    Centro > Presa

    Presa > Centro

    Centro > Natura

    Natura > Centro

    Centro o Presa > UABC

    UABC > Centro o Presa

    Regresar <

text


Luego selecciona parada (máx. 16 opciones numeradas):

1 - Zona Centro
2 - Torre Aguacaliente
3 - Calimax Aguacaliente
4 - Plaza Landmark / CAS VISA
5 - Clinica 76
6 - Campestre (Dos Torres)
7 - Plaza Galerias
8 - Plaza Las Palmas
9 - Ermita Sur
10 - 5 y 10
11 - Siglo XXI
12 - Plaza Villa Floresta
13 - Los Pinos (Puente Negro)
14 - Jardines de la Mesa (Margarita)
15 - Bodega Aurrera (Presa)
16 - DIF La Presa
text


Después:

Reporte guardado
text


### VER ÚLTIMO VISTO

El usuario selecciona ruta → variante

Respuesta:

Ruta Violeta Centro → Presa
Último visto: hace 12 minutos
Ubicación: 5 y 10
Confirmado por: 3 usuarios
text


Se mostrarán los últimos 5 reportes con la cantidad de confirmaciones. El usuario puede mantener el menú abierto para actualizar.

---

## ESTRUCTURA DE BASE DE DATOS (MVP)

### route_variants
- id
- route_name
- variant_name

### stops
- id
- variant_id
- stop_number
- stop_name

### reports
- variant_id
- stop_id
- reported_at
- confirm_count

---

## LÓGICA IMPORTANTE

### Nuevo reporte
Se guarda con confirm_count = 1

### "Yo también lo vi"
- Si el último reporte tiene <10 o <5 min: incrementa confirm_count
- Si >20 min: crea nuevo reporte

### REGLAS PARA EVITAR SPAM
- Máximo 1 reporte por usuario cada 10 minutos
- Confirmaciones sólo válidas dentro de 5 - 10 minutos
- Reportes >90 min se consideran inactivos pero válidos al comienzo

---

## OBJETIVO DEL MVP

**NO** construir un bot complejo.

**SÍ** construir:
- una alternativa abierta a grupos privados
- una fuente confiable comunitaria
- una herramienta usable con datos mínimos
- un sistema que capture información real

---

## POR QUÉ ESTE PROYECTO ES IMPORTANTE

Este no es solo un bot, es:
- acceso a información para miles de personas
- movilidad más eficiente
- inclusión digital
- datos reales para mejorar el transporte
- base para soluciones GovTech futuras