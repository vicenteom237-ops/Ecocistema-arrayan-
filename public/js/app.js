// Aplicación principal: sesión, navegación y estructura de pantallas
import { get, post, setUnauthorizedHandler } from './api.js';
import { html, raw, icon, logo, $, $$, toast, modal, formData, showFormError, roleName, initials } from './ui.js';
import { attachRutInput, isValid } from './rut.js';

export const state = { me: null, settings: null, students: [], status: null };

// ---------- rutas ----------
const routes = [
  { path: '/', load: () => import('./views/home.js'), roles: ['admin', 'profesor', 'apoderado'] },
  { path: '/cursos', load: () => import('./views/courses.js'), view: 'list', roles: ['admin', 'profesor'] },
  { path: '/cursos/:id', load: () => import('./views/courses.js'), view: 'detail', roles: ['admin', 'profesor'] },
  { path: '/notas/:id', load: () => import('./views/gradebook.js'), roles: ['admin', 'profesor'] },
  { path: '/estudiantes', load: () => import('./views/students.js'), roles: ['admin', 'profesor'] },
  { path: '/usuarios', load: () => import('./views/users.js'), roles: ['admin'] },
  { path: '/comunicados', load: () => import('./views/announcements.js'), roles: ['admin', 'profesor', 'apoderado'] },
  { path: '/evaluaciones', load: () => import('./views/upcoming.js'), roles: ['admin', 'profesor', 'apoderado'] },
  { path: '/informe/:id', load: () => import('./views/report.js'), roles: ['admin', 'profesor', 'apoderado'] },
  { path: '/mis-notas', load: () => import('./views/report.js'), view: 'mine', roles: ['apoderado'] },
  { path: '/configuracion', load: () => import('./views/settings.js'), roles: ['admin'] },
  { path: '/perfil', load: () => import('./views/profile.js'), roles: ['admin', 'profesor', 'apoderado'] },
];

const NAV = {
  admin: [
    { href: '#/', label: 'Inicio', icon: 'home' },
    { href: '#/cursos', label: 'Cursos', icon: 'grid' },
    { href: '#/estudiantes', label: 'Estudiantes', icon: 'cap' },
    { href: '#/usuarios', label: 'Usuarios', icon: 'users' },
    { href: '#/evaluaciones', label: 'Evaluaciones', icon: 'calendar' },
    { href: '#/comunicados', label: 'Comunicados', icon: 'megaphone' },
    { href: '#/configuracion', label: 'Configuración', icon: 'settings' },
    { href: '#/perfil', label: 'Mi perfil', icon: 'user' },
  ],
  profesor: [
    { href: '#/', label: 'Inicio', icon: 'home' },
    { href: '#/cursos', label: 'Mis cursos', icon: 'grid' },
    { href: '#/estudiantes', label: 'Estudiantes', icon: 'cap' },
    { href: '#/evaluaciones', label: 'Evaluaciones', icon: 'calendar' },
    { href: '#/comunicados', label: 'Comunicados', icon: 'megaphone' },
    { href: '#/perfil', label: 'Mi perfil', icon: 'user' },
  ],
  apoderado: [
    { href: '#/', label: 'Inicio', icon: 'home' },
    { href: '#/mis-notas', label: 'Notas', icon: 'clipboard' },
    { href: '#/evaluaciones', label: 'Evaluaciones', icon: 'calendar' },
    { href: '#/comunicados', label: 'Comunicados', icon: 'megaphone' },
    { href: '#/perfil', label: 'Perfil', icon: 'user' },
  ],
};

function matchRoute(path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    const m = re.exec(path);
    if (m) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

export function currentQuery() {
  const h = location.hash.slice(1);
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}

export function setQuery(params) {
  const h = location.hash.slice(1) || '/';
  const path = h.split('?')[0];
  const q = new URLSearchParams(params).toString();
  history.replaceState(null, '', `#${path}${q ? '?' + q : ''}`);
}

// ---------- título de la página ----------
export function setTitle(title, { back = null, subtitle = '' } = {}) {
  document.title = `${title} · ${state.settings?.school_short || 'Ecocistema Arrayán'}`;
  const t = $('#page-title');
  if (t) t.textContent = title;
  const b = $('#topbar-back');
  if (b) {
    b.hidden = !back;
    if (back) b.setAttribute('href', back);
  }
  const s = $('#page-subtitle');
  if (s) s.textContent = subtitle;
}

// ---------- render ----------
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const hash = location.hash.slice(1) || '/';
  const path = hash.split('?')[0];

  if (!state.me) return;
  if (!$('.shell')) renderShell();

  const m = matchRoute(path);
  const view = $('#view');
  if (!m || !m.route.roles.includes(state.me.role)) {
    view.innerHTML = html`<div class="empty"><div class="empty-ico">${icon('leaf')}</div><h3>Página no encontrada</h3>
      <p>El camino que buscas no existe o no tienes acceso.</p><a class="btn btn-primary" href="#/">Volver al inicio</a></div>`.s;
    return;
  }
  highlightNav(path);
  view.classList.add('loading');
  try {
    const mod = await m.route.load();
    if (seq !== renderSeq) return;
    view.innerHTML = '';
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    await mod.default({ el: view, params: m.params, query: currentQuery(), view: m.route.view, state });
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error(err);
    view.innerHTML = html`<div class="empty"><div class="empty-ico">${icon('alert')}</div><h3>No pudimos cargar esta sección</h3>
      <p>${err.message || 'Error desconocido'}</p><button class="btn btn-primary" id="retry">Reintentar</button></div>`.s;
    $('#retry')?.addEventListener('click', render);
  } finally {
    if (seq === renderSeq) view.classList.remove('loading');
  }
}

function highlightNav(path) {
  const base = '#/' + (path.split('/')[1] || '');
  $$('[data-nav]').forEach((a) => {
    const href = a.getAttribute('href');
    const active = href === base || (href === '#/cursos' && base === '#/notas') || (href === '#/mis-notas' && base === '#/informe');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function renderShell() {
  const u = state.me;
  const nav = NAV[u.role];
  const s = state.settings;
  const bottom = nav.length > 5 ? [...nav.slice(0, 4), { href: '#menu', label: 'Más', icon: 'menu', menu: true }] : nav;
  document.body.innerHTML = html`
  <div class="shell role-${u.role}">
    <aside class="sidebar">
      <a class="brand" href="#/">
        ${logo(46)}
        <span><b>${s.school_short || 'Ecocistema Arrayán'}</b><small>Colegio Montessori</small></span>
      </a>
      <nav class="side-nav" aria-label="Principal">
        ${nav.map((n) => html`<a href="${n.href}" data-nav>${icon(n.icon)}<span>${n.label}</span></a>`)}
      </nav>
      <div class="side-foot">
        <div class="side-user">
          <span class="avatar">${initials(u.name)}</span>
          <span><b>${u.name}</b><small>${roleName(u.role)}</small></span>
        </div>
        <button class="btn btn-ghost btn-block" data-logout>${icon('logout')}Cerrar sesión</button>
      </div>
      <div class="side-art" aria-hidden="true">${raw(beadsArt())}</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="icon-btn topbar-back" id="topbar-back" href="#/" hidden aria-label="Volver">${icon('arrowLeft')}</a>
        <a class="topbar-logo" href="#/">${logo(34)}</a>
        <div class="topbar-title"><h1 id="page-title">Inicio</h1><small id="page-subtitle"></small></div>
        <a class="icon-btn" href="#/comunicados" aria-label="Comunicados">${icon('bell')}</a>
        <a class="icon-btn topbar-user" href="#/perfil" aria-label="Mi perfil"><span class="avatar avatar-sm">${initials(u.name)}</span></a>
      </header>
      <main id="view" class="view" tabindex="-1"></main>
    </div>
    <nav class="bottomnav" aria-label="Navegación inferior">
      ${bottom.map((n) => n.menu
        ? html`<button type="button" data-menu>${icon(n.icon)}<span>${n.label}</span></button>`
        : html`<a href="${n.href}" data-nav>${icon(n.icon)}<span>${n.label}</span></a>`)}
    </nav>
  </div>`.s;

  $$('[data-logout]').forEach((b) => b.addEventListener('click', logout));
  $('[data-menu]')?.addEventListener('click', () => openMenu(nav.slice(4)));
}

function openMenu(items) {
  modal({
    title: 'Más opciones',
    body: html`<div class="menu-list">
      ${items.map((n) => html`<a href="${n.href}" data-close-menu>${icon(n.icon)}<span>${n.label}</span>${icon('chevronRight', 'muted')}</a>`)}
      <button type="button" data-logout-menu class="danger">${icon('logout')}<span>Cerrar sesión</span></button>
    </div>`,
    onMount: (el, close) => {
      $$('[data-close-menu]', el).forEach((a) => a.addEventListener('click', () => close(null)));
      $('[data-logout-menu]', el).addEventListener('click', () => { close(null); logout(); });
    },
  });
}

function beadsArt() {
  // Cadena de perlas Montessori decorativa
  const colors = ['#D9534F', '#5E8C4A', '#E8A5A0', '#E2B04A', '#7FB3D5', '#9B7FC1', '#EFE6D5', '#8B5E3C', '#2F5D8A'];
  let out = '<svg viewBox="0 0 230 40" width="100%" height="40">';
  out += '<path d="M6 20 H224" stroke="#C9B79C" stroke-width="1.5"/>';
  colors.forEach((c, i) => { out += `<circle cx="${14 + i * 25}" cy="20" r="8" fill="${c}" stroke="rgba(0,0,0,.12)"/>`; });
  return out + '</svg>';
}

async function logout() {
  try { await post('/api/logout'); } catch { /* ignorar */ }
  state.me = null;
  location.hash = '#/';
  renderLogin();
}

// ---------- ingreso ----------
function heroArt() {
  return raw(`<svg class="hero-art" viewBox="0 0 420 360" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E7CF"/><stop offset="1" stop-color="#EBD9BA"/></linearGradient>
      <linearGradient id="bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A9542A"/><stop offset=".5" stop-color="#D88A4F"/><stop offset="1" stop-color="#B5642F"/></linearGradient>
    </defs>
    <circle cx="300" cy="90" r="38" fill="#F2C46B" opacity=".55"/>
    <path d="M0 300 C 90 270, 170 290, 260 280 S 400 270, 420 280 V360 H0z" fill="#9DB88A"/>
    <path d="M0 320 C 120 300, 220 320, 420 305 V360 H0z" fill="#7CA36A"/>
    <!-- arrayán -->
    <path d="M196 300 C 200 250, 186 220, 196 180 C 204 150, 214 140, 222 120" stroke="url(#bark)" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="M200 210 C 180 196, 160 190, 140 170" stroke="url(#bark)" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M206 170 C 230 160, 250 150, 270 132" stroke="url(#bark)" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M194 248 c -6 -4 -6 10 0 6 M206 196 c 6 -4 6 10 0 6" stroke="#F3C79A" stroke-width="3" fill="none"/>
    <g fill="#5E8C4A">
      <ellipse cx="210" cy="96" rx="78" ry="52"/><ellipse cx="142" cy="140" rx="54" ry="38"/><ellipse cx="276" cy="122" rx="56" ry="40"/>
    </g>
    <g fill="#7CA36A">
      <ellipse cx="190" cy="82" rx="50" ry="32"/><ellipse cx="256" cy="104" rx="40" ry="26"/><ellipse cx="132" cy="128" rx="34" ry="22"/>
    </g>
    <g fill="#fff">
      ${[[170, 70], [238, 86], [206, 112], [150, 140], [284, 124], [262, 70], [120, 122], [222, 60], [300, 140]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="4.5" cx="0" cy="-5"/><circle r="4.5" cx="5" cy="-1.5"/><circle r="4.5" cx="3" cy="4"/><circle r="4.5" cx="-3" cy="4"/><circle r="4.5" cx="-5" cy="-1.5"/><circle r="2.6" fill="#E2B04A"/></g>`).join('')}
    </g>
    <g fill="#4B2E4F">${[[186, 120], [244, 128], [160, 112], [270, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</g>
    <!-- torre rosa -->
    <g fill="#E8A5A0" stroke="#C97C77" stroke-width="1">
      <rect x="36" y="268" width="64" height="30" rx="2"/><rect x="42" y="242" width="52" height="26" rx="2"/><rect x="48" y="220" width="40" height="22" rx="2"/>
      <rect x="53" y="202" width="30" height="18" rx="2"/><rect x="57" y="188" width="22" height="14" rx="2"/><rect x="61" y="178" width="14" height="10" rx="1.5"/><rect x="64" y="171" width="8" height="7" rx="1"/>
    </g>
    <!-- barras numéricas -->
    <g>
      ${[0, 1, 2, 3, 4].map((i) => { const w = 40 + i * 22; let segs = ''; for (let k = 0; k < (i + 2); k++) { segs += `<rect x="${290 + k * (w / (i + 2))}" y="${300 - i * 12}" width="${w / (i + 2)}" height="9" fill="${k % 2 ? '#2F5D8A' : '#D9534F'}"/>`; } return segs; }).join('')}
    </g>
    <!-- perlas doradas -->
    <g fill="#E2B04A" stroke="#B98A2C" stroke-width=".8">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<circle cx="${130 + i * 9}" cy="318" r="4.2"/>`).join('')}</g>
  </svg>`);
}

function renderLogin(message = '') {
  const st = state.status || {};
  document.title = st.school_short || 'Ecocistema Arrayán';
  document.body.innerHTML = html`
  <div class="auth">
    <section class="auth-art">
      <div class="auth-art-inner">
        <div class="brand brand-light">${logo(56)}<span><b>${st.school_short || 'Ecocistema Arrayán'}</b><small>Colegio Montessori</small></span></div>
        ${heroArt()}
        <blockquote>“${st.motto || 'Ayúdame a hacerlo por mí mismo'}”<cite>— María Montessori</cite></blockquote>
      </div>
    </section>
    <section class="auth-form">
      <form class="auth-card" id="login-form" novalidate>
        <div class="auth-mobile-brand">${logo(64)}</div>
        <h1>Bienvenida, bienvenido</h1>
        <p class="muted">Ingresa con tu RUT y tu clave para revisar notas, evaluaciones y comunicados.</p>
        ${message ? html`<div class="form-info">${icon('check')}<span>${message}</span></div>` : ''}
        <div class="form-error" hidden></div>
        <label class="field">
          <span class="field-label">RUT</span>
          <span class="input-icon">${icon('user')}<input class="input" name="rut" inputmode="text" autocomplete="username" placeholder="12.345.678-9" required></span>
        </label>
        <label class="field">
          <span class="field-label">Clave</span>
          <span class="input-icon">${icon('key')}<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Tu clave" required>
          <button type="button" class="pw-toggle" aria-label="Mostrar clave">${icon('eye')}</button></span>
        </label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Ingresar ${icon('arrowRight')}</button>
        <p class="auth-help">${icon('alert')}<span>¿Olvidaste tu clave? Pídele a la dirección del colegio que la restablezca.</span></p>
        <div class="role-pills" aria-hidden="true">
          <span>${icon('shield')}Dirección</span><span>${icon('book')}Profesores</span><span>${icon('heart')}Apoderados</span>
        </div>
      </form>
    </section>
  </div>`.s;

  const form = $('#login-form');
  attachRutInput(form.rut);
  bindPwToggle(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form);
    err.hidden = true;
    const data = formData(form);
    if (!data.rut || !data.password) {
      err.hidden = false;
      err.innerHTML = html`${icon('alert')}<span>Ingresa tu RUT y tu clave.</span>`.s;
      return;
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await post('/api/login', data);
      await boot();
    } catch (ex) {
      err.hidden = false;
      err.innerHTML = html`${icon('alert')}<span>${ex.message}</span>`.s;
      btn.disabled = false;
    }
  });
}

function bindPwToggle(root) {
  $$('.pw-toggle', root).forEach((b) => b.addEventListener('click', () => {
    const input = b.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeOff' : 'eye').s;
  }));
}

function renderSetup() {
  document.title = 'Configuración inicial';
  document.body.innerHTML = html`
  <div class="auth">
    <section class="auth-art">
      <div class="auth-art-inner">
        <div class="brand brand-light">${logo(56)}<span><b>Ecocistema Arrayán</b><small>Colegio Montessori</small></span></div>
        ${heroArt()}
        <blockquote>“La primera tarea de la educación es agitar la vida, pero dejarla libre para que se desarrolle.”<cite>— María Montessori</cite></blockquote>
      </div>
    </section>
    <section class="auth-form">
      <form class="auth-card" id="setup-form" novalidate>
        <div class="auth-mobile-brand">${logo(64)}</div>
        <span class="eyebrow">${icon('sprout')} Primer inicio</span>
        <h1>Crea la cuenta de dirección</h1>
        <p class="muted">Esta será la cuenta con acceso total: podrá crear profesores, apoderados, cursos, estudiantes y editar todas las notas.</p>
        <div class="form-error" hidden></div>
        <label class="field"><span class="field-label">Nombre del colegio</span><input class="input" name="school_name" value="Colegio Montessori Ecocistema Arrayán"></label>
        <label class="field"><span class="field-label">Tu nombre completo</span><input class="input" name="name" autocomplete="name" required></label>
        <label class="field"><span class="field-label">Tu RUT</span><input class="input" name="rut" placeholder="12.345.678-9" required></label>
        <label class="field"><span class="field-label">Correo (opcional)</span><input class="input" name="email" type="email" autocomplete="email"></label>
        <label class="field"><span class="field-label">Clave (mínimo 6 caracteres)</span>
          <span class="input-icon">${icon('key')}<input class="input" name="password" type="password" autocomplete="new-password" required>
          <button type="button" class="pw-toggle" aria-label="Mostrar clave">${icon('eye')}</button></span></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Comenzar ${icon('arrowRight')}</button>
      </form>
    </section>
  </div>`.s;
  const form = $('#setup-form');
  attachRutInput(form.rut);
  bindPwToggle(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form);
    const data = formData(form);
    if (!isValid(data.rut)) {
      err.hidden = false;
      err.innerHTML = html`${icon('alert')}<span>El RUT no es válido.</span>`.s;
      return;
    }
    try {
      await post('/api/setup', data);
      await boot();
      toast('¡Listo! Tu plataforma está creada.');
    } catch (ex) {
      err.hidden = false;
      err.innerHTML = html`${icon('alert')}<span>${ex.message}</span>`.s;
    }
  });
}

export async function forcePasswordChange() {
  await modal({
    title: 'Crea tu clave personal',
    locked: true,
    body: html`<form class="form-grid">
      <p class="full muted">Por seguridad, reemplaza la clave temporal por una que solo tú conozcas.</p>
      <label class="field full"><span class="field-label">Clave temporal actual</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="field full"><span class="field-label">Nueva clave (mínimo 6 caracteres)</span><input class="input" type="password" name="password" autocomplete="new-password" required></label>
      <label class="field full"><span class="field-label">Repite la nueva clave</span><input class="input" type="password" name="password2" autocomplete="new-password" required></label>
    </form>`,
    actions: [{
      label: 'Guardar clave', kind: 'btn-primary', icon: 'check',
      onClick: async (el) => {
        const d = formData(el);
        if (d.password !== d.password2) { showFormError(el, 'Las claves no coinciden.'); return false; }
        await post('/api/me/password', d);
        toast('Clave actualizada');
        return true;
      },
    }],
  });
  state.me.must_change = false;
}

// ---------- arranque ----------
export async function refreshMe() {
  const me = await get('/api/me');
  state.me = me.user;
  state.settings = me.settings;
  state.students = me.students || [];
  return me;
}

async function boot() {
  try {
    await refreshMe();
  } catch {
    state.me = null;
    try { state.status = await get('/api/status'); } catch { state.status = {}; }
    if (state.status.setup_needed) renderSetup();
    else renderLogin();
    return;
  }
  document.body.innerHTML = '';
  renderShell();
  await render();
  if (state.me.must_change) await forcePasswordChange();
}

setUnauthorizedHandler(() => {
  if (!state.me) return;
  state.me = null;
  renderLogin();
  toast('Tu sesión expiró. Ingresa nuevamente.', 'error');
});

window.addEventListener('hashchange', () => { if (state.me) render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

boot();
