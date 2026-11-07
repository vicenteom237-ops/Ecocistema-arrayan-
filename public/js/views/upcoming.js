import { get } from '../api.js';
import { setTitle } from '../app.js';
import { html, icon, emptyState, fmtDate, relDays, parseDate } from '../ui.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default async function upcoming({ el, state }) {
  setTitle('Próximas evaluaciones');
  const items = await get('/api/upcoming');
  const groups = new Map();
  for (const e of items) {
    const d = parseDate(e.date);
    const k = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const canOpen = state.me.role !== 'apoderado';
  el.innerHTML = html`
    <div class="page-head"><div><h2>Próximas evaluaciones</h2><p class="muted">Calendario de los próximos meses, con el porcentaje de cada evaluación.</p></div></div>
    ${items.length ? [...groups.entries()].map(([month, list]) => html`
      <section class="section">
        <div class="section-head"><h3>${month}</h3></div>
        <div class="card flush"><ul class="event-list">${list.map((e) => {
          const d = parseDate(e.date);
          const inner = html`
            <div class="daybox" style="--c:${e.course_color}"><b>${d.getDate()}</b><span>${WD[d.getDay()]}</span></div>
            <div class="event-body">
              <b>${e.subject_name}</b>
              <span>${e.name}</span>
              <span class="muted"><i class="dot" style="--c:${e.course_color}"></i>${e.course_name} · ${fmtDate(e.date, { weekday: true })} · ${e.kind} · <b class="pct">${Number(e.weight)}%</b></span>
            </div>
            <span class="chip chip-soft">${relDays(e.date)}</span>`;
          return html`<li class="event">${canOpen ? html`<a class="event-link" href="#/notas/${e.subject_id}?p=${e.period}">${inner}${icon('chevronRight', 'muted')}</a>` : inner}</li>`;
        })}</ul></div>
      </section>`) : emptyState('Sin evaluaciones programadas', 'Cuando se agenden evaluaciones con fecha, las verás aquí.', 'calendar')}`.s;
}
