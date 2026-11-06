CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  email TEXT NOT NULL CHECK (length(btrim(email)) > 0),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE readings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL CHECK (isfinite(date)),
  slot TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT readings_slot_check CHECK (
    slot IN ('morning', 'after_breakfast', 'after_lunch', 'after_dinner')
  ),
  CONSTRAINT readings_value_check CHECK (value BETWEEN 40 AND 600),
  CONSTRAINT readings_user_date_slot_unique UNIQUE (user_id, date, slot)
);
