import { query, pool } from '../db/connection';
import fs from 'fs';
import path from 'path';

const rutasSeed = [
  {
    nombre: "Violeta",
    variantes: [
      {
        nombre: "Centro - Presa",
        codigoIda: "A1",
        codigoVuelta: "A2",
        paradas: [
          "Zona Centro", "Torre Aguacaliente", "Calimax Aguacaliente", "Plaza Landmark / CAS VISA",
          "Clinica 7", "Campestre (Dos Torres)", "Plaza Galerias", "Plaza Las Palmas",
          "Ermita Sur", "5 y 10", "Siglo XXI", "Plaza Villa Floresta",
          "Los Pinos (Puente Negro)", "Jardines de la Mesa (Margarita)", "Bodega Aurrera (Presa)", "DIF La Presa"
        ]
      },
      {
        nombre: "Centro - Natura",
        codigoIda: "A3",
        codigoVuelta: "A4",
        paradas: [
          "Zona Centro", "Plaza Landmark / CAS VISA", "Campestre (Dos Torres)", "Ermita Sur",
          "5 y 10", "Siglo XXI", "Los Pinos (Puente Negro)", "Simon Bolivar (Jardines)",
          "Plaza Gran Florido", "Parque Industrial el Florido", "Instituto de Movilidad Sustentable", "Valle Bonito",
          "Hacienda Los Venados", "Entrada Las Delicias", "Los Valles (Ke Casas / Homex)", "Natura"
        ]
      },
      {
        nombre: "Centro o Presa - UABC",
        codigoIda: "A5",
        codigoVuelta: "A6",
        paradas: [
          "Zona Centro", "Torre Aguacaliente", "Calimax Aguacaliente", "Plaza Landmark / CAS VISA",
          "Clinica 7", "Campestre (Dos Torres)", "Plaza Galerias", "Plaza Las Palmas",
          "Ermita Sur", "5 y 10", "Central Camionera", "Plaza Alameda",
          "IMSS Clinica 36", "UABC", "ITT"
        ]
      }
    ]
  },
  {
    nombre: "Suburbaja",
    variantes: [
      {
        nombre: "Centro - Tecate",
        codigoIda: "B1",
        codigoVuelta: "B2",
        paradas: [
          "Zona Centro", "Plaza Landmark / CAS VISA", "Campestre (Dos Torres)", "Ermita Sur",
          "5 y 10", "Siglo XXI", "Los Pinos (Puente Negro)", "Simon Bolivar (Jardines)",
          "Plaza Gran Florido", "Parque Industrial el Florido", "El Refugio", "El Ojo de Agua",
          "Puente de San Pedro", "Toyota (Tijuana - Tecate)", "El Bajio Parque Industrial", "Tecate Centro"
        ]
      }
    ]
  },
  {
    nombre: "SITT",
    variantes: [
      {
        nombre: "Insurgentes - Centro",
        codigoIda: "B3",
        codigoVuelta: "B4",
        paradas: [
          "Terminal SITT", "Simon Bolivar", "IMSS Clinica 1", "Templo",
          "Parque Morelos", "Mezzanine (Insurgentes)", "Los Alamos", "Alvaro Obregon",
          "Buena Vista", "Las Americas", "Centinela", "Juan Ojeda Robles",
          "Hospital General", "Palacio Municipal", "Garita Puerta Mexico", "Zona Centro"
        ]
      }
    ]
  }
];

async function runSeed() {
    console.log('Iniciando seed de la base de datos...');

    try {
        // Leer y ejecutar schema.sql completo
        const schemaPath = path.join(__dirname, '../db/schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await query(schemaSql);
        console.log('Schema creado correctamente.');

        // Limpiar tablas
        await query('TRUNCATE routes, route_variants, stops, reports, confirmations RESTART IDENTITY CASCADE');
        console.log('Tablas limpiadas.');

        for (const ruta of rutasSeed) {
            const routeRes = await query(
                'INSERT INTO routes (name) VALUES ($1) RETURNING id',
                [ruta.nombre]
            );
            const routeId = routeRes.rows[0].id;

            for (const variante of ruta.variantes) {
                // Variante Ida
                const varIdaRes = await query(
                    'INSERT INTO route_variants (route_id, name, direction) VALUES ($1, $2, $3) RETURNING id',
                    [routeId, variante.nombre, 'Ida']
                );
                const varIdaId = varIdaRes.rows[0].id;

                // Insertar paradas Ida
                for (let i = 0; i < variante.paradas.length; i++) {
                    await query(
                        'INSERT INTO stops (variant_id, stop_number, name) VALUES ($1, $2, $3)',
                        [varIdaId, i + 1, variante.paradas[i]]
                    );
                }

                // Variante Vuelta
                const [origen, destino] = variante.nombre.split(' - ');
                const nombreVuelta = `${destino} - ${origen}`;

                const varVueltaRes = await query(
                    'INSERT INTO route_variants (route_id, name, direction) VALUES ($1, $2, $3) RETURNING id',
                    [routeId, nombreVuelta, 'Vuelta']
                );
                const varVueltaId = varVueltaRes.rows[0].id;

                // Insertar paradas Vuelta (invertidas)
                const paradasVuelta = [...variante.paradas].reverse();
                for (let i = 0; i < paradasVuelta.length; i++) {
                    await query(
                        'INSERT INTO stops (variant_id, stop_number, name) VALUES ($1, $2, $3)',
                        [varVueltaId, i + 1, paradasVuelta[i]]
                    );
                }
            }
        }
        console.log('Seed completado exitosamente.');
    } catch (error) {
        console.error('Error durante el seed:', error);
    } finally {
        await pool.end();
    }
}

runSeed();
