import { get, post, put, del } from '../api.js';
import { setTitle, navigate, currentQuery, setQuery, state as appState } from '../app.js';
import {
  html, icon, emptyState, modal, formData, field, selectField, toast, confirmDialog, $, $$, avatar, roleName,
  showFormError, showCredentials, fmtDateTime,
} from '../ui.js';
import { attachRutInput, isValid, format as fmtRut } from '../rut.js';
import { clearTeachersCache } from './courses.js';

const TABS = [
  { role: 'profesor', label: 'Profesores', icon: 'book' },
  { role: 'apoderado', label: 'Apoderados', icon: 'heart' },
  { role: 'admin', label: 'Dirección', icon: 'shield' },
];

export default async function users({ el }) {
  setTitle('Usuarios');
  const q = currentQuery();
  let role = q.get('rol') || 'profesor';
  let text = '';
  const all = await get('/api/users');

  el.innerHTML = html`
    <div class="page-head">
      <div><h2>Usuarios y accesos</h2><p class="muted">Cada persona ingresa con su RUT y su clave. Tú controlas quién entra y qué ve.</p></div>
      <button class="btn btn-primary" data-new>${icon('plus')}Nuevo usuario</button>
    </div>
    <div class="seg seg-wide" role="tablist">
      ${TABS.map((t) => html`<button data-role="${t.role}" class="${t.role === role ? 'active' : ''}">${icon(t.icon)}${t.label}<span class="count">${all.filter((u) => u.role === t.role).length}</span></button>`)}
    </div>
    <div class="toolbar"><label class="search">${icon('search')}<input class="input" type="search" placeholder="Buscar por nombre, RUT o correo" data-q></label></div>
    <div class="user-grid" data-list></div>`.s;

  const list = $('[data-list]', el);
  const draw = () => {
    const t = text.toLowerCase();
    const shown = all.filter((u) => u.role === role && (!t || `${u.name} ${u.rut} ${fmtRut(u.rut)} ${u.email || ''}`.toLowerCase().includes(t)));
    list.innerHTML = shown.length ? html`${shown.map((u) => html`
      <article class="user-card ${u.active ? '' : 'inactive'}">
        <div class="user-top">
          ${avatar(u.name)}
          <div><b>${u.name}</b><small>${fmtRut(u.rut)}</small></div>
          ${!u.active ? html`<span class="chip chip-muted">Inactivo</span>` : u.must_change ? html`<span class="chip chip-honey" title="Aún no cambia la clave temporal">Clave temporal</span>` : ''}
        </div>
        <ul class="user-info">
          ${u.email ? html`<li>${icon('mail')}<a href="mailto:${u.email}">${u.email}</a></li>` : ''}
          ${u.phone ? html`<li>${icon('phone')}<a href="tel:${u.phone}">${u.phone}</a></li>` : ''}
          ${u.role === 'apoderado' ? html`<li>${icon('cap')}<span>${u.students.length ? u.students.map((s) => `${s.first_name} ${s.last_name} (${s.course_name || 's/c'})`).join(', ') : 'Sin estudiantes vinculados'}</span></li>` : ''}
          ${u.role === 'profesor' ? html`<li>${icon('book')}<span>${u.subjects.length ? groupSubjects(u.subjects) : 'Sin asignaturas asignadas'}</span></li>` : ''}
          <li>${icon('clock')}<span>${u.last_login ? `Último ingreso: ${fmtDateTime(u.last_login)}` : 'Nunca ha ingresado'}</span></li>
        </ul>
        <div class="user-actions">
          <button class="btn btn-soft btn-sm" data-edit="${u.id}">${icon('edit')}Editar</button>
          <button class="btn btn-ghost btn-sm" data-reset="${u.id}">${icon('key')}Restablecer clave</button>
          ${u.id !== appState.me.id ? html`<button class="icon-btn" data-del="${u.id}" aria-label="Eliminar">${icon('trash')}</button>` : ''}
        </div>
      </article>`)}`.s
      : emptyState('Sin usuarios', `Aún no hay ${TABS.find((x) => x.role === role).label.toLowerCase()} registrados.`, 'users').s;

    $$('[data-edit]', list).forEach((b) => b.addEventListener('click', async () => {
      if (await userModal(all.find((u) => u.id === Number(b.dataset.edit)))) navigate(location.hash);
    }));
    $$('[data-reset]', list).forEach((b) => b.addEventListener('click', async () => {
      const u = all.find((x) => x.id === Number(b.dataset.reset));
      const ok = await confirmDialog({ title: 'Restablecer clave', message: `Se generará una clave temporal nueva para ${u.name}. Su clave actual dejará de funcionar.`, confirm: 'Generar clave', kind: 'btn-primary' });
      if (!ok) return;
      const r = await post(`/api/users/${u.id}/password`, {});
      await showCredentials(u.name, fmtRut(u.rut), r.temp_password);
      navigate(location.hash);
    }));
    $$('[data-del]', list).forEach((b) => b.addEventListener('click', async () => {
      const u = all.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmDialog({ message: `Se eliminará la cuenta de ${u.name}. Sus notas ingresadas se conservan. Si solo quieres bloquear el acceso, edítalo y desactívalo.` }))) return;
      await del(`/api/users/${u.id}`);
      clearTeachersCache();
      toast('Usuario eliminado');
      navigate(location.hash);
    }));
  };
  draw();

  $$('[data-role]', el).forEach((b) => b.addEventListener('click', () => {
    role = b.dataset.role;
    setQuery({ rol: role });
    $$('[data-role]', el).forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));
  $('[data-q]', el).addEventListener('input', (e) => { text = e.target.value; draw(); });
  $('[data-new]', el).addEventListener('click', async () => {
    if (await userModal(null, role)) navigate(location.hash);
  });
  if (q.get('nuevo')) {
    setQuery({ rol: role });
    if (await userModal(null, role)) navigate(location.hash);
  }
}

async function userModal(u = null, defaultRole = 'profesor') {
  const isNew = !u;
  const students = await get('/api/students');
  const linked = new Set((u?.students || []).map((s) => s.id));
  const byCourse = new Map();
  for (const s of students) {
    const k = s.course_name || 'Sin curso';
    if (!byCourse.has(k)) byCourse.set(k, []);
    byCourse.get(k).push(s);
  }

  return modal({
    title: isNew ? 'Nuevo usuario' : `Editar · ${u.name}`,
    wide: true,
    body: html`<form class="form-grid">
      ${selectField({ label: 'Tipo de usuario', name: 'role', value: u?.role || defaultRole, options: [
        { value: 'profesor', label: 'Profesor/a — pone notas en sus asignaturas' },
        { value: 'apoderado', label: 'Apoderado/a — ve las notas de sus pupilos' },
        { value: 'admin', label: 'Dirección — acceso total' },
      ], full: true })}
      ${field({ label: 'Nombre completo', name: 'name', value: u?.name, required: true })}
      ${field({ label: 'RUT', name: 'rut', value: u ? fmtRut(u.rut) : '', required: true, placeholder: '12.345.678-9', attrs: 'data-rut' })}
      ${field({ label: 'Correo', name: 'email', type: 'email', value: u?.email })}
      ${field({ label: 'Teléfono', name: 'phone', type: 'tel', value: u?.phone, placeholder: '+569…' })}
      ${isNew ? field({ label: 'Clave inicial (opcional)', name: 'password', type: 'text', full: true, hint: 'Si la dejas vacía se generará una clave temporal que deberá cambiar al ingresar.' })
        : html`<label class="field full check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><span>Cuenta activa (desmarca para bloquear el acceso sin eliminar la cuenta)</span></label>`}
      <div class="full" data-kids ${(u?.role || defaultRole) === 'apoderado' ? '' : 'hidden'}>
        <h4 class="form-section">${icon('cap')}Pupilos (estudiantes a cargo)</h4>
        ${students.length ? html`<div class="check-groups">${[...byCourse.entries()].map(([course, list]) => html`
          <fieldset><legend>${course}</legend>${list.map((s) => html`
            <label class="check"><input type="checkbox" name="student_ids" data-multi="1" value="${s.id}" ${linked.has(s.id) ? 'checked' : ''}><span>${s.last_name}, ${s.first_name}</span></label>`)}
          </fieldset>`)}</div>` : html`<p class="muted small">Primero agrega estudiantes.</p>`}
      </div>
      <p class="full muted small" data-teacher-hint ${(u?.role || defaultRole) === 'profesor' ? '' : 'hidden'}>${icon('alert')} Las asignaturas se asignan desde <b>Cursos → Asignaturas → Editar</b>.</p>
    </form>`,
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: isNew ? 'Crear usuario' : 'Guardar', kind: 'btn-primary', icon: 'check',
        onClick: async (m) => {
          const d = formData(m);
          if (!isValid(d.rut)) { showFormError(m, 'El RUT no es válido. Revisa el dígito verificador.'); return false; }
          if (d.role !== 'apoderado') delete d.student_ids;
          else d.student_ids = (d.student_ids || []).map(Number);
          if (isNew) {
            if (!d.password) delete d.password;
            const r = await post('/api/users', d);
            clearTeachersCache();
            toast('Usuario creado');
            if (r.temp_password) await showCredentials(d.name, fmtRut(d.rut), r.temp_password);
          } else {
            await put(`/api/users/${u.id}`, d);
            clearTeachersCache();
            toast('Usuario actualizado');
          }
          return true;
        },
      },
    ],
    onMount: (m) => {
      $$('[data-rut]', m).forEach(attachRutInput);
      $('[name=role]', m).addEventListener('change', (e) => {
        $('[data-kids]', m).hidden = e.target.value !== 'apoderado';
        $('[data-teacher-hint]', m).hidden = e.target.value !== 'profesor';
      });
    },
  });
}

function groupSubjects(list) {
  const m = new Map();
  for (const s of list) { if (!m.has(s.name)) m.set(s.name, []); m.get(s.name).push(s.course_name); }
  return [...m.entries()].map(([n, cs]) => `${n} (${cs.join(', ')})`).join(' · ');
}

export { roleName };
