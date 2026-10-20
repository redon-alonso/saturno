// Calendarios laborales oficiales ya publicados. Los autonómicos de la Comunitat Valenciana cambian cada año
// (p. ej. Sant Joan es festivo en 2026 y no en 2027), así que se transcriben del decreto de cada año.
// Para añadir un año: copiar el bloque, revisar el decreto en dogv.gva.es y los locales en valencia.es.
// Los festivos que caen en domingo no se listan (no afectan al cómputo de días laborables).

export const OFFICIAL = {
  'ES-VC': {
    2026: {
      source: 'Decreto 100/2025 del Consell (DOGV núm. 10145, 07/07/2025)',
      days: [
        ['2026-01-01', 'Año Nuevo', 'nacional'],
        ['2026-01-06', 'Epifanía del Señor', 'nacional'],
        ['2026-03-19', 'San José', 'autonomico'],
        ['2026-04-03', 'Viernes Santo', 'nacional'],
        ['2026-04-06', 'Lunes de Pascua', 'autonomico'],
        ['2026-05-01', 'Fiesta del Trabajo', 'nacional'],
        ['2026-06-24', 'San Juan', 'autonomico'],
        ['2026-08-15', 'Asunción de la Virgen', 'nacional'],
        ['2026-10-09', 'Día de la Comunitat Valenciana', 'autonomico'],
        ['2026-10-12', 'Fiesta Nacional de España', 'nacional'],
        ['2026-12-08', 'Inmaculada Concepción', 'nacional'],
        ['2026-12-25', 'Natividad del Señor', 'nacional'],
      ],
      local: {
        valencia: [
          ['2026-01-22', 'San Vicente Mártir', 'local'],
          ['2026-04-13', 'San Vicente Ferrer', 'local'],
        ],
      },
    },
    2027: {
      source: 'Decreto 42/2026 del Consell (DOGV núm. 10329, 25/03/2026)',
      days: [
        ['2027-01-01', 'Año Nuevo', 'nacional'],
        ['2027-01-06', 'Epifanía del Señor', 'nacional'],
        ['2027-03-19', 'San José', 'autonomico'],
        ['2027-03-26', 'Viernes Santo', 'nacional'],
        ['2027-03-29', 'Lunes de Pascua', 'autonomico'],
        ['2027-05-01', 'Fiesta del Trabajo', 'nacional'],
        ['2027-10-09', 'Día de la Comunitat Valenciana', 'autonomico'],
        ['2027-10-12', 'Fiesta Nacional de España', 'nacional'],
        ['2027-11-01', 'Todos los Santos', 'nacional'],
        ['2027-12-06', 'Día de la Constitución', 'nacional'],
        ['2027-12-08', 'Inmaculada Concepción', 'nacional'],
        ['2027-12-25', 'Natividad del Señor', 'nacional'],
      ],
      local: {
        // Aprobados por el Pleno del Ayuntamiento en julio de 2026
        valencia: [
          ['2027-01-22', 'San Vicente Mártir', 'local'],
          ['2027-04-05', 'San Vicente Ferrer', 'local'],
        ],
      },
    },
  },
};
