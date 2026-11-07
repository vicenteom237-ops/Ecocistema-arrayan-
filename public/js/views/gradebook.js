import { get, post, put, del } from '../api.js';
import { setTitle, navigate, currentQuery, setQuery } from '../app.js';
import {
  html, icon, fmtGrade, gradeClass, emptyState, modal, formData, field, selectField, toast, confirmDialog,
  $, $$, fmtDate, periodName, weightedAverage, mean, downloadFile, showFormError,
} from '../ui.js';

const KINDS = ['Sumativa', 'Formativa', 'Prueba', 'Control', 'Trabajo', 'Proyecto', 'Disertación', 'Laboratorio', 'Portafolio', 'Autoevaluación'];

export default async function gradebook({ el, params, state }) {
  const subjectId = Number(params.id);
  const data = await get(`/api/gradebook/${subjectId}`);
  const s = data.settings;
  const P = s.period_count;
  let period = Math.min(P, Math.max(1, Number(currentQuery().get('p')) || defaultPeriod(data.evaluations, P)));
  const canEdit = data.can_edit;

  // mapa de notas: "evalId:studentId" -> valor
  const grades = new Map();
  for (const g of data.grades) grades.set(`${g.evaluation_id}:${g.student_id}`, g.value);

  setTitle(data.subject.name, { back: `#/cursos/${data.course.id}`, subtitle: data.course.name });

  const evalsOf = (p) => data.evaluations.filter((e) => e.period === p);
  const avgOf = (stId, p) => weightedAverage(evalsOf(p), (eid) => grades.get(`${eid}:${stId}`) ?? null);
  const annualOf = (stId) => mean(Array.from({ length: P }, (_, i) => avgOf(stId, i + 1)));

  function render() {
    const evals = evalsOf(period);
    const totalW = evals.reduce((a, e) => a + (Number(e.weight) || 0), 0);
    const wState = totalW === 100 ? 'ok' : totalW > 100 ? 'over' : 'under';
    el.innerHTML = html`
      <section class="gb-head" style="--c:${data.subject.color};--cc:${data.course.color}">
        <div class="gb-title">
          <span class="chip" style="--c:${data.course.color}">${data.course.name}</span>
          <h2>${data.subject.name}</h2>
          <p class="muted">${data.subject.teacher_name ? `Profesor/a: ${data.subject.teacher_name}` : 'Sin profesor/a asignado'} · ${data.students.length} estudiantes</p>
        </div>
        ${data.siblings.length > 1 ? html`<label class="gb-switch">${icon('book')}
          <select class="input" data-switch>${data.siblings.map((x) => html`<option value="${x.id}" ${x.id === subjectId ? 'selected' : ''}>${x.name}</option>`)}</select></label>` : ''}
      </section>

      <div class="gb-toolbar">
        <div class="seg seg-sm" role="tablist">
          ${Array.from({ length: P }, (_, i) => html`<button data-period="${i + 1}" class="${period === i + 1 ? 'active' : ''}">${periodName(s, i + 1)}</button>`)}
        </div>
        <div class="weight-meter ${wState}" title="Suma de porcentajes del período">
          ${icon('percent')}
          <div><b>${totalW}% de 100%</b><small>${wState === 'ok' ? 'Ponderación completa' : wState === 'over' ? `Sobran ${totalW - 100}%` : `Faltan ${100 - totalW}% por asignar`}</small></div>
          <div class="bar"><i style="width:${Math.min(totalW, 100)}%"></i></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost btn-sm" data-export>${icon('download')}Excel (CSV)</button>
          ${canEdit ? html`<button class="btn btn-primary btn-sm" data-new-eval>${icon('plus')}Nueva evaluación</button>` : ''}
        </div>
      </div>

      ${!canEdit ? html`<div class="notice">${icon('eye')}<span>Vista de solo lectura. Solo el profesor/a de la asignatura o la dirección pueden modificar notas.</span></div>` : ''}

      ${!data.students.length ? emptyState('Este curso no tiene estudiantes', 'La dirección debe agregar estudiantes al curso.', 'cap')
      : !evals.length ? emptyState('Sin evaluaciones en este período', canEdit ? 'Crea la primera evaluación e indica su porcentaje.' : 'Aún no hay evaluaciones.', 'clipboard',
        canEdit ? html`<button class="btn btn-primary" data-new-eval>${icon('plus')}Nueva evaluación</button>` : '')
      : html`<div class="table-wrap gb-wrap">
        <table class="gradebook">
          <thead><tr>
            <th class="sticky col-name">Estudiante</th>
            ${evals.map((e, i) => html`<th class="col-eval">
              <button class="eval-head" data-eval="${e.id}" ${canEdit ? '' : 'disabled'} title="${e.description || e.name}">
                <span class="eval-n">N${i + 1}${e.visible ? '' : html` ${icon('eyeOff', 'tiny')}`}</span>
                <b class="clamp2">${e.name}</b>
                <small>${e.date ? fmtDate(e.date, { short: true }) : 'Sin fecha'}</small>
                <span class="pct-chip">${Number(e.weight)}%</span>
              </button>
            </th>`)}
            <th class="col-avg">Prom.<br><small>${period}° ${s.period_label.slice(0, 3)}.</small></th>
            ${P > 1 ? html`<th class="col-avg">Anual</th>` : ''}
          </tr></thead>
          <tbody>
            ${data.students.map((st, r) => html`<tr data-st="${st.id}">
              <th class="sticky col-name"><span class="num">${r + 1}</span><a href="#/informe/${st.id}">${st.last_name}, ${st.first_name}</a></th>
              ${evals.map((e, c) => {
                const v = grades.get(`${e.id}:${st.id}`);
                return html`<td class="cell">
                  <input class="grade-input ${gradeClass(v, s)}" inputmode="decimal" autocomplete="off" maxlength="4"
                    value="${v != null ? fmtGrade(v) : ''}" data-e="${e.id}" data-s="${st.id}" data-r="${r}" data-c="${c}"
                    aria-label="Nota de ${st.first_name} ${st.last_name} en ${e.name}" ${canEdit ? '' : 'readonly'}>
                </td>`;
              })}
              <td class="col-avg" data-avg="${st.id}">${avgCell(avgOf(st.id, period))}</td>
              ${P > 1 ? html`<td class="col-avg" data-annual="${st.id}">${avgCell(annualOf(st.id))}</td>` : ''}
            </tr>`)}
          </tbody>
          <tfoot><tr>
            <th class="sticky col-name">Promedio del curso</th>
            ${evals.map((e) => html`<td data-colavg="${e.id}">${avgCell(colAvg(e.id))}</td>`)}
            <td class="col-avg" data-courseavg>${avgCell(mean(data.students.map((st) => avgOf(st.id, period))))}</td>
            ${P > 1 ? html`<td class="col-avg">${avgCell(mean(data.students.map((st) => annualOf(st.id))))}</td>` : ''}
          </tr></tfoot>
        </table>
      </div>
      <p class="legend">${canEdit ? html`Escribe la nota y presiona <kbd>Enter</kbd> para bajar. Puedes escribir <b>55</b> para 5,5. Se guarda automáticamente. · ` : ''}
        Escala ${fmtGrade(s.grade_min)} a ${fmtGrade(s.grade_max)} · aprobación ${fmtGrade(s.grade_pass)} · el promedio se pondera por el porcentaje de cada evaluación.</p>`}`.s;

    bind();
  }

  function avgCell(v) {
    return html`<span class="grade ${gradeClass(v, s)}">${fmtGrade(v)}</span>`;
  }
  function colAvg(eid) {
    return mean(data.students.map((st) => grades.get(`${eid}:${st.id}`) ?? null));
  }

  function bind() {
    $$('[data-period]', el).forEach((b) => b.addEventListener('click', () => {
      period = Number(b.dataset.period);
      setQuery({ p: period });
      render();
    }));
    $('[data-switch]', el)?.addEventListener('change', (e) => navigate(`#/notas/${e.target.value}?p=${period}`));
    $$('[data-new-eval]', el).forEach((b) => b.addEventListener('click', () => openEval()));
    $$('[data-eval]', el).forEach((b) => b.addEventListener('click', () => openEval(data.evaluations.find((e) => e.id === Number(b.dataset.eval)))));
    $('[data-export]', el)?.addEventListener('click', exportCsv);
    if (canEdit) $$('.grade-input', el).forEach(bindInput);
  }

  function bindInput(input) {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      const r = Number(input.dataset.r), c = Number(input.dataset.c);
      let target = null;
      if (e.key === 'Enter' || e.key === 'ArrowDown') target = [r + 1, c];
      else if (e.key === 'ArrowUp') target = [r - 1, c];
      else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) target = [r, c + 1];
      else if (e.key === 'ArrowLeft' && input.selectionStart === 0) target = [r, c - 1];
      else if (e.key === 'Escape') { input.value = fmtGrade(grades.get(`${input.dataset.e}:${input.dataset.s}`) ?? '') .replace('—', ''); input.blur(); }
      if (target) {
        const next = $(`.grade-input[data-r="${target[0]}"][data-c="${target[1]}"]`, el);
        if (next) { e.preventDefault(); next.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      }
    });
    input.addEventListener('change', () => save(input));
  }

  async function save(input) {
    const eid = Number(input.dataset.e), sid = Number(input.dataset.s);
    const key = `${eid}:${sid}`;
    let rawVal = input.value.trim().replace(',', '.');
    let value = null;
    if (rawVal !== '') {
      let n = Number(rawVal);
      if (Number.isFinite(n) && !rawVal.includes('.') && n >= 10 && n <= s.grade_max * 10) n = n / 10;
      if (!Number.isFinite(n) || n < s.grade_min || n > s.grade_max) {
        input.classList.add('g-error');
        toast(`La nota debe estar entre ${fmtGrade(s.grade_min)} y ${fmtGrade(s.grade_max)}`, 'error');
        input.value = grades.has(key) ? fmtGrade(grades.get(key)) : '';
        setTimeout(() => input.classList.remove('g-error'), 1200);
        return;
      }
      value = Math.round(n * 10) / 10;
    }
    input.classList.add('saving');
    try {
      const res = await put('/api/grades', { evaluation_id: eid, student_id: sid, value });
      if (res.value == null) grades.delete(key); else grades.set(key, res.value);
      input.value = res.value == null ? '' : fmtGrade(res.value);
      input.className = `grade-input ${gradeClass(res.value, s)} saved`;
      setTimeout(() => input.classList.remove('saved'), 900);
      $(`[data-avg="${sid}"]`, el).innerHTML = avgCell(avgOf(sid, period)).s;
      const an = $(`[data-annual="${sid}"]`, el);
      if (an) an.innerHTML = avgCell(annualOf(sid)).s;
      $(`[data-colavg="${eid}"]`, el).innerHTML = avgCell(colAvg(eid)).s;
      $('[data-courseavg]', el).innerHTML = avgCell(mean(data.students.map((st) => avgOf(st.id, period)))).s;
    } catch (err) {
      input.classList.remove('saving');
      input.classList.add('g-error');
      input.value = grades.has(key) ? fmtGrade(grades.get(key)) : '';
      toast(err.message, 'error');
    } finally {
      input.classList.remove('saving');
    }
  }

  async function openEval(ev = null) {
    const isNew = !ev;
    const used = evalsOf(ev ? ev.period : period).filter((e) => !ev || e.id !== ev.id).reduce((a, e) => a + Number(e.weight || 0), 0);
    const remaining = Math.max(0, 100 - used);
    const res = await modal({
      title: isNew ? 'Nueva evaluación' : 'Editar evaluación',
      body: html`<form class="form-grid">
        ${field({ label: 'Nombre', name: 'name', value: ev?.name, required: true, full: true, placeholder: 'Ej: Prueba unidad 2: fracciones' })}
        ${selectField({ label: 'Tipo', name: 'kind', value: ev?.kind || 'Sumativa', options: KINDS.map((k) => ({ value: k, label: k })) })}
        ${field({ label: 'Fecha', name: 'date', type: 'date', value: ev?.date })}
        ${field({ label: 'Porcentaje (%)', name: 'weight', type: 'number', value: ev ? Number(ev.weight) : remaining || '', required: true,
          attrs: 'min="0" max="100" step="0.5"', hint: `Ya asignado en el período: ${used}% · disponible: ${remaining}%` })}
        ${selectField({ label: 'Período', name: 'period', value: ev?.period || period, options: Array.from({ length: P }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) })}
        <label class="field full"><span class="field-label">Descripción / contenidos</span><textarea class="input" name="description" rows="2">${ev?.description || ''}</textarea></label>
        <label class="field full check"><input type="checkbox" name="visible" ${!ev || ev.visible ? 'checked' : ''}><span>Visible para apoderados (desmarca mientras ingresas las notas si prefieres publicarlas después)</span></label>
      </form>`,
      actions: [
        ...(isNew ? [] : [{ label: 'Eliminar', kind: 'btn-danger-ghost', icon: 'trash', onClick: async () => {
          if (!(await confirmDialog({ message: `Se eliminará "${ev.name}" y todas sus notas.` }))) return false;
          await del(`/api/evaluations/${ev.id}`);
          toast('Evaluación eliminada');
          return 'deleted';
        } }]),
        { label: 'Cancelar', value: null },
        {
          label: isNew ? 'Crear' : 'Guardar', kind: 'btn-primary', icon: 'check',
          onClick: async (m) => {
            const d = formData(m);
            if (!d.name) { showFormError(m, 'Escribe el nombre de la evaluación.'); return false; }
            d.weight = Number(String(d.weight).replace(',', '.'));
            if (isNew) await post('/api/evaluations', { ...d, subject_id: subjectId });
            else await put(`/api/evaluations/${ev.id}`, d);
            toast(isNew ? 'Evaluación creada' : 'Evaluación actualizada');
            return Number(d.period);
          },
        },
      ],
    });
    if (res) {
      const fresh = await get(`/api/gradebook/${subjectId}`);
      data.evaluations = fresh.evaluations;
      grades.clear();
      for (const g of fresh.grades) grades.set(`${g.evaluation_id}:${g.student_id}`, g.value);
      if (typeof res === 'number') { period = res; setQuery({ p: period }); }
      render();
    }
  }

  function exportCsv() {
    const rows = [];
    const sep = ';';
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['N°', 'RUT', 'Apellidos', 'Nombres'];
    const cols = [];
    for (let p = 1; p <= P; p++) {
      for (const e of evalsOf(p)) { head.push(`${e.name} (${Number(e.weight)}%) [${p}°]`); cols.push(e); }
      head.push(`Promedio ${periodName(s, p)}`);
      cols.push({ avg: p });
    }
    if (P > 1) head.push('Promedio anual');
    rows.push(head.map(q).join(sep));
    data.students.forEach((st, i) => {
      const line = [i + 1, st.rut || '', st.last_name, st.first_name];
      for (const c of cols) {
        const v = c.avg ? avgOf(st.id, c.avg) : grades.get(`${c.id}:${st.id}`);
        line.push(v != null ? fmtGrade(v) : '');
      }
      if (P > 1) { const a = annualOf(st.id); line.push(a != null ? fmtGrade(a) : ''); }
      rows.push(line.map(q).join(sep));
    });
    const name = `notas-${data.course.name}-${data.subject.name}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
    downloadFile(`${name}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }

  render();
}

function defaultPeriod(evals, P) {
  // Abre el período más reciente que tenga evaluaciones
  for (let p = P; p >= 1; p--) if (evals.some((e) => e.period === p)) return p;
  return 1;
}
