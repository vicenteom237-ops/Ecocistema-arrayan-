'use strict';
const rutLib = require('./rut');
const { hashPassword, verifyPassword, tempPassword, createSessionStore, createLoginLimiter } = require('./auth');
const { weightedAverage, mean } = require('./grades');
const { transaction, SUBJECT_COLORS } = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = 'No tienes permiso para realizar esta acción.') => new HttpError(403, msg);
const notFound = (msg = 'No encontrado.') => new HttpError(404, msg);

// ---------- validación ----------
function str(v, { max = 200, required = false, label = 'Campo' } = {}) {
  if (v == null || String(v).trim() === '') {
    if (required) throw bad(`${label} es obligatorio.`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${label} es demasiado largo (máximo ${max} caracteres).`);
  return s;
}
function int(v, { required = false, label = 'Campo' } = {}) {
  if (v == null || v === '') {
    if (required) throw bad(`${label} es obligatorio.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`${label} no es válido.`);
  return n;
}
function dateStr(v, label = 'Fecha') {
  const s = str(v, { max: 10 });
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`${label} no es válida.`);
  return s;
}
function color(v) {
  const s = str(v, { max: 9 });
  if (s && !/^#[0-9a-fA-F]{6}$/.test(s)) throw bad('Color no válido.');
  return s;
}
function requireRut(v, label = 'RUT') {
  const s = str(v, { max: 14, required: true, label });
  if (!rutLib.isValid(s)) throw bad(`${label} no es válido. Revisa el dígito verificador.`);
  return rutLib.normalize(s);
}
function optionalRut(v, label = 'RUT') {
  const s = str(v, { max: 14 });
  if (!s) return null;
  if (!rutLib.isValid(s)) throw bad(`${label} no es válido. Revisa el dígito verificador.`);
  return rutLib.normalize(s);
}
function password(v) {
  const s = v == null ? '' : String(v);
  if (s.length < 6) throw bad('La clave debe tener al menos 6 caracteres.');
  if (s.length > 100) throw bad('La clave es demasiado larga.');
  return s;
}

function createApi(db) {
  const sessions = createSessionStore(db);
  const limiter = createLoginLimiter();
  const routes = [];

  function route(method, pattern, roles, fn) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, roles, fn });
  }
  const ANY = ['admin', 'profesor', 'apoderado'];
  const STAFF = ['admin', 'profesor'];
  const ADMIN = ['admin'];
  const PUBLIC = null;

  // ---------- settings ----------
  const settingsAll = db.prepare('SELECT key, value FROM settings');
  const settingSet = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  function getSettings() {
    const out = {};
    for (const { key, value } of settingsAll.all()) out[key] = value;
    return {
      ...out,
      grade_min: Number(out.grade_min || 1),
      grade_max: Number(out.grade_max || 7),
      grade_pass: Number(out.grade_pass || 4),
      period_count: Number(out.period_count || 2),
    };
  }

  // ---------- auditoría ----------
  const auditIns = db.prepare('INSERT INTO audit (user_id, user_name, action, detail) VALUES (?, ?, ?, ?)');
  function audit(user, action, detail = '') {
    auditIns.run(user ? user.id : null, user ? user.name : null, action, String(detail).slice(0, 500));
  }

  // ---------- consultas comunes ----------
  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByRut: db.prepare('SELECT * FROM users WHERE rut = ?'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    countAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1"),
    course: db.prepare('SELECT * FROM courses WHERE id = ?'),
    subject: db.prepare('SELECT * FROM subjects WHERE id = ?'),
    student: db.prepare('SELECT * FROM students WHERE id = ?'),
    evaluation: db.prepare('SELECT * FROM evaluations WHERE id = ?'),
    studentsByCourse: db.prepare('SELECT * FROM students WHERE course_id = ? ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE'),
    subjectsByCourse: db.prepare(`SELECT s.*, u.name AS teacher_name FROM subjects s LEFT JOIN users u ON u.id = s.teacher_id
                                  WHERE s.course_id = ? ORDER BY s.sort, s.id`),
    teacherCourseIds: db.prepare('SELECT course_id AS id FROM subjects WHERE teacher_id = ? UNION SELECT id FROM courses WHERE head_teacher_id = ?'),
    guardianStudentIds: db.prepare('SELECT student_id AS id FROM student_guardians WHERE user_id = ?'),
    isGuardianOf: db.prepare('SELECT 1 FROM student_guardians WHERE user_id = ? AND student_id = ?'),
    guardiansOf: db.prepare(`SELECT u.id, u.rut, u.name, u.email, u.phone, sg.relation FROM student_guardians sg
                             JOIN users u ON u.id = sg.user_id WHERE sg.student_id = ? ORDER BY u.name`),
  };

  // ---------- alcance / permisos ----------
  function teacherCourseIds(user) {
    return q.teacherCourseIds.all(user.id, user.id).map((r) => r.id);
  }
  function guardianStudentIds(user) {
    return q.guardianStudentIds.all(user.id).map((r) => r.id);
  }
  function visibleCourseIds(user) {
    if (user.role === 'admin') return db.prepare('SELECT id FROM courses').all().map((r) => r.id);
    if (user.role === 'profesor') return teacherCourseIds(user);
    const ids = guardianStudentIds(user);
    if (!ids.length) return [];
    return [...new Set(ids.map((id) => (q.student.get(id) || {}).course_id).filter(Boolean))];
  }
  function canViewCourse(user, courseId) {
    if (user.role === 'admin') return true;
    if (user.role === 'profesor') return teacherCourseIds(user).includes(courseId);
    return false;
  }
  function canViewSubject(user, subject) {
    if (user.role === 'admin') return true;
    if (user.role !== 'profesor') return false;
    if (subject.teacher_id === user.id) return true;
    const c = q.course.get(subject.course_id);
    return !!c && c.head_teacher_id === user.id;
  }
  function canEditSubject(user, subject) {
    return user.role === 'admin' || (user.role === 'profesor' && subject.teacher_id === user.id);
  }
  function canViewStudent(user, student) {
    if (user.role === 'admin') return true;
    if (user.role === 'profesor') return student.course_id != null && teacherCourseIds(user).includes(student.course_id);
    return !!q.isGuardianOf.get(user.id, student.id);
  }
  function mustGet(stmt, id, label) {
    const row = stmt.get(id);
    if (!row) throw notFound(`${label} no encontrado.`);
    return row;
  }

  // ---------- cálculo de promedios por curso ----------
  function computeCourse(courseId, { onlyVisible = false, studentIds = null } = {}) {
    const settings = getSettings();
    const P = settings.period_count;
    let students = q.studentsByCourse.all(courseId);
    if (studentIds) students = students.filter((s) => studentIds.includes(s.id));
    const subjects = q.subjectsByCourse.all(courseId);
    const evals = db.prepare(`SELECT e.* FROM evaluations e JOIN subjects s ON s.id = e.subject_id
                              WHERE s.course_id = ? ${onlyVisible ? 'AND e.visible = 1' : ''}
                              ORDER BY e.period, COALESCE(e.date, '9999'), e.id`).all(courseId);
    const grades = db.prepare(`SELECT g.evaluation_id, g.student_id, g.value, g.comment, g.updated_at FROM grades g
                               JOIN evaluations e ON e.id = g.evaluation_id JOIN subjects s ON s.id = e.subject_id
                               WHERE s.course_id = ?`).all(courseId);
    const gmap = new Map();
    for (const g of grades) gmap.set(`${g.evaluation_id}:${g.student_id}`, g);

    const evalsBySubject = new Map(subjects.map((s) => [s.id, []]));
    for (const e of evals) if (evalsBySubject.has(e.subject_id)) evalsBySubject.get(e.subject_id).push(e);

    const result = { settings, students: [], subjects: [], evalsBySubject, gmap };
    const subjectAgg = new Map(subjects.map((s) => [s.id, []]));

    for (const st of students) {
      const bySubject = {};
      const periodBuckets = Array.from({ length: P }, () => []);
      const annuals = [];
      for (const sub of subjects) {
        const list = evalsBySubject.get(sub.id);
        const periods = [];
        for (let p = 1; p <= P; p++) {
          const avg = weightedAverage(list.filter((e) => e.period === p), (eid) => {
            const g = gmap.get(`${eid}:${st.id}`);
            return g ? g.value : null;
          });
          periods.push(avg);
          if (avg != null) periodBuckets[p - 1].push(avg);
        }
        const annual = mean(periods);
        if (annual != null) { annuals.push(annual); subjectAgg.get(sub.id).push(annual); }
        bySubject[sub.id] = { periods, annual };
      }
      result.students.push({
        ...st,
        bySubject,
        periods: periodBuckets.map((b) => mean(b)),
        average: mean(annuals),
      });
    }
    for (const sub of subjects) {
      const list = evalsBySubject.get(sub.id);
      const weights = [];
      for (let p = 1; p <= P; p++) weights.push(list.filter((e) => e.period === p).reduce((a, e) => a + (Number(e.weight) || 0), 0));
      result.subjects.push({ ...sub, average: mean(subjectAgg.get(sub.id)), evaluation_count: list.length, weights });
    }
    result.average = mean(result.students.map((s) => s.average));
    return result;
  }

  function publicUser(u) {
    return { id: u.id, rut: u.rut, name: u.name, role: u.role, email: u.email, phone: u.phone, must_change: !!u.must_change };
  }

  function cookie(ctx, token, maxAge) {
    const secure = ctx.secure ? '; Secure' : '';
    ctx.setCookie(`sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  }

  // =====================================================================
  // Público
  // =====================================================================
  route('GET', '/api/status', PUBLIC, () => {
    const s = getSettings();
    return { setup_needed: q.countUsers.get().n === 0, school_name: s.school_name, school_short: s.school_short, motto: s.motto };
  });

  route('POST', '/api/setup', PUBLIC, (ctx) => {
    if (q.countUsers.get().n > 0) throw forbidden('El sistema ya fue configurado.');
    const b = ctx.body;
    const rut = requireRut(b.rut);
    const name = str(b.name, { required: true, label: 'Nombre', max: 120 });
    const pass = password(b.password);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (rut, name, role, email, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(rut, name, 'admin', str(b.email, { max: 120 }), hashPassword(pass));
    if (b.school_name) settingSet.run('school_name', str(b.school_name, { max: 120 }));
    const user = q.userById.get(Number(lastInsertRowid));
    audit(user, 'Configuración inicial', 'Cuenta de dirección creada');
    cookie(ctx, sessions.create(user.id), sessions.maxAgeSeconds);
    return { user: publicUser(user) };
  });

  route('POST', '/api/login', PUBLIC, (ctx) => {
    const b = ctx.body;
    const raw = str(b.rut, { max: 14, required: true, label: 'RUT' });
    const rut = rutLib.normalize(raw);
    const key = `${ctx.ip}|${rut}`;
    if (!limiter.check(key)) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos e inténtalo nuevamente.');
    const user = q.userByRut.get(rut);
    const ok = user && user.active && verifyPassword(String(b.password || ''), user.password_hash);
    if (!ok) {
      limiter.fail(key);
      throw new HttpError(401, 'RUT o clave incorrectos.');
    }
    limiter.reset(key);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    cookie(ctx, sessions.create(user.id), sessions.maxAgeSeconds);
    return { user: publicUser(user) };
  });

  route('POST', '/api/logout', PUBLIC, (ctx) => {
    sessions.destroy(ctx.token);
    cookie(ctx, '', 0);
    return { ok: true };
  });

  // =====================================================================
  // Sesión actual
  // =====================================================================
  route('GET', '/api/me', ANY, (ctx) => {
    const u = ctx.user;
    const out = { user: u, settings: getSettings() };
    if (u.role === 'apoderado') {
      out.students = db.prepare(`SELECT st.id, st.first_name, st.last_name, st.course_id, c.name AS course_name, c.color AS course_color
                                 FROM student_guardians sg JOIN students st ON st.id = sg.student_id
                                 LEFT JOIN courses c ON c.id = st.course_id WHERE sg.user_id = ? ORDER BY st.first_name`).all(u.id);
    }
    return out;
  });

  route('PUT', '/api/me', ANY, (ctx) => {
    const b = ctx.body;
    db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ?')
      .run(str(b.email, { max: 120 }), str(b.phone, { max: 30 }), ctx.user.id);
    return { user: publicUser(q.userById.get(ctx.user.id)) };
  });

  route('POST', '/api/me/password', ANY, (ctx) => {
    const u = q.userById.get(ctx.user.id);
    if (!verifyPassword(String(ctx.body.current || ''), u.password_hash)) throw bad('La clave actual no es correcta.');
    const pass = password(ctx.body.password);
    db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(hashPassword(pass), u.id);
    sessions.destroyAllFor(u.id);
    cookie(ctx, sessions.create(u.id), sessions.maxAgeSeconds);
    audit(ctx.user, 'Cambio de clave', 'Cambió su propia clave');
    return { ok: true };
  });

  // =====================================================================
  // Configuración
  // =====================================================================
  route('GET', '/api/settings', ANY, () => getSettings());

  route('PUT', '/api/settings', ADMIN, (ctx) => {
    const b = ctx.body;
    const text = ['school_name', 'school_short', 'motto', 'address', 'phone', 'email', 'period_label'];
    for (const k of text) if (k in b) settingSet.run(k, str(b[k], { max: 200 }) || '');
    if ('school_year' in b) settingSet.run('school_year', String(int(b.school_year, { required: true, label: 'Año' })));
    const nums = {};
    for (const k of ['grade_min', 'grade_max', 'grade_pass']) {
      if (k in b) {
        const n = Number(b[k]);
        if (!Number.isFinite(n) || n < 0 || n > 100) throw bad('Escala de notas no válida.');
        nums[k] = n;
      }
    }
    const cur = getSettings();
    const min = nums.grade_min ?? cur.grade_min;
    const max = nums.grade_max ?? cur.grade_max;
    const pass = nums.grade_pass ?? cur.grade_pass;
    if (!(min < max) || pass < min || pass > max) throw bad('La escala debe cumplir: mínima < aprobación ≤ máxima.');
    for (const [k, v] of Object.entries(nums)) settingSet.run(k, v.toFixed(1));
    if ('period_count' in b) {
      const n = int(b.period_count, { label: 'Períodos' });
      if (![2, 3, 4].includes(n)) throw bad('Los períodos deben ser 2, 3 o 4.');
      settingSet.run('period_count', String(n));
    }
    audit(ctx.user, 'Configuración', 'Actualizó la configuración del colegio');
    return getSettings();
  });

  // =====================================================================
  // Inicio (panel según rol)
  // =====================================================================
  function upcomingFor(user, days = 45) {
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10);
    const base = `SELECT e.id, e.name, e.kind, e.date, e.weight, e.period, s.id AS subject_id, s.name AS subject_name, s.color AS subject_color,
                         c.id AS course_id, c.name AS course_name, c.color AS course_color
                  FROM evaluations e JOIN subjects s ON s.id = e.subject_id JOIN courses c ON c.id = s.course_id
                  WHERE e.date >= ? AND e.date <= ?`;
    if (user.role === 'admin') return db.prepare(`${base} ORDER BY e.date LIMIT 30`).all(today, until);
    const ids = visibleCourseIds(user);
    if (!ids.length) return [];
    let rows = db.prepare(`${base} AND c.id IN (${ids.map(() => '?').join(',')}) ORDER BY e.date LIMIT 60`).all(today, until, ...ids);
    if (user.role === 'profesor') {
      const mine = new Set(db.prepare('SELECT id FROM subjects WHERE teacher_id = ?').all(user.id).map((r) => r.id));
      const head = new Set(db.prepare('SELECT id FROM courses WHERE head_teacher_id = ?').all(user.id).map((r) => r.id));
      rows = rows.filter((r) => mine.has(r.subject_id) || head.has(r.course_id));
    }
    return rows.slice(0, 30);
  }

  function announcementsFor(user, limit = 20) {
    const base = `SELECT a.*, u.name AS author_name, c.name AS course_name, c.color AS course_color
                  FROM announcements a LEFT JOIN users u ON u.id = a.author_id LEFT JOIN courses c ON c.id = a.course_id`;
    if (user.role === 'admin') return db.prepare(`${base} ORDER BY a.pinned DESC, a.created_at DESC LIMIT ?`).all(limit);
    const ids = visibleCourseIds(user);
    const inList = ids.length ? `OR a.course_id IN (${ids.map(() => '?').join(',')})` : '';
    return db.prepare(`${base} WHERE a.course_id IS NULL ${inList} ORDER BY a.pinned DESC, a.created_at DESC LIMIT ?`).all(...ids, limit);
  }

  route('GET', '/api/home', ANY, (ctx) => {
    const u = ctx.user;
    const settings = getSettings();
    const out = { upcoming: upcomingFor(u), announcements: announcementsFor(u, 5) };

    if (u.role === 'admin') {
      out.counts = {
        students: db.prepare('SELECT COUNT(*) AS n FROM students').get().n,
        courses: db.prepare('SELECT COUNT(*) AS n FROM courses').get().n,
        teachers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'profesor' AND active = 1").get().n,
        guardians: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'apoderado' AND active = 1").get().n,
        evaluations: db.prepare('SELECT COUNT(*) AS n FROM evaluations').get().n,
        grades: db.prepare('SELECT COUNT(*) AS n FROM grades').get().n,
      };
      const courses = db.prepare('SELECT * FROM courses ORDER BY sort, id').all();
      out.courses = [];
      out.support = [];
      for (const c of courses) {
        const r = computeCourse(c.id);
        out.courses.push({ id: c.id, name: c.name, color: c.color, level: c.level, average: r.average, students: r.students.length });
        for (const st of r.students) {
          const low = Object.entries(st.bySubject).filter(([, v]) => v.annual != null && v.annual < settings.grade_pass).length;
          if ((st.average != null && st.average < settings.grade_pass) || low >= 2) {
            out.support.push({ id: st.id, name: `${st.first_name} ${st.last_name}`, course_name: c.name, course_color: c.color, average: st.average, low_subjects: low });
          }
        }
      }
      out.support.sort((a, b) => (a.average ?? 99) - (b.average ?? 99));
      out.support = out.support.slice(0, 8);
      out.recent = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 8').all();
    }

    if (u.role === 'profesor') {
      const subs = db.prepare(`SELECT s.*, c.name AS course_name, c.color AS course_color FROM subjects s JOIN courses c ON c.id = s.course_id
                               WHERE s.teacher_id = ? ORDER BY c.sort, s.sort`).all(u.id);
      const cache = new Map();
      out.subjects = subs.map((s) => {
        if (!cache.has(s.course_id)) cache.set(s.course_id, computeCourse(s.course_id));
        const r = cache.get(s.course_id);
        const info = r.subjects.find((x) => x.id === s.id);
        return { ...s, average: info.average, evaluation_count: info.evaluation_count, weights: info.weights, students: r.students.length };
      });
      out.head_courses = db.prepare('SELECT id, name, color FROM courses WHERE head_teacher_id = ?').all(u.id);
    }

    if (u.role === 'apoderado') {
      const kids = db.prepare(`SELECT st.* , c.name AS course_name, c.color AS course_color FROM student_guardians sg
                               JOIN students st ON st.id = sg.student_id LEFT JOIN courses c ON c.id = st.course_id
                               WHERE sg.user_id = ? ORDER BY st.first_name`).all(u.id);
      out.students = kids.map((k) => {
        let average = null;
        if (k.course_id) average = computeCourse(k.course_id, { onlyVisible: true, studentIds: [k.id] }).students[0]?.average ?? null;
        const latest = db.prepare(`SELECT g.value, g.updated_at, e.name AS evaluation_name, e.weight, e.kind, s.name AS subject_name, s.color AS subject_color
                                   FROM grades g JOIN evaluations e ON e.id = g.evaluation_id JOIN subjects s ON s.id = e.subject_id
                                   WHERE g.student_id = ? AND e.visible = 1 AND s.course_id = ? ORDER BY g.updated_at DESC, e.date DESC LIMIT 6`).all(k.id, k.course_id ?? -1);
        return { id: k.id, first_name: k.first_name, last_name: k.last_name, course_id: k.course_id, course_name: k.course_name, course_color: k.course_color, average, latest };
      });
    }
    return out;
  });

  // =====================================================================
  // Usuarios (solo dirección)
  // =====================================================================
  route('GET', '/api/users', STAFF, (ctx) => {
    const role = ctx.query.get('role');
    if (ctx.user.role !== 'admin' && role !== 'profesor') throw forbidden();
    const where = role ? 'WHERE u.role = ?' : '';
    const rows = db.prepare(`SELECT u.id, u.rut, u.name, u.role, u.email, u.phone, u.active, u.must_change, u.created_at, u.last_login
                             FROM users u ${where} ORDER BY u.role, u.name COLLATE NOCASE`).all(...(role ? [role] : []));
    if (ctx.user.role !== 'admin') return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }));
    const kids = db.prepare(`SELECT sg.user_id, st.id, st.first_name, st.last_name, c.name AS course_name
                             FROM student_guardians sg JOIN students st ON st.id = sg.student_id LEFT JOIN courses c ON c.id = st.course_id`).all();
    const subs = db.prepare(`SELECT s.teacher_id, s.id, s.name, c.name AS course_name FROM subjects s JOIN courses c ON c.id = s.course_id
                             WHERE s.teacher_id IS NOT NULL ORDER BY c.sort, s.sort`).all();
    return rows.map((r) => ({
      ...r,
      students: kids.filter((k) => k.user_id === r.id).map(({ user_id, ...k }) => k),
      subjects: subs.filter((s) => s.teacher_id === r.id).map(({ teacher_id, ...s }) => s),
    }));
  });

  function createUser(actor, b) {
    const rut = requireRut(b.rut);
    if (q.userByRut.get(rut)) throw bad('Ya existe un usuario con ese RUT.');
    const role = ['admin', 'profesor', 'apoderado'].includes(b.role) ? b.role : null;
    if (!role) throw bad('Rol no válido.');
    const name = str(b.name, { required: true, label: 'Nombre', max: 120 });
    let temp = null;
    let pass = b.password ? password(b.password) : null;
    if (!pass) { temp = tempPassword(); pass = temp; }
    const { lastInsertRowid } = db.prepare('INSERT INTO users (rut, name, role, email, phone, password_hash, must_change) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(rut, name, role, str(b.email, { max: 120 }), str(b.phone, { max: 30 }), hashPassword(pass), temp || b.must_change ? 1 : 0);
    audit(actor, 'Usuario creado', `${name} (${role})`);
    return { id: Number(lastInsertRowid), temp_password: temp };
  }

  route('POST', '/api/users', ADMIN, (ctx) => {
    return transaction(db, () => {
      const res = createUser(ctx.user, ctx.body);
      if (Array.isArray(ctx.body.student_ids)) {
        const ins = db.prepare('INSERT OR IGNORE INTO student_guardians (student_id, user_id, relation) VALUES (?, ?, ?)');
        for (const sid of ctx.body.student_ids) ins.run(int(sid), res.id, str(ctx.body.relation, { max: 40 }));
      }
      return res;
    });
  });

  route('PUT', '/api/users/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const u = mustGet(q.userById, id, 'Usuario');
    const b = ctx.body;
    const rut = 'rut' in b ? requireRut(b.rut) : u.rut;
    const other = q.userByRut.get(rut);
    if (other && other.id !== id) throw bad('Ya existe un usuario con ese RUT.');
    const role = 'role' in b ? b.role : u.role;
    if (!['admin', 'profesor', 'apoderado'].includes(role)) throw bad('Rol no válido.');
    const active = 'active' in b ? (b.active ? 1 : 0) : u.active;
    if (u.role === 'admin' && (role !== 'admin' || !active) && q.countAdmins.get().n <= 1) {
      throw bad('Debe existir al menos una cuenta de dirección activa.');
    }
    if (id === ctx.user.id && !active) throw bad('No puedes desactivar tu propia cuenta.');
    db.prepare('UPDATE users SET rut = ?, name = ?, role = ?, email = ?, phone = ?, active = ? WHERE id = ?').run(
      rut,
      'name' in b ? str(b.name, { required: true, label: 'Nombre', max: 120 }) : u.name,
      role,
      'email' in b ? str(b.email, { max: 120 }) : u.email,
      'phone' in b ? str(b.phone, { max: 30 }) : u.phone,
      active,
      id,
    );
    if (Array.isArray(b.student_ids)) {
      db.prepare('DELETE FROM student_guardians WHERE user_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO student_guardians (student_id, user_id) VALUES (?, ?)');
      for (const sid of b.student_ids) ins.run(int(sid), id);
    }
    if (!active) sessions.destroyAllFor(id);
    audit(ctx.user, 'Usuario editado', `${u.name}`);
    return { ok: true };
  });

  route('POST', '/api/users/:id/password', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const u = mustGet(q.userById, id, 'Usuario');
    let temp = null;
    let pass = ctx.body.password ? password(ctx.body.password) : null;
    if (!pass) { temp = tempPassword(); pass = temp; }
    db.prepare('UPDATE users SET password_hash = ?, must_change = ? WHERE id = ?').run(hashPassword(pass), id === ctx.user.id ? 0 : 1, id);
    if (id !== ctx.user.id) sessions.destroyAllFor(id);
    audit(ctx.user, 'Clave restablecida', u.name);
    return { temp_password: temp };
  });

  route('DELETE', '/api/users/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const u = mustGet(q.userById, id, 'Usuario');
    if (id === ctx.user.id) throw bad('No puedes eliminar tu propia cuenta.');
    if (u.role === 'admin' && q.countAdmins.get().n <= 1) throw bad('Debe existir al menos una cuenta de dirección.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    audit(ctx.user, 'Usuario eliminado', `${u.name} (${u.role})`);
    return { ok: true };
  });

  // =====================================================================
  // Cursos
  // =====================================================================
  route('GET', '/api/courses', ANY, (ctx) => {
    const ids = visibleCourseIds(ctx.user);
    if (!ids.length) return [];
    const rows = db.prepare(`SELECT c.*, u.name AS head_teacher_name,
                               (SELECT COUNT(*) FROM students st WHERE st.course_id = c.id) AS student_count,
                               (SELECT COUNT(*) FROM subjects s WHERE s.course_id = c.id) AS subject_count
                             FROM courses c LEFT JOIN users u ON u.id = c.head_teacher_id
                             WHERE c.id IN (${ids.map(() => '?').join(',')}) ORDER BY c.sort, c.id`).all(...ids);
    if (ctx.user.role === 'apoderado') return rows.map(({ id, name, color, level }) => ({ id, name, color, level }));
    return rows.map((c) => ({ ...c, average: computeCourse(c.id).average }));
  });

  route('GET', '/api/courses/:id', STAFF, (ctx) => {
    const id = int(ctx.params.id);
    const c = mustGet(q.course, id, 'Curso');
    if (!canViewCourse(ctx.user, id)) throw forbidden();
    const r = computeCourse(id);
    const head = c.head_teacher_id ? q.userById.get(c.head_teacher_id) : null;
    const guardians = db.prepare(`SELECT sg.student_id, u.id, u.name, u.phone, u.email, sg.relation FROM student_guardians sg
                                  JOIN users u ON u.id = sg.user_id JOIN students st ON st.id = sg.student_id WHERE st.course_id = ?`).all(id);
    return {
      ...c,
      head_teacher_name: head ? head.name : null,
      average: r.average,
      subjects: r.subjects.map((s) => ({ ...s, can_edit: canEditSubject(ctx.user, s), can_view: canViewSubject(ctx.user, s) })),
      students: r.students.map((st) => ({
        id: st.id, rut: st.rut, first_name: st.first_name, last_name: st.last_name, birth_date: st.birth_date, notes: st.notes,
        average: st.average, periods: st.periods, bySubject: st.bySubject,
        guardians: guardians.filter((g) => g.student_id === st.id).map(({ student_id, ...g }) => g),
      })),
      settings: r.settings,
    };
  });

  function courseFields(b, cur = {}) {
    return {
      name: 'name' in b ? str(b.name, { required: true, label: 'Nombre del curso', max: 60 }) : cur.name,
      level: 'level' in b ? str(b.level, { max: 60 }) : cur.level,
      color: 'color' in b ? color(b.color) : cur.color,
      room: 'room' in b ? str(b.room, { max: 60 }) : cur.room,
      sort: 'sort' in b ? int(b.sort) ?? 0 : cur.sort ?? 0,
      head_teacher_id: 'head_teacher_id' in b ? int(b.head_teacher_id) : cur.head_teacher_id ?? null,
    };
  }

  route('POST', '/api/courses', ADMIN, (ctx) => {
    const f = courseFields(ctx.body);
    if (!f.name) throw bad('Nombre del curso es obligatorio.');
    const { lastInsertRowid } = db.prepare('INSERT INTO courses (name, level, color, room, sort, head_teacher_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(f.name, f.level, f.color || '#5E8C4A', f.room, f.sort, f.head_teacher_id);
    const cid = Number(lastInsertRowid);
    if (Array.isArray(ctx.body.subjects)) {
      const ins = db.prepare('INSERT INTO subjects (course_id, name, color, sort) VALUES (?, ?, ?, ?)');
      ctx.body.subjects.forEach((s, i) => {
        const n = str(s, { max: 80 });
        if (n) ins.run(cid, n, SUBJECT_COLORS[i % SUBJECT_COLORS.length], i + 1);
      });
    }
    audit(ctx.user, 'Curso creado', f.name);
    return { id: cid };
  });

  route('PUT', '/api/courses/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const c = mustGet(q.course, id, 'Curso');
    const f = courseFields(ctx.body, c);
    db.prepare('UPDATE courses SET name = ?, level = ?, color = ?, room = ?, sort = ?, head_teacher_id = ? WHERE id = ?')
      .run(f.name, f.level, f.color, f.room, f.sort, f.head_teacher_id, id);
    audit(ctx.user, 'Curso editado', f.name);
    return { ok: true };
  });

  route('DELETE', '/api/courses/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const c = mustGet(q.course, id, 'Curso');
    db.prepare('DELETE FROM courses WHERE id = ?').run(id);
    audit(ctx.user, 'Curso eliminado', c.name);
    return { ok: true };
  });

  // =====================================================================
  // Asignaturas
  // =====================================================================
  route('POST', '/api/subjects', ADMIN, (ctx) => {
    const b = ctx.body;
    const courseId = int(b.course_id, { required: true, label: 'Curso' });
    mustGet(q.course, courseId, 'Curso');
    const name = str(b.name, { required: true, label: 'Nombre de la asignatura', max: 80 });
    const n = db.prepare('SELECT COUNT(*) AS n FROM subjects WHERE course_id = ?').get(courseId).n;
    const { lastInsertRowid } = db.prepare('INSERT INTO subjects (course_id, name, teacher_id, color, sort) VALUES (?, ?, ?, ?, ?)')
      .run(courseId, name, int(b.teacher_id), color(b.color) || SUBJECT_COLORS[n % SUBJECT_COLORS.length], n + 1);
    audit(ctx.user, 'Asignatura creada', name);
    return { id: Number(lastInsertRowid) };
  });

  route('PUT', '/api/subjects/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const s = mustGet(q.subject, id, 'Asignatura');
    const b = ctx.body;
    db.prepare('UPDATE subjects SET name = ?, teacher_id = ?, color = ?, sort = ? WHERE id = ?').run(
      'name' in b ? str(b.name, { required: true, label: 'Nombre', max: 80 }) : s.name,
      'teacher_id' in b ? int(b.teacher_id) : s.teacher_id,
      'color' in b ? color(b.color) || s.color : s.color,
      'sort' in b ? int(b.sort) ?? s.sort : s.sort,
      id,
    );
    audit(ctx.user, 'Asignatura editada', s.name);
    return { ok: true };
  });

  route('DELETE', '/api/subjects/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const s = mustGet(q.subject, id, 'Asignatura');
    db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
    audit(ctx.user, 'Asignatura eliminada', s.name);
    return { ok: true };
  });

  // =====================================================================
  // Estudiantes
  // =====================================================================
  route('GET', '/api/students', STAFF, (ctx) => {
    const courseId = int(ctx.query.get('course_id'));
    const qtext = (ctx.query.get('q') || '').trim().toLowerCase();
    let ids = ctx.user.role === 'admin' ? null : teacherCourseIds(ctx.user);
    if (courseId) ids = ids ? ids.filter((x) => x === courseId) : [courseId];
    let sql = `SELECT st.*, c.name AS course_name, c.color AS course_color FROM students st LEFT JOIN courses c ON c.id = st.course_id`;
    const args = [];
    if (ids) {
      if (!ids.length) return [];
      sql += ` WHERE st.course_id IN (${ids.map(() => '?').join(',')})`;
      args.push(...ids);
    }
    sql += ' ORDER BY c.sort, st.last_name COLLATE NOCASE, st.first_name COLLATE NOCASE';
    let rows = db.prepare(sql).all(...args);
    if (qtext) rows = rows.filter((r) => `${r.first_name} ${r.last_name} ${r.rut || ''}`.toLowerCase().includes(qtext));
    const g = db.prepare(`SELECT sg.student_id, u.id, u.name, u.rut, u.phone, u.email, sg.relation FROM student_guardians sg JOIN users u ON u.id = sg.user_id`).all();
    return rows.map((r) => ({ ...r, guardians: g.filter((x) => x.student_id === r.id).map(({ student_id, ...x }) => x) }));
  });

  function studentFields(b, cur = {}) {
    return {
      rut: 'rut' in b ? optionalRut(b.rut, 'RUT del estudiante') : cur.rut ?? null,
      first_name: 'first_name' in b ? str(b.first_name, { required: true, label: 'Nombres', max: 80 }) : cur.first_name,
      last_name: 'last_name' in b ? str(b.last_name, { required: true, label: 'Apellidos', max: 80 }) : cur.last_name,
      course_id: 'course_id' in b ? int(b.course_id) : cur.course_id ?? null,
      birth_date: 'birth_date' in b ? dateStr(b.birth_date, 'Fecha de nacimiento') : cur.birth_date ?? null,
      notes: 'notes' in b ? str(b.notes, { max: 2000 }) : cur.notes ?? null,
    };
  }
  function checkStudentRut(rut, selfId) {
    if (!rut) return;
    const other = db.prepare('SELECT id FROM students WHERE rut = ?').get(rut);
    if (other && other.id !== selfId) throw bad('Ya existe un estudiante con ese RUT.');
  }

  route('POST', '/api/students', ADMIN, (ctx) => {
    const f = studentFields(ctx.body);
    if (!f.first_name || !f.last_name) throw bad('Nombres y apellidos son obligatorios.');
    checkStudentRut(f.rut);
    const { lastInsertRowid } = db.prepare('INSERT INTO students (rut, first_name, last_name, course_id, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(f.rut, f.first_name, f.last_name, f.course_id, f.birth_date, f.notes);
    audit(ctx.user, 'Estudiante creado', `${f.first_name} ${f.last_name}`);
    return { id: Number(lastInsertRowid) };
  });

  route('POST', '/api/students/import', ADMIN, (ctx) => {
    const courseId = int(ctx.body.course_id, { required: true, label: 'Curso' });
    mustGet(q.course, courseId, 'Curso');
    const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows : [];
    if (!rows.length) throw bad('No hay filas para importar.');
    if (rows.length > 500) throw bad('Máximo 500 estudiantes por importación.');
    return transaction(db, () => {
      const ins = db.prepare('INSERT INTO students (rut, first_name, last_name, course_id) VALUES (?, ?, ?, ?)');
      let created = 0;
      const errors = [];
      rows.forEach((r, i) => {
        try {
          const f = studentFields({ rut: r.rut, first_name: r.first_name, last_name: r.last_name });
          if (!f.first_name || !f.last_name) throw bad('Faltan nombres o apellidos.');
          checkStudentRut(f.rut);
          ins.run(f.rut, f.first_name, f.last_name, courseId);
          created++;
        } catch (e) {
          errors.push(`Fila ${i + 1}: ${e.message}`);
        }
      });
      audit(ctx.user, 'Importación de estudiantes', `${created} estudiantes`);
      return { created, errors };
    });
  });

  route('PUT', '/api/students/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const cur = mustGet(q.student, id, 'Estudiante');
    const f = studentFields(ctx.body, cur);
    checkStudentRut(f.rut, id);
    db.prepare('UPDATE students SET rut = ?, first_name = ?, last_name = ?, course_id = ?, birth_date = ?, notes = ? WHERE id = ?')
      .run(f.rut, f.first_name, f.last_name, f.course_id, f.birth_date, f.notes, id);
    audit(ctx.user, 'Estudiante editado', `${f.first_name} ${f.last_name}`);
    return { ok: true };
  });

  route('DELETE', '/api/students/:id', ADMIN, (ctx) => {
    const id = int(ctx.params.id);
    const s = mustGet(q.student, id, 'Estudiante');
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    audit(ctx.user, 'Estudiante eliminado', `${s.first_name} ${s.last_name}`);
    return { ok: true };
  });

  route('GET', '/api/students/:id/guardians', ADMIN, (ctx) => q.guardiansOf.all(int(ctx.params.id)));

  route('POST', '/api/students/:id/guardians', ADMIN, (ctx) => {
    const sid = int(ctx.params.id);
    const st = mustGet(q.student, sid, 'Estudiante');
    const b = ctx.body;
    return transaction(db, () => {
      let userId = int(b.user_id);
      let temp = null;
      if (!userId) {
        const rut = requireRut(b.rut, 'RUT del apoderado');
        const existing = q.userByRut.get(rut);
        if (existing) {
          userId = existing.id;
        } else {
          const res = createUser(ctx.user, { ...b, rut, role: 'apoderado' });
          userId = res.id;
          temp = res.temp_password;
        }
      }
      const u = mustGet(q.userById, userId, 'Usuario');
      if (u.role !== 'apoderado') throw bad('Ese RUT pertenece a un usuario que no es apoderado.');
      db.prepare('INSERT INTO student_guardians (student_id, user_id, relation) VALUES (?, ?, ?) ON CONFLICT(student_id, user_id) DO UPDATE SET relation = excluded.relation')
        .run(sid, userId, str(b.relation, { max: 40 }));
      audit(ctx.user, 'Apoderado vinculado', `${u.name} → ${st.first_name} ${st.last_name}`);
      return { user_id: userId, temp_password: temp, name: u.name };
    });
  });

  route('DELETE', '/api/students/:id/guardians/:uid', ADMIN, (ctx) => {
    db.prepare('DELETE FROM student_guardians WHERE student_id = ? AND user_id = ?').run(int(ctx.params.id), int(ctx.params.uid));
    audit(ctx.user, 'Apoderado desvinculado', `estudiante #${ctx.params.id}`);
    return { ok: true };
  });

  // Informe de notas de un estudiante
  route('GET', '/api/students/:id/report', ANY, (ctx) => {
    const id = int(ctx.params.id);
    const st = mustGet(q.student, id, 'Estudiante');
    if (!canViewStudent(ctx.user, st)) throw forbidden();
    const course = st.course_id ? q.course.get(st.course_id) : null;
    const settings = getSettings();
    if (!course) return { student: st, course: null, subjects: [], settings, periods: [], average: null };
    const onlyVisible = ctx.user.role === 'apoderado';
    const r = computeCourse(course.id, { onlyVisible, studentIds: [id] });
    const me = r.students[0];
    const head = course.head_teacher_id ? q.userById.get(course.head_teacher_id) : null;
    const subjects = r.subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      color: sub.color,
      teacher_name: sub.teacher_name,
      periods: me.bySubject[sub.id].periods,
      annual: me.bySubject[sub.id].annual,
      evaluations: r.evalsBySubject.get(sub.id).map((e) => {
        const g = r.gmap.get(`${e.id}:${id}`);
        return { id: e.id, name: e.name, kind: e.kind, date: e.date, weight: e.weight, period: e.period, description: e.description,
          visible: !!e.visible, value: g ? g.value : null, comment: g ? g.comment : null };
      }),
    }));
    return {
      student: { id: st.id, rut: st.rut, first_name: st.first_name, last_name: st.last_name, birth_date: st.birth_date },
      course: { id: course.id, name: course.name, color: course.color, level: course.level, head_teacher_name: head ? head.name : null },
      subjects,
      periods: me.periods,
      average: me.average,
      settings,
    };
  });

  // =====================================================================
  // Libro de notas
  // =====================================================================
  route('GET', '/api/gradebook/:subjectId', STAFF, (ctx) => {
    const sid = int(ctx.params.subjectId);
    const sub = mustGet(q.subject, sid, 'Asignatura');
    if (!canViewSubject(ctx.user, sub)) throw forbidden();
    const course = q.course.get(sub.course_id);
    const teacher = sub.teacher_id ? q.userById.get(sub.teacher_id) : null;
    const students = q.studentsByCourse.all(course.id).map((s) => ({ id: s.id, rut: s.rut, first_name: s.first_name, last_name: s.last_name }));
    const evaluations = db.prepare("SELECT * FROM evaluations WHERE subject_id = ? ORDER BY period, COALESCE(date, '9999'), id").all(sid);
    const grades = db.prepare(`SELECT g.evaluation_id, g.student_id, g.value, g.comment FROM grades g
                               JOIN evaluations e ON e.id = g.evaluation_id WHERE e.subject_id = ?`).all(sid);
    const siblings = db.prepare('SELECT id, name, teacher_id, course_id FROM subjects WHERE course_id = ? ORDER BY sort, id').all(course.id)
      .filter((s) => canViewSubject(ctx.user, s)).map((s) => ({ id: s.id, name: s.name }));
    return {
      subject: { ...sub, teacher_name: teacher ? teacher.name : null },
      course: { id: course.id, name: course.name, color: course.color },
      can_edit: canEditSubject(ctx.user, sub),
      students,
      evaluations,
      grades,
      siblings,
      settings: getSettings(),
    };
  });

  function evaluationFields(b, cur = {}) {
    const s = getSettings();
    const f = {
      name: 'name' in b ? str(b.name, { required: true, label: 'Nombre de la evaluación', max: 120 }) : cur.name,
      kind: 'kind' in b ? str(b.kind, { max: 40 }) || 'Sumativa' : cur.kind || 'Sumativa',
      date: 'date' in b ? dateStr(b.date) : cur.date ?? null,
      weight: 'weight' in b ? Number(b.weight) : cur.weight ?? 0,
      period: 'period' in b ? int(b.period) : cur.period ?? 1,
      description: 'description' in b ? str(b.description, { max: 1000 }) : cur.description ?? null,
      visible: 'visible' in b ? (b.visible ? 1 : 0) : cur.visible ?? 1,
    };
    if (!Number.isFinite(f.weight) || f.weight < 0 || f.weight > 100) throw bad('El porcentaje debe estar entre 0 y 100.');
    if (!f.period || f.period < 1 || f.period > s.period_count) throw bad('Período no válido.');
    return f;
  }

  route('POST', '/api/evaluations', STAFF, (ctx) => {
    const sub = mustGet(q.subject, int(ctx.body.subject_id, { required: true, label: 'Asignatura' }), 'Asignatura');
    if (!canEditSubject(ctx.user, sub)) throw forbidden();
    const f = evaluationFields(ctx.body);
    if (!f.name) throw bad('Nombre de la evaluación es obligatorio.');
    const { lastInsertRowid } = db.prepare('INSERT INTO evaluations (subject_id, name, kind, date, weight, period, description, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sub.id, f.name, f.kind, f.date, f.weight, f.period, f.description, f.visible);
    audit(ctx.user, 'Evaluación creada', `${f.name} (${f.weight}%) · ${sub.name}`);
    return { id: Number(lastInsertRowid) };
  });

  route('PUT', '/api/evaluations/:id', STAFF, (ctx) => {
    const ev = mustGet(q.evaluation, int(ctx.params.id), 'Evaluación');
    const sub = q.subject.get(ev.subject_id);
    if (!canEditSubject(ctx.user, sub)) throw forbidden();
    const f = evaluationFields(ctx.body, ev);
    db.prepare('UPDATE evaluations SET name = ?, kind = ?, date = ?, weight = ?, period = ?, description = ?, visible = ? WHERE id = ?')
      .run(f.name, f.kind, f.date, f.weight, f.period, f.description, f.visible, ev.id);
    audit(ctx.user, 'Evaluación editada', `${f.name} (${f.weight}%) · ${sub.name}`);
    return { ok: true };
  });

  route('DELETE', '/api/evaluations/:id', STAFF, (ctx) => {
    const ev = mustGet(q.evaluation, int(ctx.params.id), 'Evaluación');
    const sub = q.subject.get(ev.subject_id);
    if (!canEditSubject(ctx.user, sub)) throw forbidden();
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(ev.id);
    audit(ctx.user, 'Evaluación eliminada', `${ev.name} · ${sub.name}`);
    return { ok: true };
  });

  route('PUT', '/api/grades', STAFF, (ctx) => {
    const b = ctx.body;
    const ev = mustGet(q.evaluation, int(b.evaluation_id, { required: true, label: 'Evaluación' }), 'Evaluación');
    const st = mustGet(q.student, int(b.student_id, { required: true, label: 'Estudiante' }), 'Estudiante');
    const sub = q.subject.get(ev.subject_id);
    if (!canEditSubject(ctx.user, sub)) throw forbidden();
    if (st.course_id !== sub.course_id) throw bad('El estudiante no pertenece a este curso.');
    const s = getSettings();
    if (b.value == null || b.value === '') {
      db.prepare('DELETE FROM grades WHERE evaluation_id = ? AND student_id = ?').run(ev.id, st.id);
      audit(ctx.user, 'Nota eliminada', `${st.first_name} ${st.last_name} · ${ev.name} · ${sub.name}`);
      return { ok: true, value: null };
    }
    const value = Math.round(Number(String(b.value).replace(',', '.')) * 10) / 10;
    if (!Number.isFinite(value) || value < s.grade_min || value > s.grade_max) {
      throw bad(`La nota debe estar entre ${s.grade_min.toFixed(1)} y ${s.grade_max.toFixed(1)}.`);
    }
    const prev = db.prepare('SELECT value FROM grades WHERE evaluation_id = ? AND student_id = ?').get(ev.id, st.id);
    db.prepare(`INSERT INTO grades (evaluation_id, student_id, value, comment, updated_by) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(evaluation_id, student_id) DO UPDATE SET value = excluded.value,
                  comment = COALESCE(excluded.comment, grades.comment), updated_at = datetime('now'), updated_by = excluded.updated_by`)
      .run(ev.id, st.id, value, str(b.comment, { max: 500 }), ctx.user.id);
    if (!prev || prev.value !== value) {
      audit(ctx.user, prev ? 'Nota modificada' : 'Nota ingresada',
        `${st.first_name} ${st.last_name} · ${ev.name} · ${sub.name}: ${prev ? prev.value.toFixed(1) + ' → ' : ''}${value.toFixed(1)}`);
    }
    return { ok: true, value };
  });

  route('GET', '/api/upcoming', ANY, (ctx) => upcomingFor(ctx.user, 120));

  // =====================================================================
  // Comunicados
  // =====================================================================
  route('GET', '/api/announcements', ANY, (ctx) => announcementsFor(ctx.user, 100));

  route('POST', '/api/announcements', STAFF, (ctx) => {
    const b = ctx.body;
    const courseId = int(b.course_id);
    if (ctx.user.role === 'profesor') {
      if (!courseId) throw forbidden('Los profesores solo pueden publicar comunicados para sus cursos.');
      if (!teacherCourseIds(ctx.user).includes(courseId)) throw forbidden();
    }
    if (courseId) mustGet(q.course, courseId, 'Curso');
    const title = str(b.title, { required: true, label: 'Título', max: 150 });
    const { lastInsertRowid } = db.prepare('INSERT INTO announcements (title, body, course_id, author_id, pinned) VALUES (?, ?, ?, ?, ?)')
      .run(title, str(b.body, { max: 5000 }), courseId, ctx.user.id, ctx.user.role === 'admin' && b.pinned ? 1 : 0);
    audit(ctx.user, 'Comunicado publicado', title);
    return { id: Number(lastInsertRowid) };
  });

  route('DELETE', '/api/announcements/:id', STAFF, (ctx) => {
    const a = mustGet(db.prepare('SELECT * FROM announcements WHERE id = ?'), int(ctx.params.id), 'Comunicado');
    if (ctx.user.role !== 'admin' && a.author_id !== ctx.user.id) throw forbidden();
    db.prepare('DELETE FROM announcements WHERE id = ?').run(a.id);
    audit(ctx.user, 'Comunicado eliminado', a.title);
    return { ok: true };
  });

  // =====================================================================
  // Auditoría y respaldos
  // =====================================================================
  route('GET', '/api/audit', ADMIN, (ctx) => {
    const limit = Math.min(int(ctx.query.get('limit')) || 200, 1000);
    return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  });

  const BACKUP_TABLES = ['settings', 'users', 'courses', 'subjects', 'students', 'student_guardians', 'evaluations', 'grades', 'announcements', 'audit'];

  route('GET', '/api/backup', ADMIN, (ctx) => {
    const data = { app: 'ecocistema-arrayan', version: 1, created_at: new Date().toISOString(), tables: {} };
    for (const t of BACKUP_TABLES) data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
    audit(ctx.user, 'Respaldo descargado', '');
    const name = `respaldo-arrayan-${new Date().toISOString().slice(0, 10)}.json`;
    return { __download: { name, type: 'application/json', body: JSON.stringify(data, null, 1) } };
  });

  route('POST', '/api/restore', ADMIN, (ctx) => {
    const data = ctx.body;
    if (!data || data.app !== 'ecocistema-arrayan' || !data.tables) throw bad('El archivo no es un respaldo válido de esta aplicación.');
    const admins = (data.tables.users || []).filter((u) => u.role === 'admin' && u.active);
    if (!admins.length) throw bad('El respaldo no contiene ninguna cuenta de dirección activa.');
    transaction(db, () => {
      db.exec('PRAGMA defer_foreign_keys = ON');
      for (const t of [...BACKUP_TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
      db.exec('DELETE FROM sessions');
      for (const t of BACKUP_TABLES) {
        const rows = data.tables[t] || [];
        if (!rows.length) continue;
        const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
        const use = cols.filter((c) => c in rows[0]);
        const ins = db.prepare(`INSERT INTO ${t} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`);
        for (const r of rows) ins.run(...use.map((c) => (r[c] === undefined ? null : r[c])));
      }
    });
    audit(null, 'Respaldo restaurado', `por ${ctx.user.name}`);
    cookie(ctx, '', 0);
    return { ok: true };
  });

  // =====================================================================
  // Despachador
  // =====================================================================
  async function handle(ctx) {
    const { method, pathname } = ctx;
    let matched = null;
    let methodMismatch = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method) { methodMismatch = true; continue; }
      matched = { r, m };
      break;
    }
    if (!matched) throw new HttpError(methodMismatch ? 405 : 404, 'Ruta no encontrada.');
    const { r, m } = matched;
    ctx.params = {};
    r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
    ctx.user = sessions.lookup(ctx.token);
    if (r.roles) {
      if (!ctx.user) throw new HttpError(401, 'Tu sesión expiró. Ingresa nuevamente.');
      if (!r.roles.includes(ctx.user.role)) throw forbidden();
    }
    return r.fn(ctx);
  }

  return { handle, HttpError };
}

module.exports = { createApi, HttpError };
