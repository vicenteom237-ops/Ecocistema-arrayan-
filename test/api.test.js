'use strict';
// Pruebas de extremo a extremo de la API. Ejecutar con: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrayan-test-'));
let server;

function client() {
  let cookie = '';
  return async function call(method, url, body) {
    const headers = { 'X-Requested-With': 'arrayan' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

before(async () => {
  server = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/status'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('El servidor no inició');
});

after(() => {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const admin = client();
const teacher = client();
const guardian = client();
const ctx = {};

test('configuración inicial crea la cuenta de dirección', async () => {
  let r = await admin('GET', '/api/status');
  assert.equal(r.data.setup_needed, true);
  r = await admin('POST', '/api/setup', { rut: '11.111.111-2', name: 'X', password: '123456' });
  assert.equal(r.status, 400, 'RUT inválido debe rechazarse');
  r = await admin('POST', '/api/setup', { rut: '11.111.111-1', name: 'Directora', password: 'secreta1' });
  assert.equal(r.status, 200);
  r = await admin('POST', '/api/setup', { rut: '22.222.222-2', name: 'Otra', password: 'secreta1' });
  assert.equal(r.status, 403, 'no se puede repetir la configuración');
});

test('cursos por defecto: 5° a 8° básico y 1° medio', async () => {
  const r = await admin('GET', '/api/courses');
  assert.deepEqual(r.data.map((c) => c.name), ['5° Básico', '6° Básico', '7° Básico', '8° Básico', '1° Medio']);
  ctx.course = r.data[0];
  const d = await admin('GET', `/api/courses/${ctx.course.id}`);
  assert.ok(d.data.subjects.length >= 8);
  ctx.subject = d.data.subjects.find((s) => s.name === 'Matemática');
});

test('dirección crea profesor, estudiante y apoderado con clave temporal', async () => {
  let r = await admin('POST', '/api/users', { rut: '12.345.678-5', name: 'Profe Mate', role: 'profesor' });
  assert.equal(r.status, 200);
  assert.match(r.data.temp_password, /^[a-z]+\d{4}$/);
  ctx.teacherId = r.data.id;
  ctx.teacherPass = r.data.temp_password;
  await admin('PUT', `/api/subjects/${ctx.subject.id}`, { teacher_id: ctx.teacherId });

  r = await admin('POST', '/api/students', { first_name: 'Sofía', last_name: 'Pérez', rut: '23.456.789-K', course_id: ctx.course.id });
  assert.equal(r.status, 400, 'RUT de estudiante inválido');
  r = await admin('POST', '/api/students', { first_name: 'Sofía', last_name: 'Pérez', course_id: ctx.course.id });
  ctx.s1 = r.data.id;
  r = await admin('POST', '/api/students', { first_name: 'Mateo', last_name: 'Soto', course_id: ctx.course.id });
  ctx.s2 = r.data.id;

  r = await admin('POST', `/api/students/${ctx.s1}/guardians`, { rut: '9.876.543-3', name: 'Mamá Pérez', relation: 'Madre' });
  assert.equal(r.status, 200);
  ctx.guardianPass = r.data.temp_password;
  assert.ok(ctx.guardianPass);
});

test('profesor ingresa con RUT, debe cambiar la clave y pone notas con porcentaje', async () => {
  let r = await teacher('POST', '/api/login', { rut: '12345678-5', password: 'mala' });
  assert.equal(r.status, 401);
  r = await teacher('POST', '/api/login', { rut: '12.345.678-5', password: ctx.teacherPass });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.must_change, true);
  r = await teacher('POST', '/api/me/password', { current: ctx.teacherPass, password: 'nueva123' });
  assert.equal(r.status, 200);

  r = await teacher('POST', '/api/evaluations', { subject_id: ctx.subject.id, name: 'Prueba 1', weight: 40, period: 1, date: '2026-04-10' });
  ctx.e1 = r.data.id;
  r = await teacher('POST', '/api/evaluations', { subject_id: ctx.subject.id, name: 'Proyecto', weight: 60, period: 1, visible: false });
  ctx.e2 = r.data.id;
  r = await teacher('POST', '/api/evaluations', { subject_id: ctx.subject.id, name: 'Mala', weight: 140, period: 1 });
  assert.equal(r.status, 400, 'porcentaje fuera de rango');

  assert.equal((await teacher('PUT', '/api/grades', { evaluation_id: ctx.e1, student_id: ctx.s1, value: '5,0' })).data.value, 5);
  assert.equal((await teacher('PUT', '/api/grades', { evaluation_id: ctx.e2, student_id: ctx.s1, value: 7 })).data.value, 7);
  assert.equal((await teacher('PUT', '/api/grades', { evaluation_id: ctx.e1, student_id: ctx.s2, value: 7.5 })).status, 400);

  // otra asignatura: sin permiso
  const other = (await admin('GET', `/api/courses/${ctx.course.id}`)).data.subjects.find((s) => s.name !== 'Matemática');
  r = await teacher('POST', '/api/evaluations', { subject_id: other.id, name: 'X', weight: 10, period: 1 });
  assert.equal(r.status, 403);
  r = await teacher('GET', '/api/users');
  assert.equal(r.status, 403, 'profesor no administra usuarios');
});

test('promedio ponderado: 5,0×40% + 7,0×60% = 6,2', async () => {
  const r = await admin('GET', `/api/students/${ctx.s1}/report`);
  const mat = r.data.subjects.find((s) => s.name === 'Matemática');
  assert.equal(mat.periods[0], 6.2);
  assert.equal(mat.annual, 6.2);
  assert.equal(r.data.average, 6.2);
});

test('apoderado solo ve a su pupilo y las evaluaciones publicadas', async () => {
  let r = await guardian('POST', '/api/login', { rut: '98765433', password: ctx.guardianPass });
  assert.equal(r.status, 200);
  r = await guardian('GET', `/api/students/${ctx.s1}/report`);
  assert.equal(r.status, 200);
  const mat = r.data.subjects.find((s) => s.name === 'Matemática');
  assert.equal(mat.evaluations.length, 1, 'la evaluación oculta no aparece');
  assert.equal(mat.periods[0], 5);
  r = await guardian('GET', `/api/students/${ctx.s2}/report`);
  assert.equal(r.status, 403, 'no puede ver a otro estudiante');
  r = await guardian('GET', `/api/gradebook/${ctx.subject.id}`);
  assert.equal(r.status, 403);
  r = await guardian('PUT', '/api/grades', { evaluation_id: ctx.e1, student_id: ctx.s1, value: 7 });
  assert.equal(r.status, 403);
});

test('protección CSRF y respaldo', async () => {
  const res = await fetch(BASE + '/api/logout', { method: 'POST' });
  assert.equal(res.status, 403);
  const r = await admin('GET', '/api/backup');
  assert.equal(r.status, 200);
  const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  assert.equal(data.app, 'ecocistema-arrayan');
  assert.ok(data.tables.grades.length >= 2);
  assert.ok(!('sessions' in data.tables));
});

test('no se puede eliminar la última cuenta de dirección', async () => {
  const users = (await admin('GET', '/api/users')).data;
  const me = users.find((u) => u.role === 'admin');
  const r = await admin('PUT', `/api/users/${me.id}`, { role: 'profesor' });
  assert.equal(r.status, 400);
});
