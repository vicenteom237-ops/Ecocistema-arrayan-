// Utilidades de interfaz: plantillas seguras, íconos, avisos, ventanas modales y formatos.

// ---------- plantillas con escape automático ----------
export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtVal(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmtVal).join('');
  return esc(String(v));
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += fmtVal(vals[i]);
  });
  return new Raw(out);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ---------- íconos (trazos al estilo Lucide, licencia ISC) ----------
const ICONS = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  phoneApp: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

// ---------- logo ----------
export function logo(size = 44) {
  return raw(`<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill="#F4ECDD" stroke="#C0703F" stroke-width="2"/>
    <path d="M17 50c6-6 12-14 16-23 2-5 6-10 12-13" stroke="#B5642F" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M27 36c-3-1-7 0-9 3 3 1 7 0 9-3z" fill="#5E8C4A"/>
    <path d="M27 36c0-4 2-7 5-8 0 3-2 6-5 8z" fill="#7CA36A"/>
    <path d="M33 26c-3-2-7-2-9 0 3 2 7 2 9 0z" fill="#7CA36A"/>
    <path d="M33 26c1-4 4-6 7-6-1 3-3 5-7 6z" fill="#5E8C4A"/>
    <path d="M40 17c-2-2-5-3-8-2 2 2 5 3 8 2z" fill="#5E8C4A"/>
    <g transform="translate(45 15)">
      <circle r="3.6" cx="0" cy="-4.4" fill="#fff"/><circle r="3.6" cx="4.2" cy="-1.4" fill="#fff"/>
      <circle r="3.6" cx="2.6" cy="3.6" fill="#fff"/><circle r="3.6" cx="-2.6" cy="3.6" fill="#fff"/>
      <circle r="3.6" cx="-4.2" cy="-1.4" fill="#fff"/><circle r="2.4" fill="#E2B04A"/>
    </g>
    <circle cx="22" cy="44" r="2.6" fill="#4B2E4F"/><circle cx="25.5" cy="46.5" r="2.2" fill="#5D3A61"/>
  </svg>`);
}

// ---------- formatos ----------
export function fmtGrade(v) {
  if (v == null || v === '') return '—';
  return Number(v).toFixed(1).replace('.', ',');
}
export function gradeClass(v, settings) {
  if (v == null || v === '') return 'g-empty';
  const pass = settings ? settings.grade_pass : 4;
  return Number(v) < pass ? 'g-fail' : 'g-pass';
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(s, { weekday = false, short = false } = {}) {
  const d = parseDate(s);
  if (!d) return 'Sin fecha';
  const month = short ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()];
  const base = `${d.getDate()} de ${month}`;
  return weekday ? `${cap(DAYS[d.getDay()])} ${base}` : base;
}
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z'));
  return d.toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function relDays(s) {
  const d = parseDate(s);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400e3);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff < 0) return `Hace ${-diff} días`;
  return `En ${diff} días`;
}
export function dayBox(s) {
  const d = parseDate(s);
  if (!d) return html`<div class="daybox"><b>—</b><span>s/f</span></div>`;
  return html`<div class="daybox"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()].slice(0, 3)}</span></div>`;
}
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
export function periodName(settings, p) {
  const label = (settings && settings.period_label) || 'Semestre';
  return `${p}° ${label}`;
}
export function roleName(r) {
  return { admin: 'Dirección', profesor: 'Profesor/a', apoderado: 'Apoderado/a' }[r] || r;
}
export function round1(x) { return Math.round(x * 10 + 1e-9) / 10; }
export function weightedAverage(evals, gradeOf) {
  let sum = 0, w = 0, ps = 0, pc = 0;
  for (const e of evals) {
    const g = gradeOf(e.id);
    if (g == null) continue;
    const wt = Number(e.weight) || 0;
    sum += g * wt; w += wt; ps += g; pc++;
  }
  if (w > 0) return round1(sum / w);
  if (pc) return round1(ps / pc);
  return null;
}
export function mean(vals) {
  const v = vals.filter((x) => x != null);
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

// ---------- avisos ----------
export function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = html`${icon(type === 'error' ? 'alert' : 'check')}<span>${message}</span>`.s;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------- modales ----------
export function modal({ title, body, actions = [], wide = false, locked = false, onMount }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = html`
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="modal-head">
          <h2>${title}</h2>
          ${locked ? '' : html`<button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>`}
        </header>
        <div class="modal-body">${body}</div>
        ${actions.length ? html`<footer class="modal-foot">${actions.map((a, i) => html`
          <button class="btn ${a.kind || 'btn-ghost'}" data-act="${i}" type="${a.submit ? 'submit' : 'button'}">${a.icon ? icon(a.icon) : ''}${a.label}</button>`)}</footer>` : ''}
      </div>`.s;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    const el = wrap.querySelector('.modal');
    const close = (val) => {
      wrap.classList.add('out');
      document.body.classList.remove('no-scroll');
      setTimeout(() => wrap.remove(), 180);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape' && !locked) close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !locked) close(null); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    wrap.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const a = actions[Number(b.dataset.act)];
      if (!a.onClick) return close(a.value ?? true);
      b.disabled = true;
      try {
        const res = await a.onClick(el, close);
        if (res !== false && res !== undefined) close(res);
      } catch (err) {
        showFormError(el, err.message);
      } finally {
        b.disabled = false;
      }
    }));
    const form = el.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const primary = el.querySelector('.modal-foot .btn-primary');
        if (primary) primary.click();
      });
    }
    if (onMount) onMount(el, close);
    const first = el.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) setTimeout(() => first.focus(), 60);
  });
}

export function showFormError(root, message) {
  let box = root.querySelector('.form-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'form-error';
    const body = root.querySelector('.modal-body') || root;
    body.prepend(box);
  }
  box.innerHTML = html`${icon('alert')}<span>${message}</span>`.s;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function confirmDialog({ title = '¿Estás segura/o?', message, confirm = 'Eliminar', kind = 'btn-danger' }) {
  return modal({
    title,
    body: html`<p class="confirm-text">${message}</p>`,
    actions: [
      { label: 'Cancelar', value: false },
      { label: confirm, kind, value: true },
    ],
  });
}

// Lee los campos de un formulario como objeto
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') {
      if (el.dataset.multi) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  });
  return out;
}

export function field({ label, name, value = '', type = 'text', required = false, placeholder = '', hint = '', attrs = '', full = false }) {
  return html`<label class="field ${full ? 'full' : ''}">
    <span class="field-label">${label}${required ? html`<em>*</em>` : ''}</span>
    <input class="input" type="${type}" name="${name}" value="${value ?? ''}" placeholder="${placeholder}" ${required ? raw('required') : ''} ${raw(attrs)}>
    ${hint ? html`<small class="hint">${hint}</small>` : ''}
  </label>`;
}

export function selectField({ label, name, options, value, required = false, full = false, hint = '' }) {
  return html`<label class="field ${full ? 'full' : ''}">
    <span class="field-label">${label}${required ? html`<em>*</em>` : ''}</span>
    <select class="input" name="${name}">
      ${options.map((o) => html`<option value="${o.value ?? ''}" ${String(o.value ?? '') === String(value ?? '') ? raw('selected') : ''}>${o.label}</option>`)}
    </select>
    ${hint ? html`<small class="hint">${hint}</small>` : ''}
  </label>`;
}

export function emptyState(title, text, iconName = 'sprout', action = '') {
  return html`<div class="empty">
    <div class="empty-ico">${icon(iconName)}</div>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

export function avatar(name, colorHex) {
  return html`<span class="avatar" style="${colorHex ? `--av:${colorHex}` : ''}">${initials(name)}</span>`;
}

export function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copiado al portapapeles'));
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function credentialsBox(name, rut, pass) {
  return html`<div class="cred-box">
    <div class="cred-ico">${icon('key')}</div>
    <div>
      <p>Comparte estos datos de acceso con <b>${name}</b>. La clave temporal se muestra <b>solo una vez</b>; deberá cambiarla al ingresar.</p>
      <dl><dt>RUT</dt><dd>${rut}</dd><dt>Clave temporal</dt><dd class="mono">${pass}</dd></dl>
      <button class="btn btn-soft btn-sm" data-copy="${`Plataforma ${document.title}\nRUT: ${rut}\nClave temporal: ${pass}\nIngresa en: ${location.origin}`}">${icon('file')}Copiar mensaje</button>
    </div>
  </div>`;
}

export function showCredentials(name, rut, pass) {
  return modal({
    title: 'Acceso creado',
    body: credentialsBox(name, rut, pass),
    actions: [{ label: 'Listo', kind: 'btn-primary', value: true }],
    onMount: (el) => el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy))),
  });
}
