-- Esquema idempotente: se ejecuta en cada arranque.

CREATE TABLE IF NOT EXISTS sections (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'usuario' CHECK (role IN ('admin', 'jefe', 'usuario')),
  section_id       INT REFERENCES sections(id) ON DELETE SET NULL,
  hire_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date DATE,
  -- Días que la persona ya traía antes de darse de alta en el sistema
  initial_balance  NUMERIC(6,2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fecha desde la que se computa el saldo (NULL = desde la incorporación). Sirve para dar de alta
-- a plantilla existente sin regenerar ciclos ya disfrutados: lo anterior va en initial_balance.
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_from DATE;

CREATE TABLE IF NOT EXISTS absence_types (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL,
  count_mode       TEXT NOT NULL DEFAULT 'natural' CHECK (count_mode IN ('natural', 'laborable')),
  deducts_vacation BOOLEAN NOT NULL DEFAULT FALSE,  -- descuenta del saldo acumulable de vacaciones
  annual_quota     NUMERIC(6,2),                    -- cupo por ciclo, no acumulable (NULL = sin límite)
  is_absence       BOOLEAN NOT NULL DEFAULT TRUE,   -- cuenta como "fuera" en el cuadrante
  allows_hours     BOOLEAN NOT NULL DEFAULT FALSE,  -- admite franja horaria (visitas médicas)
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort             INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS requests (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id        INT NOT NULL REFERENCES absence_types(id),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  start_time     TIME,
  end_time       TIME,
  days           NUMERIC(6,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  comment        TEXT,
  reviewer_id    INT REFERENCES users(id) ON DELETE SET NULL,
  review_comment TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- Anulación: quién, cuándo y por qué (obligatorio cuando anula el administrador)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS cancelled_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS requests_dates_idx ON requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS requests_user_idx ON requests (user_id, status);

CREATE TABLE IF NOT EXISTS balance_adjustments (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days       NUMERIC(6,2) NOT NULL,
  reason     TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Festivos: no computan en los tipos que cuentan días laborables
CREATE TABLE IF NOT EXISTS holidays (
  date  DATE PRIMARY KEY,
  name  TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'local' CHECK (scope IN ('nacional', 'autonomico', 'local', 'empresa'))
);

INSERT INTO absence_types (code, name, color, count_mode, deducts_vacation, annual_quota, is_absence, allows_hours, sort) VALUES
  ('vacaciones',      'Vacaciones',      '#e5676c', 'natural',   TRUE,  NULL, TRUE,  FALSE, 1),
  ('asuntos_propios', 'Asuntos propios', '#e0a23a', 'laborable', FALSE, 2,    TRUE,  FALSE, 2),
  ('medico',          'Visita médica',   '#3e9ad6', 'laborable', FALSE, NULL, TRUE,  TRUE,  3),
  ('teletrabajo',     'Teletrabajo',     '#2fa58a', 'laborable', FALSE, NULL, FALSE, FALSE, 4)
ON CONFLICT (code) DO NOTHING;

-- Solicitudes por horas: `hours` guarda la duración y `days` la fracción de jornada que descuenta.
-- Al crear la columna (una sola vez) se activan las horas en vacaciones y teletrabajo; después manda el administrador.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'hours') THEN
    ALTER TABLE requests ADD COLUMN hours NUMERIC(5,2);
    UPDATE absence_types SET allows_hours = TRUE WHERE code IN ('vacaciones', 'teletrabajo');
  END IF;
END $$;

-- Jerarquía: cada sección puede depender de otra (Dirección ← Almacén, Administración…)
ALTER TABLE sections ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES sections(id) ON DELETE SET NULL;

-- Motivo privado: los compañeros ven «Ausencia» en gris, sin el motivo. Al crear la columna (una sola vez) se activa
-- en todo lo que cuenta como ausencia; el teletrabajo queda visible porque la persona sí está trabajando.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'absence_types' AND column_name = 'is_private') THEN
    ALTER TABLE absence_types ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE absence_types SET is_private = TRUE WHERE is_absence;
  END IF;
END $$;

-- Paleta v2: actualiza los colores de fábrica antiguos sin tocar los personalizados
UPDATE absence_types t SET color = v.new
  FROM (VALUES ('vacaciones', '#2563eb', '#e5676c'), ('asuntos_propios', '#9333ea', '#e0a23a'),
               ('medico', '#dc2626', '#3e9ad6'), ('teletrabajo', '#047857', '#2fa58a')) AS v(code, old, new)
 WHERE t.code = v.code AND t.color = v.old;
