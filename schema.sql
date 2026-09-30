-- Esquema de la base de datos del colectivo (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  alias       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  specialty   TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  bio         TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  links       TEXT NOT NULL DEFAULT '[]',
  photo_key   TEXT NOT NULL DEFAULT '',
  available   INTEGER NOT NULL DEFAULT 1,
  status_note TEXT NOT NULL DEFAULT '',
  whatsapp    TEXT NOT NULL DEFAULT '',
  store       TEXT NOT NULL DEFAULT '',
  pass_hash   TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  place      TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drops (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  artists    TEXT NOT NULL DEFAULT '',
  day        TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  artists    TEXT NOT NULL DEFAULT '',
  audio_key  TEXT NOT NULL,
  duration   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS join_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  links      TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dates_day ON dates(day);
CREATE INDEX IF NOT EXISTS idx_drops_day ON drops(day);
CREATE INDEX IF NOT EXISTS idx_tracks_member ON tracks(member_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL,
  name TEXT NOT NULL, price TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '', image_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL DEFAULT 0,
  image_key TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
