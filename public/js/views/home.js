import { get } from '../api.js';
import { setTitle } from '../app.js';
import { html, icon, fmtGrade, gradeClass, fmtDate, relDays, dayBox, emptyState, fmtDateTime, $$, avatar } from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function todayLong() {
  return new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function banner(state, extra = '') {
  const first = state.me.name.split(' ')[0];
  return html`<section class="hello">
    <div>
      <span class="eyebrow">${todayLong()}</span>
      <h2>${greeting()}, ${first}</h2>
      <p>${state.settings.school_name} · Año escolar ${state.settings.school_year}</p>
      ${extra}
    </div>
    <div class="hello-art" aria-hidden="true">
      <span class="bead b1"></span><span class="bead b2"></span><span class="bead b3"></span><span class="bead b4"></span><span class="bead b5"></span>
    </div>
  </section>`;
}

export function upcomingList(items, { showCourse = true, limit = 6 } = {}) {
  if (!items.length) return emptyState('Sin evaluaciones próximas', 'Cuando se programen evaluaciones con fecha aparecerán aquí.', 'calendar');
  return html`<ul class="event-list">${items.slice(0, limit).map((e) => html`
    <li class="event">
      ${dayBox(e.date)}
      <div class="event-body">
        <b>${e.name}</b>
        <span>${e.subject_name}${showCourse ? html` · <i class="dot" style="--c:${e.course_color}"></i>${e.course_name}` : ''}</span>
        <span class="muted">${fmtDate(e.date, { weekday: true })} · ${e.kind} · <b class="pct">${Number(e.weight)}%</b></span>
      </div>
      <span class="chip chip-soft">${relDays(e.date)}</span>
    </li>`)}</ul>`;
}

export function announcementList(items, { compact = false } = {}) {
  if (!items.length) return emptyState('Sin comunicados', 'Los comunicados del colegio aparecerán aquí.', 'megaphone');
  return html`<ul class="news-list">${items.map((a) => html`
    <li class="news ${a.pinned ? 'pinned' : ''}">
      <div class="news-head">
        ${a.pinned ? html`<span class="chip chip-honey">${icon('pin')}Destacado</span>` : ''}
        <span class="chip" style="--c:${a.course_color || '#5E8C4A'}">${a.course_name || 'Todo el colegio'}</span>
        <small class="muted">${fmtDateTime(a.created_at)}</small>
      </div>
      <h4>${a.title}</h4>
      ${a.body ? html`<p class="${compact ? 'clamp' : ''}">${a.body}</p>` : ''}
      <small class="muted">${a.author_name ? `Publicado por ${a.author_name}` : ''}</small>
    </li>`)}</ul>`;
}

export default async function home({ el, state }) {
  setTitle('Inicio');
  const data = await get('/api/home');
  const s = state.settings;
  if (state.me.role === 'admin') return renderAdmin(el, state, data, s);
  if (state.me.role === 'profesor') return renderTeacher(el, state, data, s);
  return renderGuardian(el, state, data, s);
}

function renderAdmin(el, state, d, s) {
  const c = d.counts;
  el.innerHTML = html`
    ${banner(state, html`<div class="hello-actions">
      <a class="btn btn-light btn-sm" href="#/estudiantes?nuevo=1">${icon('plus')}Estudiante</a>
      <a class="btn btn-light btn-sm" href="#/usuarios?nuevo=1">${icon('plus')}Usuario</a>
      <a class="btn btn-light btn-sm" href="#/comunicados?nuevo=1">${icon('megaphone')}Comunicado</a>
    </div>`)}

    <section class="stats">
      <a class="stat tone-rose" href="#/estudiantes"><span class="stat-ico">${icon('cap')}</span><b>${c.students}</b><span>Estudiantes</span>${icon('arrowRight', 'stat-go')}</a>
      <a class="stat tone-peach" href="#/cursos"><span class="stat-ico">${icon('grid')}</span><b>${c.courses}</b><span>Cursos</span>${icon('arrowRight', 'stat-go')}</a>
      <a class="stat tone-sage" href="#/usuarios?rol=profesor"><span class="stat-ico">${icon('book')}</span><b>${c.teachers}</b><span>Profesores</span>${icon('arrowRight', 'stat-go')}</a>
      <a class="stat tone-sky" href="#/usuarios?rol=apoderado"><span class="stat-ico">${icon('heart')}</span><b>${c.guardians}</b><span>Apoderados</span>${icon('arrowRight', 'stat-go')}</a>
    </section>

    <section class="section">
      <div class="section-head"><h3>Cursos</h3><a class="link" href="#/cursos">Ver todos ${icon('chevronRight')}</a></div>
      <div class="course-strip">
        ${d.courses.map((co) => html`
          <a class="course-card" href="#/cursos/${co.id}" style="--c:${co.color}">
            <span class="course-bead"></span>
            <b>${co.name}</b>
            <small>${co.level || ''}</small>
            <div class="course-meta">
              <span>${icon('users')}${co.students}</span>
              <span class="grade ${gradeClass(co.average, s)}">${fmtGrade(co.average)}</span>
            </div>
          </a>`)}
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>${icon('calendar')}Próximas evaluaciones</h3><a class="link" href="#/evaluaciones">Ver todas</a></div>
        ${upcomingList(d.upcoming)}
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('heart')}Requieren acompañamiento</h3></div>
        ${d.support.length ? html`<ul class="people-list">${d.support.map((p) => html`
          <li><a href="#/informe/${p.id}">
            ${avatar(p.name, p.course_color)}
            <span><b>${p.name}</b><small>${p.course_name}${p.low_subjects ? ` · ${p.low_subjects} asignatura(s) bajo ${fmtGrade(s.grade_pass)}` : ''}</small></span>
            <span class="grade ${gradeClass(p.average, s)}">${fmtGrade(p.average)}</span>
          </a></li>`)}</ul>`
          : emptyState('Todo en armonía', `Ningún estudiante tiene promedio bajo ${fmtGrade(s.grade_pass)}.`, 'leaf')}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>${icon('megaphone')}Comunicados</h3><a class="link" href="#/comunicados">Ver todos</a></div>
        ${announcementList(d.announcements, { compact: true })}
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('clock')}Actividad reciente</h3><a class="link" href="#/configuracion?tab=actividad">Historial</a></div>
        ${d.recent.length ? html`<ul class="activity">${d.recent.map((a) => html`
          <li><span class="act-dot"></span><div><b>${a.action}</b><span>${a.detail}</span><small>${a.user_name || 'Sistema'} · ${fmtDateTime(a.at)}</small></div></li>`)}</ul>`
          : emptyState('Sin actividad', 'Aquí verás los cambios que se hagan en la plataforma.', 'clock')}
      </section>
    </div>`.s;
}

function renderTeacher(el, state, d, s) {
  el.innerHTML = html`
    ${banner(state)}
    <section class="section">
      <div class="section-head"><h3>Mis asignaturas</h3></div>
      ${d.subjects.length ? html`<div class="subject-grid">${d.subjects.map((sub) => {
        const w = sub.weights[0] || 0;
        return html`<a class="subject-card" href="#/notas/${sub.id}" style="--c:${sub.color};--cc:${sub.course_color}">
          <div class="subject-top"><span class="chip" style="--c:${sub.course_color}">${sub.course_name}</span><span class="grade ${gradeClass(sub.average, s)}">${fmtGrade(sub.average)}</span></div>
          <b>${sub.name}</b>
          <small>${sub.students} estudiantes · ${sub.evaluation_count} evaluaciones</small>
          <div class="weights">${sub.weights.map((wt, i) => html`
            <div class="weight-row"><span>${i + 1}° ${s.period_label}</span><div class="bar"><i style="width:${Math.min(wt, 100)}%" class="${wt > 100 ? 'over' : wt === 100 ? 'full' : ''}"></i></div><em>${wt}%</em></div>`)}</div>
          <span class="subject-go">Abrir libro de notas ${icon('arrowRight')}</span>
        </a>`;
      })}</div>` : emptyState('Aún no tienes asignaturas', 'La dirección debe asignarte asignaturas en cada curso.', 'book')}
    </section>
    ${d.head_courses.length ? html`<section class="section"><div class="section-head"><h3>Jefatura de curso</h3></div>
      <div class="course-strip">${d.head_courses.map((co) => html`<a class="course-card" href="#/cursos/${co.id}" style="--c:${co.color}"><span class="course-bead"></span><b>${co.name}</b><small>Profesor/a jefe</small></a>`)}</div></section>` : ''}
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>${icon('calendar')}Próximas evaluaciones</h3><a class="link" href="#/evaluaciones">Ver todas</a></div>${upcomingList(d.upcoming)}</section>
      <section class="card"><div class="card-head"><h3>${icon('megaphone')}Comunicados</h3><a class="link" href="#/comunicados">Ver todos</a></div>${announcementList(d.announcements, { compact: true })}</section>
    </div>`.s;
}

function renderGuardian(el, state, d, s) {
  if (!d.students.length) {
    el.innerHTML = html`${banner(state)}${emptyState('Aún no hay estudiantes vinculados', 'Pide a la dirección del colegio que vincule a tu pupilo/a con tu cuenta.', 'heart')}`.s;
    return;
  }
  el.innerHTML = html`
    ${banner(state)}
    ${d.students.map((st) => html`
      <section class="section kid">
        <div class="kid-head" style="--c:${st.course_color || '#5E8C4A'}">
          ${avatar(`${st.first_name} ${st.last_name}`, st.course_color)}
          <div><b>${st.first_name} ${st.last_name}</b><small>${st.course_name || 'Sin curso asignado'}</small></div>
          <div class="kid-avg"><small>Promedio</small><span class="grade grade-lg ${gradeClass(st.average, s)}">${fmtGrade(st.average)}</span></div>
        </div>
        <div class="section-head"><h3>Últimas notas publicadas</h3><a class="link" href="#/informe/${st.id}">Ver todas ${icon('chevronRight')}</a></div>
        ${st.latest.length ? html`<div class="h-scroll">${st.latest.map((g) => html`
          <a class="last-grade" href="#/informe/${st.id}" style="--c:${g.subject_color}">
            <b class="clamp1">${g.subject_name}</b>
            <span class="clamp1 muted">${g.evaluation_name}</span>
            <div class="lg-row"><span>Nota</span><b class="grade ${gradeClass(g.value, s)}">${fmtGrade(g.value)}</b></div>
            <div class="lg-row"><span>Ponderación</span><b>${Number(g.weight)}%</b></div>
          </a>`)}</div>` : html`<p class="muted pad">Aún no hay notas publicadas.</p>`}
      </section>`)}

    <section class="card">
      <div class="seg" role="tablist">
        <button class="active" data-tab="ev" role="tab">Próximas evaluaciones</button>
        <button data-tab="news" role="tab">Comunicados</button>
      </div>
      <div data-pane="ev">${upcomingList(d.upcoming, { showCourse: d.students.length > 1 })}<a class="link center" href="#/evaluaciones">Ver todas</a></div>
      <div data-pane="news" hidden>${announcementList(d.announcements, { compact: true })}<a class="link center" href="#/comunicados">Ver todos</a></div>
    </section>

    <section class="section">
      <div class="section-head"><h3>Accesos directos</h3></div>
      <div class="tiles">
        <a class="tile" href="#/mis-notas"><span class="tile-ico tone-rose">${icon('clipboard')}</span>Notas</a>
        <a class="tile" href="#/informe/${d.students[0].id}?imprimir=1"><span class="tile-ico tone-peach">${icon('printer')}</span>Informe</a>
        <a class="tile" href="#/evaluaciones"><span class="tile-ico tone-sky">${icon('calendar')}</span>Evaluaciones</a>
        <a class="tile" href="#/comunicados"><span class="tile-ico tone-sage">${icon('megaphone')}</span>Comunicados</a>
      </div>
    </section>`.s;

  $$('.seg button', el).forEach((b) => b.addEventListener('click', () => {
    $$('.seg button', el).forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-pane]', el).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));
}
