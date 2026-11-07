import { get, post, put, del } from '../api.js';
import { setTitle, navigate, currentQuery, setQuery } from '../app.js';
import {
  html, icon, fmtGrade, emptyState, modal, formData, field, selectField, toast, confirmDialog, $, $$, avatar,
  showFormError, showCredentials, raw,
} from '../ui.js';
import { attachRutInput, isValid, format as fmtRut } from '../rut.js';

let coursesCache = null;
async function courseOptions() {
  if (!coursesCache) coursesCache = await get('/api/courses');
  return coursesCache;
}

export default async function students({ el, state }) {
  setTitle('Estudiantes');
  coursesCache = null;
  const isAdmin = state.me.role === 'admin';
  const q = currentQuery();
  const [rows, courses] = await Promise.all([get('/api/students'), courseOptions()]);
  let filterCourse = q.get('curso') || '';
  let text = '';

  el.innerHTML = html`
    <div class="page-head">
      <div><h2>Estudiantes</h2><p class="muted">${rows.length} estudiantes ${isAdmin ? 'en el colegio' : 'en tus cursos'}</p></div>
      ${isAdmin ? html`<button class="btn btn-primary" data-new>${icon('plus')}Nuevo estudiante</button>` : ''}
    </div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input class="input" type="search" placeholder="Buscar por nombre o RUT" data-q></label>
      <div class="chips-scroll" data-filter>
        <button class="chip-btn ${!filterCourse ? 'active' : ''}" data-c="">Todos</button>
        ${courses.map((c) => html`<button class="chip-btn ${String(c.id) === filterCourse ? 'active' : ''}" data-c="${c.id}" style="--c:${c.color}"><i class="dot"></i>${c.name}</button>`)}
      </div>
    </div>
    <div class="card flush"><ul class="people-list big" data-list></ul></div>`.s;

  const list = $('[data-list]', el);
  const draw = () => {
    const t = text.toLowerCase();
    const shown = rows.filter((r) => (!filterCourse || String(r.course_id) === filterCourse)
      && (!t || `${r.first_name} ${r.last_name} ${r.rut || ''}`.toLowerCase().includes(t)));
    list.innerHTML = shown.length ? html`${shown.map((st) => html`<li>
      <a href="#/informe/${st.id}">
        ${avatar(`${st.first_name} ${st.last_name}`, st.course_color)}
        <span><b>${st.last_name}, ${st.first_name}</b>
          <small><i class="dot" style="--c:${st.course_color || '#bbb'}"></i>${st.course_name || 'Sin curso'} · ${st.rut || 'Sin RUT'}</small>
          <small class="muted">${st.guardians.length ? html`${icon('heart')} ${st.guardians.map((g) => g.name).join(', ')}` : 'Sin apoderado vinculado'}</small></span>
        ${icon('chevronRight', 'muted')}
      </a>
      ${isAdmin ? html`<button class="icon-btn" data-edit="${st.id}" aria-label="Editar">${icon('edit')}</button>` : ''}
    </li>`)}`.s : emptyState('Sin resultados', 'No hay estudiantes que coincidan con la búsqueda.', 'search').s;
    $$('[data-edit]', list).forEach((b) => b.addEventListener('click', async () => {
      const st = rows.find((r) => r.id === Number(b.dataset.edit));
      if (await studentModal(st)) navigate(location.hash);
    }));
  };
  draw();

  $('[data-q]', el).addEventListener('input', (e) => { text = e.target.value; draw(); });
  $$('[data-c]', el).forEach((b) => b.addEventListener('click', () => {
    filterCourse = b.dataset.c;
    setQuery(filterCourse ? { curso: filterCourse } : {});
    $$('[data-c]', el).forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));
  $('[data-new]', el)?.addEventListener('click', async () => {
    if (await studentModal({ course_id: filterCourse ? Number(filterCourse) : null })) navigate('#/estudiantes' + (filterCourse ? `?curso=${filterCourse}` : ''));
  });
  if (isAdmin && q.get('nuevo')) {
    setQuery({});
    if (await studentModal({})) navigate('#/estudiantes');
  }
}

export async function studentModal(st = {}) {
  const courses = await courseOptions();
  const isNew = !st.id;
  let guardians = st.guardians || [];
  const apoderados = await get('/api/users?role=apoderado');

  const guardianList = () => html`${guardians.length ? html`<ul class="mini-list">${guardians.map((g) => html`
      <li>${avatar(g.name)}<span><b>${g.name}</b><small>${g.relation || 'Apoderado/a'}${g.phone ? ` · ${g.phone}` : ''}</small></span>
      <button type="button" class="icon-btn" data-unlink="${g.id}" aria-label="Desvincular">${icon('x')}</button></li>`)}</ul>`
    : html`<p class="muted small">Aún no tiene apoderados vinculados.</p>`}`;

  return modal({
    title: isNew ? 'Nuevo estudiante' : `${st.first_name} ${st.last_name}`,
    wide: true,
    body: html`<form class="form-grid">
      <h4 class="full form-section">${icon('cap')}Datos del estudiante</h4>
      ${field({ label: 'Nombres', name: 'first_name', value: st.first_name, required: true })}
      ${field({ label: 'Apellidos', name: 'last_name', value: st.last_name, required: true })}
      ${field({ label: 'RUT', name: 'rut', value: st.rut ? fmtRut(st.rut) : '', placeholder: '12.345.678-9', attrs: 'data-rut' })}
      ${selectField({ label: 'Curso', name: 'course_id', value: st.course_id, options: [{ value: '', label: '— Sin curso —' }, ...courses.map((c) => ({ value: c.id, label: c.name }))] })}
      ${field({ label: 'Fecha de nacimiento', name: 'birth_date', type: 'date', value: st.birth_date })}
      <label class="field full"><span class="field-label">Observaciones</span><textarea class="input" name="notes" rows="2" placeholder="Información relevante (opcional)">${st.notes || ''}</textarea></label>

      <h4 class="full form-section">${icon('heart')}Apoderados</h4>
      <div class="full" data-guardians>${guardianList()}</div>
      <div class="full sub-box">
        <p class="small"><b>Vincular apoderado</b> — elige uno existente o escribe el RUT de uno nuevo (se le creará su acceso).</p>
        <div class="form-grid">
          ${selectField({ label: 'Apoderado existente', name: 'g_user_id', full: true, options: [{ value: '', label: '— Ninguno / crear nuevo —' }, ...apoderados.map((a) => ({ value: a.id, label: `${a.name} (${fmtRut(a.rut)})` }))] })}
          ${field({ label: 'RUT apoderado nuevo', name: 'g_rut', placeholder: '12.345.678-9', attrs: 'data-rut' })}
          ${field({ label: 'Nombre completo', name: 'g_name' })}
          ${field({ label: 'Teléfono', name: 'g_phone', type: 'tel', placeholder: '+569…' })}
          ${field({ label: 'Correo', name: 'g_email', type: 'email' })}
          ${selectField({ label: 'Parentesco', name: 'g_relation', options: ['Madre', 'Padre', 'Abuela/o', 'Tía/o', 'Tutor/a legal', 'Otro'].map((x) => ({ value: x, label: x })) })}
        </div>
      </div>
    </form>`,
    actions: [
      ...(isNew ? [] : [{ label: 'Eliminar', kind: 'btn-danger-ghost', icon: 'trash', onClick: async () => {
        if (!(await confirmDialog({ message: `Se eliminará a ${st.first_name} ${st.last_name} y todas sus notas.` }))) return false;
        await del(`/api/students/${st.id}`);
        toast('Estudiante eliminado');
        return true;
      } }]),
      { label: 'Cancelar', value: null },
      {
        label: isNew ? 'Crear estudiante' : 'Guardar cambios', kind: 'btn-primary', icon: 'check',
        onClick: async (m) => {
          const d = formData(m);
          if (d.rut && !isValid(d.rut)) { showFormError(m, 'El RUT del estudiante no es válido.'); return false; }
          if (d.g_rut && !isValid(d.g_rut)) { showFormError(m, 'El RUT del apoderado no es válido.'); return false; }
          if (d.g_rut && !d.g_user_id && !d.g_name) { showFormError(m, 'Escribe el nombre del apoderado nuevo.'); return false; }
          const payload = { first_name: d.first_name, last_name: d.last_name, rut: d.rut, course_id: d.course_id, birth_date: d.birth_date, notes: d.notes };
          let id = st.id;
          if (isNew) id = (await post('/api/students', payload)).id; else await put(`/api/students/${id}`, payload);
          let creds = null;
          if (d.g_user_id || d.g_rut) {
            const r = await post(`/api/students/${id}/guardians`, d.g_user_id
              ? { user_id: d.g_user_id, relation: d.g_relation }
              : { rut: d.g_rut, name: d.g_name, phone: d.g_phone, email: d.g_email, relation: d.g_relation });
            if (r.temp_password) creds = [r.name, fmtRut(d.g_rut), r.temp_password];
          }
          toast(isNew ? 'Estudiante creado' : 'Cambios guardados');
          if (creds) setTimeout(() => showCredentials(...creds), 200);
          return true;
        },
      },
    ],
    onMount: (m) => {
      $$('[data-rut]', m).forEach(attachRutInput);
      const bindUnlink = () => $$('[data-unlink]', m).forEach((b) => b.addEventListener('click', async () => {
        const uid = Number(b.dataset.unlink);
        await del(`/api/students/${st.id}/guardians/${uid}`);
        guardians = guardians.filter((g) => g.id !== uid);
        $('[data-guardians]', m).innerHTML = guardianList().s;
        bindUnlink();
        toast('Apoderado desvinculado');
      }));
      bindUnlink();
    },
  });
}

// Importar lista pegada desde Excel / Google Sheets
export async function importModal(course) {
  return modal({
    title: `Pegar lista · ${course.name}`,
    wide: true,
    body: html`<form>
      <p class="muted">Copia desde Excel o Google Sheets las columnas <b>RUT</b>, <b>Nombres</b> y <b>Apellidos</b> (una fila por estudiante) y pégalas aquí. El RUT es opcional.</p>
      <textarea class="input mono" name="rows" rows="10" placeholder="${raw('12.345.678-5\tSofía Antonia\tPérez Rojas\n\tMateo\tGonzález Silva')}"></textarea>
      <div class="import-preview" data-preview></div>
    </form>`,
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'Importar', kind: 'btn-primary', icon: 'upload',
        onClick: async (m) => {
          const rows = parseRows($('[name=rows]', m).value);
          if (!rows.length) { showFormError(m, 'Pega al menos una fila.'); return false; }
          const r = await post('/api/students/import', { course_id: course.id, rows });
          toast(`${r.created} estudiantes importados`);
          if (r.errors.length) {
            await modal({ title: 'Algunas filas no se importaron', body: html`<ul class="err-list">${r.errors.map((e) => html`<li>${e}</li>`)}</ul>`, actions: [{ label: 'Entendido', kind: 'btn-primary' }] });
          }
          return true;
        },
      },
    ],
    onMount: (m) => {
      const ta = $('[name=rows]', m);
      ta.addEventListener('input', () => {
        const rows = parseRows(ta.value);
        $('[data-preview]', m).innerHTML = rows.length ? html`<p class="small"><b>${rows.length}</b> estudiantes detectados. Ej: ${rows[0].first_name} ${rows[0].last_name}${rows[0].rut ? ` (${rows[0].rut})` : ''}</p>`.s : '';
      });
    },
  });
}

function parseRows(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    let cols = line.split('\t');
    if (cols.length < 2) cols = line.split(/;|,(?=\s*[A-Za-zÁÉÍÓÚÑáéíóúñ])/);
    cols = cols.map((c) => c.trim());
    let rut = '';
    if (cols.length && /\d/.test(cols[0]) && /^[\d.\-kK\s]+$/.test(cols[0])) rut = cols.shift();
    else if (cols.length && cols[0] === '') cols.shift();
    let [first = '', last = ''] = cols;
    if (!last && first.includes(' ')) {
      const parts = first.split(/\s+/);
      last = parts.slice(-2).join(' ');
      first = parts.slice(0, -2).join(' ') || parts[0];
    }
    return { rut, first_name: first, last_name: last };
  }).filter((r) => r.first_name);
}
