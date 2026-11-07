import { get } from '../api.js';
import { setTitle, navigate, currentQuery } from '../app.js';
import { html, icon, fmtGrade, gradeClass, emptyState, $, $$, fmtDate, periodName, avatar, logo } from '../ui.js';
import { format as fmtRut } from '../rut.js';

export default async function report({ el, params, view, state }) {
  let id = Number(params.id);
  const kids = state.students || [];
  if (view === 'mine') {
    if (!kids.length) {
      setTitle('Notas');
      el.innerHTML = emptyState('Sin estudiantes vinculados', 'Pide a la dirección que vincule a tu pupilo/a con tu cuenta.', 'heart').s;
      return;
    }
    id = kids[0].id;
  }
  const r = await get(`/api/students/${id}/report`);
  const s = r.settings;
  const P = s.period_count;
  const name = `${r.student.first_name} ${r.student.last_name}`;
  const isGuardian = state.me.role === 'apoderado';
  setTitle(isGuardian ? 'Notas' : 'Informe de notas', { back: isGuardian ? null : (r.course ? `#/cursos/${r.course.id}?tab=estudiantes` : '#/estudiantes'), subtitle: name });

  const totalEvals = r.subjects.reduce((a, sub) => a + sub.evaluations.filter((e) => e.value != null).length, 0);

  el.innerHTML = html`
    ${isGuardian && kids.length > 1 ? html`<div class="chips-scroll kid-switch">${kids.map((k) => html`
      <a class="chip-btn ${k.id === id ? 'active' : ''}" href="#/informe/${k.id}" style="--c:${k.course_color || '#5E8C4A'}"><i class="dot"></i>${k.first_name}</a>`)}</div>` : ''}

    <section class="report-hero" style="--c:${r.course?.color || '#5E8C4A'}">
      <div class="report-who">
        ${avatar(name, r.course?.color)}
        <div>
          <h2>${name}</h2>
          <p>${r.course ? r.course.name : 'Sin curso'}${r.student.rut ? ` · RUT ${fmtRut(r.student.rut)}` : ''}</p>
          ${r.course?.head_teacher_name ? html`<p class="muted small">Profesor/a jefe: ${r.course.head_teacher_name}</p>` : ''}
        </div>
      </div>
      <div class="report-avgs">
        ${r.periods.map((p, i) => html`<div><small>${periodName(s, i + 1)}</small><span class="grade ${gradeClass(p, s)}">${fmtGrade(p)}</span></div>`)}
        <div class="main-avg"><small>Promedio general</small><span class="grade grade-xl ${gradeClass(r.average, s)}">${fmtGrade(r.average)}</span></div>
      </div>
      <div class="report-actions">
        <button class="btn btn-light btn-sm" data-print>${icon('printer')}Imprimir / PDF</button>
        <button class="btn btn-light btn-sm" data-expand>${icon('list')}Ver todas las notas</button>
      </div>
    </section>

    ${!r.subjects.length ? emptyState('Sin asignaturas', 'El curso aún no tiene asignaturas configuradas.', 'book')
    : html`<section class="section">
      <div class="section-head"><h3>Asignaturas</h3><span class="muted small">${totalEvals} notas registradas</span></div>
      <div class="subject-reports">
      ${r.subjects.map((sub) => html`
        <details class="subject-report" style="--c:${sub.color}">
          <summary>
            <span class="subject-dot"></span>
            <span class="sr-name"><b>${sub.name}</b><small>${sub.teacher_name || ''}</small></span>
            <span class="sr-periods">${sub.periods.map((p, i) => html`<span title="${periodName(s, i + 1)}"><small>${i + 1}°</small><b class="${gradeClass(p, s)}">${fmtGrade(p)}</b></span>`)}</span>
            <span class="grade ${gradeClass(sub.annual, s)}">${fmtGrade(sub.annual)}</span>
            ${icon('chevronDown', 'sr-chev')}
          </summary>
          <div class="sr-body">
            ${Array.from({ length: P }, (_, i) => {
              const list = sub.evaluations.filter((e) => e.period === i + 1);
              const tw = list.reduce((a, e) => a + Number(e.weight || 0), 0);
              return html`<div class="sr-period">
                <h5>${periodName(s, i + 1)} <small class="muted">· ${tw}% programado</small></h5>
                ${list.length ? html`<ul class="eval-rows">${list.map((e) => html`<li>
                  <div><b>${e.name}</b><small>${e.date ? fmtDate(e.date, { weekday: true }) : 'Sin fecha'} · ${e.kind}${!e.visible && !isGuardian ? ' · oculta a apoderados' : ''}</small>
                  ${e.comment ? html`<small class="comment">“${e.comment}”</small>` : ''}</div>
                  <span class="pct-chip">${Number(e.weight)}%</span>
                  <span class="grade ${gradeClass(e.value, s)}">${fmtGrade(e.value)}</span>
                </li>`)}</ul>` : html`<p class="muted small">Sin evaluaciones.</p>`}
              </div>`;
            })}
          </div>
        </details>`)}
      </div>
      <p class="legend"><span class="g-pass">Azul</span>: ${fmtGrade(s.grade_pass)} o más · <span class="g-fail">Rojo</span>: bajo ${fmtGrade(s.grade_pass)} · Promedio de cada período ponderado por el porcentaje de cada evaluación.</p>
    </section>`}

    ${printSheet(r, s, name)}`.s;

  $('[data-print]', el).addEventListener('click', () => window.print());
  $('[data-expand]', el).addEventListener('click', (e) => {
    const all = $$('details', el);
    const open = !all.every((d) => d.open);
    all.forEach((d) => { d.open = open; });
    e.currentTarget.lastChild.textContent = open ? 'Contraer' : 'Ver todas las notas';
  });
  if (currentQuery().get('imprimir')) setTimeout(() => window.print(), 400);
}

function printSheet(r, s, name) {
  const P = s.period_count;
  return html`<section class="print-sheet" aria-hidden="true">
    <header class="ps-head">
      ${logo(64)}
      <div><h1>${s.school_name}</h1><p>${s.address || ''}${s.phone ? ` · ${s.phone}` : ''}${s.email ? ` · ${s.email}` : ''}</p></div>
    </header>
    <h2 class="ps-title">Informe de Calificaciones · Año ${s.school_year}</h2>
    <table class="ps-info"><tr>
      <td><b>Estudiante:</b> ${name}</td><td><b>RUT:</b> ${r.student.rut ? fmtRut(r.student.rut) : '—'}</td>
    </tr><tr>
      <td><b>Curso:</b> ${r.course ? r.course.name : '—'}</td><td><b>Profesor/a jefe:</b> ${r.course?.head_teacher_name || '—'}</td>
    </tr></table>
    <table class="ps-grades">
      <thead><tr><th>Asignatura</th>${Array.from({ length: P }, (_, i) => html`<th>${periodName(s, i + 1)}</th>`)}<th>Final</th></tr></thead>
      <tbody>${r.subjects.map((sub) => html`<tr><td>${sub.name}</td>${sub.periods.map((p) => html`<td class="${gradeClass(p, s)}">${fmtGrade(p)}</td>`)}<td class="${gradeClass(sub.annual, s)}"><b>${fmtGrade(sub.annual)}</b></td></tr>`)}</tbody>
      <tfoot><tr><th>Promedio general</th>${r.periods.map((p) => html`<th class="${gradeClass(p, s)}">${fmtGrade(p)}</th>`)}<th class="${gradeClass(r.average, s)}">${fmtGrade(r.average)}</th></tr></tfoot>
    </table>
    ${r.subjects.map((sub) => sub.evaluations.some((e) => e.value != null) ? html`<div class="ps-detail">
      <h4>${sub.name}</h4>
      <table><thead><tr><th>Evaluación</th><th>Fecha</th><th>Período</th><th>%</th><th>Nota</th></tr></thead>
      <tbody>${sub.evaluations.filter((e) => e.value != null).map((e) => html`<tr><td>${e.name}</td><td>${e.date ? fmtDate(e.date, { short: true }) : ''}</td><td>${e.period}°</td><td>${Number(e.weight)}%</td><td class="${gradeClass(e.value, s)}">${fmtGrade(e.value)}</td></tr>`)}</tbody></table>
    </div>` : '')}
    <div class="ps-sign"><div><span></span>Profesor/a jefe</div><div><span></span>Dirección</div></div>
    <p class="ps-foot">Documento generado el ${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })} · ${s.school_name}</p>
  </section>`;
}
