import { get, put, api } from '../api.js';
import { setTitle, currentQuery, setQuery, refreshMe } from '../app.js';
import { html, icon, formData, field, selectField, toast, confirmDialog, $, $$, fmtDateTime, showFormError, emptyState } from '../ui.js';

export default async function settings({ el, state }) {
  setTitle('Configuración');
  let tab = currentQuery().get('tab') || 'colegio';
  el.innerHTML = html`
    <div class="page-head"><div><h2>Configuración</h2><p class="muted">Datos del colegio, escala de notas, respaldos e historial de cambios.</p></div></div>
    <div class="seg seg-wide" role="tablist">
      <button data-tab="colegio">${icon('leaf')}Colegio</button>
      <button data-tab="escala">${icon('percent')}Escala y períodos</button>
      <button data-tab="respaldo">${icon('download')}Respaldos</button>
      <button data-tab="actividad">${icon('clock')}Historial</button>
    </div>
    <div data-body></div>`.s;
  const body = $('[data-body]', el);

  const show = async (t) => {
    tab = t;
    setQuery(t === 'colegio' ? {} : { tab: t });
    $$('[data-tab]', el).forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    const s = await get('/api/settings');
    if (t === 'colegio') schoolTab(body, s);
    else if (t === 'escala') scaleTab(body, s);
    else if (t === 'respaldo') backupTab(body);
    else await auditTab(body);
  };
  $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  await show(tab);

  async function save(form, fields) {
    try {
      const d = formData(form);
      const payload = {};
      for (const f of fields) payload[f] = d[f];
      await put('/api/settings', payload);
      await refreshMe();
      toast('Configuración guardada');
    } catch (err) { showFormError(form, err.message); }
  }

  function schoolTab(body, s) {
    body.innerHTML = html`<section class="card"><form class="form-grid" data-f>
      ${field({ label: 'Nombre oficial del colegio', name: 'school_name', value: s.school_name, full: true })}
      ${field({ label: 'Nombre corto (menú y app)', name: 'school_short', value: s.school_short })}
      ${field({ label: 'Año escolar', name: 'school_year', type: 'number', value: s.school_year })}
      ${field({ label: 'Frase / lema', name: 'motto', value: s.motto, full: true })}
      ${field({ label: 'Dirección', name: 'address', value: s.address, full: true })}
      ${field({ label: 'Teléfono', name: 'phone', value: s.phone })}
      ${field({ label: 'Correo', name: 'email', type: 'email', value: s.email })}
      <div class="full"><button class="btn btn-primary" type="submit">${icon('check')}Guardar</button></div>
    </form></section>`.s;
    $('[data-f]', body).addEventListener('submit', (e) => { e.preventDefault(); save(e.target, ['school_name', 'school_short', 'school_year', 'motto', 'address', 'phone', 'email']); });
  }

  function scaleTab(body, s) {
    body.innerHTML = html`<section class="card"><form class="form-grid" data-f>
      ${field({ label: 'Nota mínima', name: 'grade_min', type: 'number', value: s.grade_min.toFixed(1), attrs: 'step="0.1"' })}
      ${field({ label: 'Nota máxima', name: 'grade_max', type: 'number', value: s.grade_max.toFixed(1), attrs: 'step="0.1"' })}
      ${field({ label: 'Nota de aprobación', name: 'grade_pass', type: 'number', value: s.grade_pass.toFixed(1), attrs: 'step="0.1"', hint: 'Bajo esta nota se muestra en rojo.' })}
      ${selectField({ label: 'Régimen', name: 'period_label', value: s.period_label, options: [{ value: 'Semestre', label: 'Semestral' }, { value: 'Trimestre', label: 'Trimestral' }] })}
      ${selectField({ label: 'Cantidad de períodos', name: 'period_count', value: s.period_count, options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })) })}
      <div class="full notice">${icon('alert')}<span>El promedio de cada período se calcula ponderando cada nota por el porcentaje de su evaluación. El promedio anual es el promedio de los períodos, y el general es el promedio de todas las asignaturas, redondeados a un decimal.</span></div>
      <div class="full"><button class="btn btn-primary" type="submit">${icon('check')}Guardar</button></div>
    </form></section>`.s;
    $('[data-f]', body).addEventListener('submit', (e) => { e.preventDefault(); save(e.target, ['grade_min', 'grade_max', 'grade_pass', 'period_label', 'period_count']); });
  }

  function backupTab(body) {
    body.innerHTML = html`<div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>${icon('download')}Descargar respaldo</h3></div>
        <p class="muted">Guarda una copia completa (usuarios, cursos, estudiantes, evaluaciones y notas) en un archivo. Te recomendamos hacerlo una vez por semana y al cerrar cada período.</p>
        <a class="btn btn-primary" href="/api/backup" download>${icon('download')}Descargar respaldo</a>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('upload')}Restaurar respaldo</h3></div>
        <p class="muted">Reemplaza <b>todos</b> los datos actuales por los de un archivo de respaldo. Después deberás volver a ingresar.</p>
        <label class="btn btn-danger-ghost file-btn">${icon('upload')}Elegir archivo…<input type="file" accept="application/json,.json" data-file hidden></label>
      </section>
    </div>`.s;
    $('[data-file]', body).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch { toast('El archivo no es válido', 'error'); return; }
      const ok = await confirmDialog({ title: 'Restaurar respaldo', message: `Se reemplazarán todos los datos por los del respaldo del ${data.created_at ? new Date(data.created_at).toLocaleString('es-CL') : '(fecha desconocida)'}. ¿Continuar?`, confirm: 'Restaurar' });
      if (!ok) return;
      try {
        await api('POST', '/api/restore', data);
        toast('Respaldo restaurado. Ingresa nuevamente.');
        setTimeout(() => location.reload(), 1200);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function auditTab(body) {
    const rows = await get('/api/audit?limit=300');
    body.innerHTML = html`<section class="card">
      <div class="card-head"><h3>${icon('clock')}Historial de cambios</h3><span class="muted small">Últimos ${rows.length} registros</span></div>
      ${rows.length ? html`<ul class="activity">${rows.map((a) => html`<li><span class="act-dot"></span><div><b>${a.action}</b><span>${a.detail}</span><small>${a.user_name || 'Sistema'} · ${fmtDateTime(a.at)}</small></div></li>`)}</ul>`
        : emptyState('Sin registros', 'Aquí quedará registro de cada nota ingresada o modificada.', 'clock')}
    </section>`.s;
  }
}
