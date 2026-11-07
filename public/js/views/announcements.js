import { get, post, del } from '../api.js';
import { setTitle, navigate, currentQuery, setQuery } from '../app.js';
import { html, icon, modal, formData, field, selectField, toast, confirmDialog, $, $$, showFormError } from '../ui.js';
import { announcementList } from './home.js';

export default async function announcements({ el, state }) {
  setTitle('Comunicados');
  const canPost = state.me.role !== 'apoderado';
  const items = await get('/api/announcements');
  el.innerHTML = html`
    <div class="page-head">
      <div><h2>Comunicados</h2><p class="muted">Noticias y avisos del colegio para las familias y el equipo.</p></div>
      ${canPost ? html`<button class="btn btn-primary" data-new>${icon('plus')}Nuevo comunicado</button>` : ''}
    </div>
    <div class="card" data-list>${announcementList(items)}</div>`.s;

  // Botón eliminar en comunicados propios (o todos, para dirección)
  if (canPost) {
    $$('.news', el).forEach((li, i) => {
      const a = items[i];
      if (state.me.role === 'admin' || a.author_id === state.me.id) {
        const b = document.createElement('button');
        b.className = 'icon-btn news-del';
        b.setAttribute('aria-label', 'Eliminar comunicado');
        b.innerHTML = icon('trash').s;
        b.addEventListener('click', async () => {
          if (!(await confirmDialog({ message: `Se eliminará el comunicado "${a.title}".` }))) return;
          await del(`/api/announcements/${a.id}`);
          toast('Comunicado eliminado');
          navigate(location.hash);
        });
        li.appendChild(b);
      }
    });
  }

  const open = async () => {
    const courses = await get('/api/courses');
    const isAdmin = state.me.role === 'admin';
    const ok = await modal({
      title: 'Nuevo comunicado',
      wide: true,
      body: html`<form class="form-grid">
        ${field({ label: 'Título', name: 'title', required: true, full: true, placeholder: 'Ej: Reunión de apoderados' })}
        ${selectField({ label: 'Dirigido a', name: 'course_id', full: true, options: [
          ...(isAdmin ? [{ value: '', label: 'Todo el colegio' }] : []),
          ...courses.map((c) => ({ value: c.id, label: c.name })),
        ] })}
        <label class="field full"><span class="field-label">Mensaje</span><textarea class="input" name="body" rows="6" placeholder="Escribe el comunicado…"></textarea></label>
        ${isAdmin ? html`<label class="field full check"><input type="checkbox" name="pinned"><span>Destacar al inicio</span></label>` : ''}
      </form>`,
      actions: [
        { label: 'Cancelar', value: null },
        {
          label: 'Publicar', kind: 'btn-primary', icon: 'megaphone',
          onClick: async (m) => {
            const d = formData(m);
            if (!d.title) { showFormError(m, 'Escribe un título.'); return false; }
            await post('/api/announcements', d);
            toast('Comunicado publicado');
            return true;
          },
        },
      ],
    });
    if (ok) navigate('#/comunicados');
  };
  $('[data-new]', el)?.addEventListener('click', open);
  if (canPost && currentQuery().get('nuevo')) { setQuery({}); open(); }
}
