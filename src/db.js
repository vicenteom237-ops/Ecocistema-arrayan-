'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  rut           TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','profesor','apoderado')),
  email         TEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  must_change   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  level           TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  color           TEXT,
  room            TEXT,
  head_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  color      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY,
  rut        TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  birth_date TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_guardians (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation   TEXT,
  PRIMARY KEY (student_id, user_id)
);

CREATE TABLE IF NOT EXISTS evaluations (
  id          INTEGER PRIMARY KEY,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'Sumativa',
  date        TEXT,
  weight      REAL NOT NULL DEFAULT 0,
  period      INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  visible     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  value         REAL NOT NULL,
  comment       TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    INTEGER,
  PRIMARY KEY (evaluation_id, student_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT,
  course_id  INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER,
  user_name TEXT,
  action    TEXT NOT NULL,
  detail    TEXT,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subjects_course ON subjects(course_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_eval_subject ON evaluations(subject_id, period);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_user ON student_guardians(user_id);
`;

// Colores de la "escalera de perlas" Montessori: 5 celeste, 6 lila, 7 perla, 8 café, 9 azul.
const DEFAULT_COURSES = [
  { name: '5° Básico', level: 'Taller II', color: '#5DA9D6' },
  { name: '6° Básico', level: 'Taller II', color: '#9B7FC1' },
  { name: '7° Básico', level: 'Comunidad Adolescente', color: '#B9A98F' },
  { name: '8° Básico', level: 'Comunidad Adolescente', color: '#8B5E3C' },
  { name: '1° Medio', level: 'Comunidad Adolescente', color: '#2F5D8A' },
];

const SUBJECTS_BASICA = [
  'Lenguaje y Comunicación', 'Matemática', 'Ciencias Naturales',
  'Historia, Geografía y Cs. Sociales', 'Inglés', 'Artes Visuales', 'Música',
  'Tecnología', 'Educación Física y Salud',
];
const SUBJECTS_MEDIA = [
  'Lengua y Literatura', 'Matemática', 'Ciencias Naturales',
  'Historia, Geografía y Cs. Sociales', 'Inglés', 'Artes Visuales', 'Música',
  'Tecnología', 'Educación Física y Salud',
];

const SUBJECT_COLORS = ['#C8553D', '#2F5D8A', '#5E8C4A', '#B7793A', '#7A5BA6', '#D08C9A', '#3E8A8C', '#8B6D4E', '#D2A23A', '#6C7A89'];

const DEFAULT_SETTINGS = {
  school_name: 'Colegio Montessori Ecocistema Arrayán',
  school_short: 'Ecocistema Arrayán',
  motto: 'Ayúdame a hacerlo por mí mismo',
  school_year: String(new Date().getFullYear()),
  grade_min: '1.0',
  grade_max: '7.0',
  grade_pass: '4.0',
  period_count: '2',
  period_label: 'Semestre',
  address: '',
  phone: '',
  email: '',
};

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!getSetting.get(k)) setSetting.run(k, v);
  }

  if (!getSetting.get('initialized')) {
    transaction(db, () => {
      const insCourse = db.prepare('INSERT INTO courses (name, level, color, sort) VALUES (?, ?, ?, ?)');
      const insSubject = db.prepare('INSERT INTO subjects (course_id, name, color, sort) VALUES (?, ?, ?, ?)');
      DEFAULT_COURSES.forEach((c, i) => {
        const { lastInsertRowid } = insCourse.run(c.name, c.level, c.color, i + 1);
        const list = i < 2 ? SUBJECTS_BASICA : SUBJECTS_MEDIA;
        list.forEach((s, j) => insSubject.run(Number(lastInsertRowid), s, SUBJECT_COLORS[j % SUBJECT_COLORS.length], j + 1));
      });
      setSetting.run('initialized', new Date().toISOString());
    });
  }

  return db;
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction, SUBJECT_COLORS, DEFAULT_SETTINGS };
