import { get, post, put, del } from '../api.js';
import { setTitle, navigate, currentQuery, setQuery } from '../app.js';
import {
  html, icon, fmtGrade, gradeClass, emptyState, modal, formData, field, selectField, toast, confirmDialog,
  $, $$, avatar, periodName,
} from '../ui.js';
import { studentModal, importModal } from './students.js';

const BEAD_COLORS = [
  { value: '#D9534F', label: 'Rojo (perla 1)' }, { value: '#5E8C4A', label: 'Verde (perla 2)' },
  { value: '#E8A5A0', label: 'Rosado (perla 3)' }, { value: '#E2B04A', label: 'Amarillo (perla 4)' },
  { value: '#5DA9D6', label: 'Celeste (perla 5)' }, { value: '#9B7FC1', label: 'Lila (perla 6)' },
  { value: '#B9A98F', label: 'Perla (perla 7)' }, { value: '#8B5E3C', label: 'Café (perla 8)' },
  { value: '#2F5D8A', label: 'Azul (perla 9)' },
];

let teachersCache = null;
export async function teachers() {
  if (!teachersCache) teachersCache = await get('/api/users?role=profesor');
  return teachersCache;
}
export function clearTeachersCache() { teachersCache = null; }

export default async function courses(ctx) {
  if (ctx.view === 'detail') return detail(ctx);
  return list(ctx);
}

async function list({ el, state }) {
  const isAdmin = state.me.role === 'admin';
  setTitle(isAdmin ? 'Cursos' : 'Mis cursos');
  const rows = await get('/api/courses');
  const s = state.settings;
  el.innerHTML = html`
    <div class="page-head">
      <div><h2>${isAdmin ? 'Cursos del colegio' : 'Mis cursos'}</h2><p class="muted">Cada curso lleva el color de su perla en la escalera de perlas Montessori.</p></div>
      ${isAdmin ? html`<button class="btn btn-primary" data-new>${icon('plus')}Nuevo curso</button>` : ''}
    </div>
    ${rows.length ? html`<div class="course-grid">${rows.map((c) => html`
      <a class="course-tile" href="#/cursos/${c.id}" style="--c:${c.color}">
        <div class="course-tile-top">
          <span class="bead-chain">${Array.from({ length: Math.min(9, Math.max(1, parseInt(c.name, 10) || 5)) }, () => html`<i></i>`)}</span>
          <span class="grade ${gradeClass(c.average, s)}">${fmtGrade(c.average)}</span>
        </div>
        <h3>${c.name}</h3>
        <p class="muted">${c.level || ''}${c.room ? ` · Sala ${c.room}` : ''}</p>
        <div class="course-tile-meta">
          <span>${icon('cap')}${c.student_count} estudiantes</span>
          <span>${icon('book')}${c.subject_count} asignaturas</span>
        </div>
        <div class="course-tile-foot">${icon('user')}<span>${c.head_teacher_name ? `Prof. jefe: ${c.head_teacher_name}` : 'Sin profesor/a jefe'}</span></div>
      </a>`)}</div>`
      : emptyState('Sin cursos', isAdmin ? 'Crea el primer curso para comenzar.' : 'Aún no tienes cursos asignados.', 'grid')}`.s;
  $('[data-new]', el)?.addEventListener('click', async () => {
    if (await courseModal()) navigate('#/cursos');
  });
}

export async function courseModal(course = null) {
  const ts = await teachers();
  const isNew = !course;
  return modal({
    title: isNew ? 'Nuevo curso' : `Editar ${course.name}`,
    body: html`<form class="form-grid">
      ${field({ label: 'Nombre', name: 'name', value: course?.name, required: true, placeholder: 'Ej: 5° Básico' })}
      ${field({ label: 'Ciclo / ambiente', name: 'level', value: course?.level, placeholder: 'Ej: Taller II' })}
      ${selectField({ label: 'Profesor/a jefe', name: 'head_teacher_id', value: course?.head_teacher_id, options: [{ value: '', label: '— Sin asignar —' }, ...ts.map((t) => ({ value: t.id, label: t.name }))] })}
      ${field({ label: 'Sala', name: 'room', value: course?.room })}
      ${selectField({ label: 'Color', name: 'color', value: course?.color || '#5DA9D6', options: BEAD_COLORS })}
      ${field({ label: 'Orden', name: 'sort', type: 'number', value: course?.sort ?? 10 })}
      ${isNew ? html`<label class="field full check"><input type="checkbox" name="with_subjects" checked><span>Crear con las asignaturas habituales (Lenguaje, Matemática, Ciencias, Historia, Inglés, Artes, Música, Tecnología, Ed. Física)</span></label>` : ''}
    </form>`,
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: isNew ? 'Crear curso' : 'Guardar', kind: 'btn-primary', icon: 'check',
        onClick: async (m) => {
          const d = formData(m);
          if (isNew && d.with_subjects) {
            d.subjects = ['Lenguaje y Comunicación', 'Matemática', 'Ciencias Naturales', 'Historia, Geografía y Cs. Sociales', 'Inglés', 'Artes Visuales', 'Música', 'Tecnología', 'Educación Física y Salud'];
          }
          delete d.with_subjects;
          if (isNew) await post('/api/courses', d); else await put(`/api/courses/${course.id}`, d);
          toast(isNew ? 'Curso creado' : 'Curso actualizado');
          return true;
        },
      },
    ],
  });
}

export async function subjectModal(courseId, subject = null) {
  const ts = await teachers();
  const isNew = !subject;
  return modal({
    title: isNew ? 'Nueva asignatura' : `Editar ${subject.name}`,
    body: html`<form class="form-grid">
      ${field({ label: 'Nombre', name: 'name', value: subject?.name, required: true, full: true })}
      ${selectField({ label: 'Profesor/a a cargo', name: 'teacher_id', value: subject?.teacher_id, full: true,
        hint: 'El profesor/a podrá crear evaluaciones y poner notas en esta asignatura.',
        options: [{ value: '', label: '— Sin asignar —' }, ...ts.map((t) => ({ value: t.id, label: t.name }))] })}
      ${field({ label: 'Color', name: 'color', type: 'color', value: subject?.color || '#5E8C4A' })}
      ${field({ label: 'Orden', name: 'sort', type: 'number', value: subject?.sort ?? 99 })}
    </form>`,
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: isNew ? 'Agregar' : 'Guardar', kind: 'btn-primary', icon: 'check',
        onClick: async (m) => {
          const d = formData(m);
          if (isNew) await post('/api/subjects', { ...d, course_id: courseId }); else await put(`/api/subjects/${subject.id}`, d);
          toast(isNew ? 'Asignatura agregada' : 'Asignatura actualizada');
          return true;
        },
      },
    ],
  });
}

async function detail({ el, params, state }) {
  const id = Number(params.id);
  const c = await get(`/api/courses/${id}`);
  const s = c.settings;
  const isAdmin = state.me.role === 'admin';
  setTitle(c.name, { back: '#/cursos', subtitle: c.level || '' });
  const tab = currentQuery().get('tab') || 'asignaturas';

  el.innerHTML = html`
    <section class="course-hero" style="--c:${c.color}">
      <div class="course-hero-main">
        <span class="bead-chain big">${Array.from({ length: Math.min(9, Math.max(1, parseInt(c.name, 10) || 5)) }, () => html`<i></i>`)}</span>
        <h2>${c.name}</h2>
        <p>${c.level || ''}${c.room ? ` · Sala ${c.room}` : ''} · ${c.head_teacher_name ? `Profesor/a jefe: ${c.head_teacher_name}` : 'Sin profesor/a jefe'}</p>
      </div>
      <div class="course-hero-stats">
        <div><b>${c.students.length}</b><span>Estudiantes</span></div>
        <div><b>${c.subjects.length}</b><span>Asignaturas</span></div>
        <div><b class="grade ${gradeClass(c.average, s)}">${fmtGrade(c.average)}</b><span>Promedio</span></div>
      </div>
      ${isAdmin ? html`<div class="course-hero-actions">
        <button class="btn btn-light btn-sm" data-edit-course>${icon('edit')}Editar curso</button>
        <button class="btn btn-light btn-sm" data-del-course>${icon('trash')}Eliminar</button>
      </div>` : ''}
    </section>

    <div class="seg seg-wide" role="tablist">
      <button data-tab="asignaturas" class="${tab === 'asignaturas' ? 'active' : ''}">${icon('book')}Asignaturas</button>
      <button data-tab="estudiantes" class="${tab === 'estudiantes' ? 'active' : ''}">${icon('cap')}Estudiantes</button>
      <button data-tab="resumen" class="${tab === 'resumen' ? 'active' : ''}">${icon('table')}Resumen de notas</button>
    </div>
    <div id="tab-body"></div>`.s;

  const body = $('#tab-body', el);
  const show = (t) => {
    setQuery(t === 'asignaturas' ? {} : { tab: t });
    $$('.seg button', el).forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    if (t === 'asignaturas') renderSubjects(body, c, isAdmin, s);
    else if (t === 'estudiantes') renderStudents(body, c, isAdmin, s);
    else renderSummary(body, c, s);
  };
  $$('.seg button', el).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(tab);

  $('[data-edit-course]', el)?.addEventListener('click', async () => {
    if (await courseModal(c)) navigate(location.hash);
  });
  $('[data-del-course]', el)?.addEventListener('click', async () => {
    const ok = await confirmDialog({ message: `Se eliminará ${c.name} junto con sus asignaturas, evaluaciones y notas. Los estudiantes quedarán sin curso. Esta acción no se puede deshacer.` });
    if (!ok) return;
    await del(`/api/courses/${id}`);
    toast('Curso eliminado');
    navigate('#/cursos');
  });
}

function renderSubjects(body, c, isAdmin, s) {
  body.innerHTML = html`
    <div class="section-head"><h3>Asignaturas</h3>${isAdmin ? html`<button class="btn btn-soft btn-sm" data-add-subject>${icon('plus')}Agregar asignatura</button>` : ''}</div>
    ${c.subjects.length ? html`<div class="subject-grid">${c.subjects.map((sub) => html`
      <article class="subject-card" style="--c:${sub.color}">
        <div class="subject-top">
          <span class="subject-dot"></span>
          <span class="grade ${gradeClass(sub.average, s)}">${fmtGrade(sub.average)}</span>
        </div>
        <b>${sub.name}</b>
        <small>${sub.teacher_name ? html`${icon('user')}${sub.teacher_name}` : html`<i class="muted">Sin profesor/a asignado</i>`}</small>
        <div class="weights">${sub.weights.map((wt, i) => html`
          <div class="weight-row"><span>${periodName(s, i + 1)}</span><div class="bar"><i style="width:${Math.min(wt, 100)}%" class="${wt > 100 ? 'over' : wt === 100 ? 'full' : ''}"></i></div><em>${wt}%</em></div>`)}</div>
        <div class="subject-actions">
          ${sub.can_view ? html`<a class="btn btn-primary btn-sm" href="#/notas/${sub.id}">${icon('clipboard')}${sub.can_edit ? 'Libro de notas' : 'Ver notas'}</a>` : ''}
          ${isAdmin ? html`<button class="icon-btn" data-edit-subject="${sub.id}" aria-label="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-del-subject="${sub.id}" aria-label="Eliminar">${icon('trash')}</button>` : ''}
        </div>
      </article>`)}</div>` : emptyState('Sin asignaturas', 'Agrega las asignaturas de este curso.', 'book')}`.s;

  $('[data-add-subject]', body)?.addEventListener('click', async () => {
    if (await subjectModal(c.id)) navigate(location.hash);
  });
  $$('[data-edit-subject]', body).forEach((b) => b.addEventListener('click', async () => {
    const sub = c.subjects.find((x) => x.id === Number(b.dataset.editSubject));
    if (await subjectModal(c.id, sub)) navigate(location.hash);
  }));
  $$('[data-del-subject]', body).forEach((b) => b.addEventListener('click', async () => {
    const sub = c.subjects.find((x) => x.id === Number(b.dataset.delSubject));
    if (!(await confirmDialog({ message: `Se eliminará ${sub.name} con todas sus evaluaciones y notas.` }))) return;
    await del(`/api/subjects/${sub.id}`);
    toast('Asignatura eliminada');
    navigate(location.hash);
  }));
}

function renderStudents(body, c, isAdmin, s) {
  body.innerHTML = html`
    <div class="section-head"><h3>Estudiantes (${c.students.length})</h3>
      ${isAdmin ? html`<div class="btn-row">
        <button class="btn btn-soft btn-sm" data-import>${icon('upload')}Pegar lista</button>
        <button class="btn btn-primary btn-sm" data-add-student>${icon('plus')}Agregar estudiante</button>
      </div>` : ''}
    </div>
    ${c.students.length ? html`<div class="card flush"><ul class="people-list big">${c.students.map((st, i) => html`
      <li>
        <a href="#/informe/${st.id}">
          <span class="num">${i + 1}</span>
          ${avatar(`${st.first_name} ${st.last_name}`, c.color)}
          <span><b>${st.last_name}, ${st.first_name}</b>
            <small>${st.rut || 'Sin RUT'} · ${st.guardians.length ? st.guardians.map((g) => g.name).join(', ') : 'Sin apoderado vinculado'}</small></span>
          <span class="grade ${gradeClass(st.average, s)}">${fmtGrade(st.average)}</span>
        </a>
        ${isAdmin ? html`<button class="icon-btn" data-edit-student="${st.id}" aria-label="Editar">${icon('edit')}</button>` : ''}
      </li>`)}</ul></div>` : emptyState('Sin estudiantes', 'Agrega estudiantes uno a uno o pega una lista desde Excel.', 'cap')}`.s;

  $('[data-add-student]', body)?.addEventListener('click', async () => {
    if (await studentModal({ course_id: c.id })) navigate(location.hash);
  });
  $('[data-import]', body)?.addEventListener('click', async () => {
    if (await importModal(c)) navigate(location.hash);
  });
  $$('[data-edit-student]', body).forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const st = c.students.find((x) => x.id === Number(b.dataset.editStudent));
    if (await studentModal({ ...st, course_id: c.id })) navigate(location.hash);
  }));
}

function renderSummary(body, c, s) {
  const P = s.period_count;
  let period = 0; // 0 = anual
  const draw = () => {
    const val = (st, sub) => {
      const r = st.bySubject[sub.id];
      if (!r) return null;
      return period ? r.periods[period - 1] : r.annual;
    };
    const general = (st) => (period ? st.periods[period - 1] : st.average);
    body.innerHTML = html`
      <div class="section-head">
        <h3>Resumen de notas</h3>
        <div class="seg seg-sm">
          <button data-p="0" class="${period === 0 ? 'active' : ''}">Anual</button>
          ${Array.from({ length: P }, (_, i) => html`<button data-p="${i + 1}" class="${period === i + 1 ? 'active' : ''}">${i + 1}° ${s.period_label.slice(0, 3)}.</button>`)}
        </div>
      </div>
      ${c.students.length && c.subjects.length ? html`<div class="table-wrap"><table class="sheet">
        <thead><tr><th class="sticky">Estudiante</th>${c.subjects.map((sub) => html`<th title="${sub.name}"><span class="vert" style="--c:${sub.color}">${sub.name}</span></th>`)}<th class="avg-col">Promedio</th></tr></thead>
        <tbody>${c.students.map((st) => html`<tr>
          <th class="sticky"><a href="#/informe/${st.id}">${st.last_name}, ${st.first_name}</a></th>
          ${c.subjects.map((sub) => { const v = val(st, sub); return html`<td class="${gradeClass(v, s)}">${fmtGrade(v)}</td>`; })}
          <td class="avg-col ${gradeClass(general(st), s)}"><b>${fmtGrade(general(st))}</b></td>
        </tr>`)}</tbody>
      </table></div>
      <p class="legend"><span class="g-pass">Azul</span>: igual o sobre ${fmtGrade(s.grade_pass)} · <span class="g-fail">Rojo</span>: bajo ${fmtGrade(s.grade_pass)}</p>`
      : emptyState('Sin datos', 'Agrega estudiantes y asignaturas para ver el resumen.', 'table')}`.s;
    $$('[data-p]', body).forEach((b) => b.addEventListener('click', () => { period = Number(b.dataset.p); draw(); }));
  };
  draw();
}
