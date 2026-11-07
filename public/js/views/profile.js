import { put, post } from '../api.js';
import { setTitle, refreshMe } from '../app.js';
import { html, icon, formData, field, toast, $, roleName, initials, showFormError } from '../ui.js';
import { format as fmtRut } from '../rut.js';

export default async function profile({ el, state }) {
  setTitle('Mi perfil');
  const u = state.me;
  el.innerHTML = html`
    <section class="profile-hero">
      <div class="profile-banner" aria-hidden="true"></div>
      <span class="avatar avatar-xl">${initials(u.name)}</span>
      <h2>${u.name}</h2>
      <span class="chip chip-soft">${icon(u.role === 'admin' ? 'shield' : u.role === 'profesor' ? 'book' : 'heart')}${roleName(u.role)}</span>
      ${state.students?.length ? html`<p class="muted">Apoderado/a de ${state.students.map((s) => s.first_name).join(', ')}</p>` : ''}
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>${icon('user')}Datos personales</h3></div>
        <form class="form-grid" data-form-info>
          <label class="field full"><span class="field-label">RUT</span><input class="input" value="${fmtRut(u.rut)}" disabled></label>
          ${field({ label: 'Correo', name: 'email', type: 'email', value: u.email, full: true })}
          ${field({ label: 'Teléfono', name: 'phone', type: 'tel', value: u.phone, full: true })}
          <div class="full"><button class="btn btn-primary" type="submit">${icon('check')}Guardar</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('key')}Cambiar clave</h3></div>
        <form class="form-grid" data-form-pw>
          ${field({ label: 'Clave actual', name: 'current', type: 'password', full: true, attrs: 'autocomplete="current-password"' })}
          ${field({ label: 'Nueva clave', name: 'password', type: 'password', full: true, hint: 'Mínimo 6 caracteres', attrs: 'autocomplete="new-password"' })}
          ${field({ label: 'Repite la nueva clave', name: 'password2', type: 'password', full: true, attrs: 'autocomplete="new-password"' })}
          <div class="full"><button class="btn btn-primary" type="submit">${icon('key')}Cambiar clave</button></div>
        </form>
      </section>
    </div>
    <section class="card install-card">
      <div class="card-head"><h3>${icon('phoneApp')}Instala la app en tu celular</h3></div>
      <ul class="steps">
        <li><b>Android (Chrome):</b> menú ⋮ → <i>Instalar aplicación</i> o <i>Agregar a la pantalla principal</i>.</li>
        <li><b>iPhone (Safari):</b> botón Compartir → <i>Agregar a pantalla de inicio</i>.</li>
        <li><b>Computador:</b> ícono de instalar en la barra de direcciones de Chrome o Edge.</li>
      </ul>
    </section>
    <button class="btn btn-ghost btn-block mobile-only" data-logout-p>${icon('logout')}Cerrar sesión</button>`.s;

  $('[data-logout-p]', el).addEventListener('click', () => document.querySelector('[data-logout]')?.click());
  $('[data-form-info]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await put('/api/me', formData(e.target));
      await refreshMe();
      toast('Datos actualizados');
    } catch (err) { showFormError(e.target, err.message); }
  });
  $('[data-form-pw]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.password !== d.password2) return showFormError(e.target, 'Las claves nuevas no coinciden.');
    try {
      await post('/api/me/password', d);
      e.target.reset();
      e.target.querySelector('.form-error')?.remove();
      toast('Clave actualizada');
    } catch (err) { showFormError(e.target, err.message); }
  });
}
