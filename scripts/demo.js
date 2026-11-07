'use strict';
// Carga datos de DEMOSTRACIÓN (estudiantes, profesores, apoderados y notas ficticias)
// Uso: npm run demo            (solo si la base está vacía)
//      npm run demo -- --force (borra todo y vuelve a crear la demo)

const path = require('node:path');
const fs = require('node:fs');
const { openDb, transaction } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { computeDv } = require('../src/rut');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const file = path.join(DATA_DIR, 'arrayan.db');
const force = process.argv.includes('--force');

if (force) for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
const db = openDb(file);
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.error('La base de datos ya tiene usuarios. Usa "npm run demo -- --force" para reemplazarla por la demo.');
  process.exit(1);
}

let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rand() * a.length)];
let rutBase = 21000000;
const newRut = (base) => { const b = String(base ?? rutBase++); return `${b}-${computeDv(b)}`; };

const FIRST = ['Sofía', 'Mateo', 'Isidora', 'Agustín', 'Emilia', 'Benjamín', 'Florencia', 'Tomás', 'Josefa', 'Vicente', 'Amanda', 'Joaquín',
  'Antonia', 'Lucas', 'Martina', 'Maximiliano', 'Trinidad', 'Gaspar', 'Catalina', 'Facundo', 'Magdalena', 'Cristóbal', 'Rafaela', 'Alonso',
  'Julieta', 'Bastián', 'Laura', 'Damián', 'Colomba', 'León', 'Maite', 'Ignacio', 'Elena', 'Simón', 'Renata', 'Diego', 'Pía', 'Clemente'];
const LAST = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez',
  'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Tapia', 'Reyes', 'Gutiérrez',
  'Castro', 'Pizarro', 'Álvarez', 'Vásquez', 'Sánchez', 'Fernández', 'Ramírez', 'Carrasco', 'Gómez', 'Cortés', 'Herrera', 'Núñez'];

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const year = today.getFullYear();

transaction(db, () => {
  const insUser = db.prepare('INSERT INTO users (rut, name, role, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)');
  const pass = hashPassword('arrayan2026');

  // Dirección
  insUser.run(newRut(11111111), 'Directora Demo', 'admin', 'direccion@ejemplo.cl', '+56900000000', pass);

  // Profesores
  const teacherNames = ['Carolina Fuentes Araya', 'Andrés Morales Tapia', 'Valentina Soto Reyes', 'Felipe Castro Núñez', 'Javiera Herrera Silva', 'Rodrigo Pizarro Díaz'];
  const teacherIds = teacherNames.map((n, i) => {
    const { lastInsertRowid } = insUser.run(newRut(12000000 + i * 1111), n, 'profesor', `profe${i + 1}@ejemplo.cl`, null, pass);
    return Number(lastInsertRowid);
  });
  // Áreas: 0 Lenguaje, 1 Matemática, 2 Ciencias, 3 Historia, 4 Inglés/Artes/Música, 5 Tecnología/Ed. Física
  const areaOf = (name) => {
    if (/Lengua/.test(name)) return 0;
    if (/Matem/.test(name)) return 1;
    if (/Ciencias/.test(name)) return 2;
    if (/Historia/.test(name)) return 3;
    if (/Inglés|Artes|Música/.test(name)) return 4;
    return 5;
  };

  const courses = db.prepare('SELECT * FROM courses ORDER BY sort').all();
  const setHead = db.prepare('UPDATE courses SET head_teacher_id = ?, room = ? WHERE id = ?');
  const setTeacher = db.prepare('UPDATE subjects SET teacher_id = ? WHERE id = ?');
  const insStudent = db.prepare('INSERT INTO students (rut, first_name, last_name, course_id, birth_date) VALUES (?, ?, ?, ?, ?)');
  const insLink = db.prepare('INSERT INTO student_guardians (student_id, user_id, relation) VALUES (?, ?, ?)');
  const insEval = db.prepare('INSERT INTO evaluations (subject_id, name, kind, date, weight, period, description, visible) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  const insGrade = db.prepare('INSERT INTO grades (evaluation_id, student_id, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)');

  let guardianN = 0;
  const firstGuardian = { rut: null };

  courses.forEach((c, ci) => {
    setHead.run(teacherIds[ci % teacherIds.length], ['Roble', 'Canelo', 'Arrayán', 'Coigüe', 'Raulí'][ci] || null, c.id);
    const subjects = db.prepare('SELECT * FROM subjects WHERE course_id = ? ORDER BY sort').all(c.id);
    for (const s of subjects) setTeacher.run(teacherIds[areaOf(s.name)], s.id);

    // Estudiantes
    const n = 8 + Math.floor(rand() * 4);
    const studentIds = [];
    for (let i = 0; i < n; i++) {
      const fn = pick(FIRST);
      const ln = `${pick(LAST)} ${pick(LAST)}`;
      const age = 10 + ci;
      const { lastInsertRowid } = insStudent.run(newRut(), fn, ln, c.id, `${year - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 27)).padStart(2, '0')}`);
      const sid = Number(lastInsertRowid);
      studentIds.push({ id: sid, skill: 3.7 + rand() * 3.0 });
      // Apoderado
      const gRut = newRut(15000000 + guardianN * 7);
      const gName = `${pick(['Paula', 'Marcela', 'Claudia', 'Daniela', 'Francisca', 'Pablo', 'Cristián', 'Gonzalo', 'Lorena', 'Macarena'])} ${ln.split(' ')[0]} ${pick(LAST)}`;
      const g = insUser.run(gRut, gName, 'apoderado', null, `+5698${String(1000000 + guardianN * 3137).slice(0, 7)}`, pass);
      insLink.run(sid, Number(g.lastInsertRowid), pick(['Madre', 'Padre', 'Madre', 'Abuela/o']));
      if (!firstGuardian.rut) firstGuardian.rut = gRut;
      guardianN++;
    }

    // Evaluaciones y notas
    for (const s of subjects) {
      const t = teacherIds[areaOf(s.name)];
      const plan1 = [['Diagnóstico y portafolio', 'Portafolio', 20], ['Prueba unidad 1', 'Prueba', 30], ['Proyecto de investigación', 'Proyecto', 25], ['Disertación', 'Disertación', 25]];
      const plan2 = [['Trabajo práctico', 'Trabajo', 25], ['Prueba unidad 3', 'Prueba', 30]];
      const upcoming = [['Prueba unidad 4', 'Prueba', 25], ['Presentación final', 'Proyecto', 20]];
      const ev = [];
      plan1.forEach(([name, kind, w], k) => ev.push({ name, kind, w, p: 1, date: `${year}-${String(4 + k).padStart(2, '0')}-${String(10 + k * 3).padStart(2, '0')}`, graded: true }));
      plan2.forEach(([name, kind, w], k) => ev.push({ name, kind, w, p: 2, date: addDays(-60 + k * 25), graded: true }));
      upcoming.forEach(([name, kind, w], k) => ev.push({ name, kind, w, p: 2, date: addDays(3 + Math.floor(rand() * 18) + k * 5), graded: false }));
      for (const e of ev) {
        const { lastInsertRowid } = insEval.run(s.id, e.name, e.kind, e.date, e.w, e.p, null);
        if (!e.graded) continue;
        for (const st of studentIds) {
          let v = st.skill + (rand() - 0.5) * 1.8;
          v = Math.max(2.0, Math.min(7.0, Math.round(v * 10) / 10));
          insGrade.run(Number(lastInsertRowid), st.id, v, t, `${e.date} 15:00:00`);
        }
      }
    }
  });

  const insAnn = db.prepare("INSERT INTO announcements (title, body, course_id, author_id, pinned, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))");
  insAnn.run('Bienvenidos a la nueva plataforma', 'Desde ahora pueden revisar notas, porcentajes de cada evaluación y comunicados en línea. Ingresen con su RUT y la clave que les entregó el colegio.', null, 1, 1, '-2 days');
  insAnn.run('Feria de ciencias y huerto escolar', 'Los invitamos a la feria de ciencias en el huerto del colegio. Cada ambiente presentará sus proyectos de educación cósmica.', null, 1, 0, '-1 days');
  insAnn.run('Salida pedagógica al humedal', 'El curso visitará el humedal. Recuerden enviar la autorización firmada.', courses[0].id, teacherIds[0], 0, '-5 hours');

  console.log('✔ Datos de demostración creados. Clave para todas las cuentas: arrayan2026');
  console.log('  Dirección:  RUT 11.111.111-1');
  console.log(`  Profesor/a: RUT ${db.prepare("SELECT rut FROM users WHERE role='profesor' ORDER BY id LIMIT 1").get().rut}`);
  console.log(`  Apoderado:  RUT ${firstGuardian.rut}`);
});
