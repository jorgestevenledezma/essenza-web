(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const body = document.body;
  const BASE = body.dataset.base || '';
  const WA = body.dataset.wa || '';
  const KEY = 'essenza_carrito_v1';
  const fmt = n => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const waLink = msg => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  const live = t => { const el = $('[data-live]'); if (el) { el.textContent = ''; setTimeout(() => (el.textContent = t), 30); } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Un solo aviso a la vez: si llega otro, reemplaza al anterior en lugar de amontonarse
  let toastEl = null, toastTimer = 0;
  const toast = t => {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); body.appendChild(toastEl); }
    toastEl.textContent = t; clearTimeout(toastTimer);
    requestAnimationFrame(() => toastEl.classList.add('show'));
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  // ---------- revelado al hacer scroll (una sola vez por elemento)
  window.__rv = true;
  const reveal = $$('[data-reveal],[data-stagger]');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -10% 0px' });
    reveal.forEach(el => {
      if (el.matches('[data-stagger]')) [...el.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 7)));
      io.observe(el);
    });
  } else document.documentElement.classList.remove('rv');

  // ---------- menú móvil
  const menuBtn = $('.menu-btn'), nav = $('#nav');
  const setMenu = open => { if (!menuBtn || !nav) return; nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); };
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    document.addEventListener('click', e => { if (nav.classList.contains('open') && !e.target.closest('#nav, .menu-btn')) setMenu(false); });
  }

  // ---------- carrito (localStorage)
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let cart = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {} render(); };
  const total = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = () => cart.reduce((s, i) => s + i.qty, 0);

  const bump = () => $$('.cart-btn').forEach(b => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
  // Un punto dorado sale del botón y aterriza en el carrito del encabezado (muestra a dónde fue el producto)
  function fly(from) {
    const to = $('.cart-btn');
    if (reduced || !to || !from.animate) return false;
    const a = from.getBoundingClientRect(), t = to.getBoundingClientRect();
    if (t.bottom < 0) return false;
    const dot = document.createElement('span'); dot.className = 'fly';
    dot.style.left = `${a.left + a.width / 2 - 9}px`; dot.style.top = `${a.top + a.height / 2 - 9}px`;
    body.appendChild(dot);
    const dx = t.left + t.width / 2 - (a.left + a.width / 2), dy = t.top + t.height / 2 - (a.top + a.height / 2);
    dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 60}px) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0.7 },
    ], { duration: 650, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }).onfinish = () => { dot.remove(); bump(); };
    return true;
  }

  function add(item, quiet, from) {
    const id = item.sku + '|' + (item.variant || '');
    const found = cart.find(i => i.id === id);
    if (found) found.qty = Math.min(20, found.qty + item.qty); else cart.push({ ...item, id });
    save(); if (!quiet) toast(`${item.name} se agregó al carrito`); live('Producto agregado al carrito');
    if (!(from && fly(from))) bump();
  }

  function itemsHTML() {
    if (!cart.length) return `<div class="cart-empty"><p class="h3">Tu carrito está vacío</p><p>Explora la selección o escríbenos y te ayudamos a elegir.</p><div class="actions"><a class="btn btn-sm" href="${BASE}tienda/">Ver la tienda</a><a class="btn btn-sm btn-outline" href="${BASE}asesoria/">Pedir asesoría</a></div></div>`;
    return cart.map(i => `<div class="ci" data-id="${esc(i.id)}">
<a class="ci-img" href="${BASE}${esc(i.url)}">${i.img ? `<img src="${BASE}${esc(i.img)}" alt="">` : ''}</a>
<div><a class="ci-name" href="${BASE}${esc(i.url)}">${esc(i.name)}</a>${i.variant ? `<p class="ci-var">${esc(i.variant)}</p>` : ''}
<div class="ci-qty"><button type="button" data-dec aria-label="Quitar una unidad">−</button><span aria-label="Cantidad">${i.qty}</span><button type="button" data-inc aria-label="Agregar una unidad">+</button></div></div>
<div class="ci-side"><span>${fmt(i.price * i.qty)}</span><button type="button" class="link" data-remove>Quitar</button></div></div>`).join('');
  }

  function render() {
    $$('[data-cart-page]').forEach(el => el.classList.toggle('is-empty', !cart.length));
    $$('[data-cart-count]').forEach(el => (el.textContent = count()));
    $$('[data-cart-items]').forEach(el => (el.innerHTML = itemsHTML()));
    $$('[data-cart-total]').forEach(el => (el.textContent = fmt(total())));
    $$('[data-cart-has]').forEach(el => (el.hidden = !cart.length));
  }

  document.addEventListener('click', e => {
    const row = e.target.closest('.ci');
    if (!row) return;
    const it = cart.find(i => i.id === row.dataset.id); if (!it) return;
    if (e.target.closest('[data-inc]')) it.qty = Math.min(20, it.qty + 1);
    else if (e.target.closest('[data-dec]')) it.qty = Math.max(1, it.qty - 1);
    else if (e.target.closest('[data-remove]')) { cart = cart.filter(i => i !== it); live('Producto eliminado'); }
    else return;
    save();
  });

  // drawer
  const drawer = $('[data-drawer]'), overlay = $('.drawer-overlay');
  let lastFocus = null;
  // Se quita [hidden], se fuerza un reflow y luego se agrega .open para que la transición corra en ambos sentidos
  const openDrawer = () => {
    if (!drawer || !drawer.hidden) return;
    lastFocus = document.activeElement; drawer.hidden = false; overlay.hidden = false; body.style.overflow = 'hidden';
    void drawer.offsetWidth; drawer.classList.add('open'); overlay.classList.add('open');
    $('[data-cart-close]', drawer)?.focus();
  };
  const closeDrawer = () => {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('open'); overlay.classList.remove('open'); body.style.overflow = '';
    const done = () => { if (!drawer.classList.contains('open')) { drawer.hidden = true; overlay.hidden = true; } };
    reduced ? done() : setTimeout(done, 380);
    lastFocus?.focus();
  };
  // El foco no sale del carrito lateral mientras está abierto
  drawer?.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button:not([disabled]),input,select,textarea', drawer).filter(el => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  $$('[data-cart-open]').forEach(b => b.addEventListener('click', () => (location.pathname.endsWith('/carrito/') ? null : openDrawer())));
  $$('[data-cart-close]').forEach(b => b.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); setMenu(false); } });

  // selector de cantidad (ficha de producto)
  $$('[data-stepper]').forEach(st => {
    const input = $('[data-qty]', st), [dec, inc] = $$('[data-step]', st);
    const clamp = () => { const v = Math.max(1, Math.min(20, parseInt(input.value, 10) || 1)); input.value = v; dec.disabled = v <= 1; inc.disabled = v >= 20; };
    st.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; input.value = (parseInt(input.value, 10) || 1) + Number(b.dataset.step); clamp(); });
    input.addEventListener('change', clamp);
  });

  // botones agregar
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add]'); if (!btn || btn.disabled) return;
    const scope = btn.closest('[data-product]');
    const qty = scope ? Math.max(1, Math.min(20, parseInt($('[data-qty]', scope)?.value, 10) || 1)) : 1;
    const sel = scope && $('[data-variant]', scope);
    const card = btn.closest('.card');
    const img = (scope ? $('[data-main]')?.getAttribute('src') : card && $('.card-media img', card)?.getAttribute('src')) || '';
    add({
      sku: btn.dataset.sku, name: btn.dataset.name, price: Number(btn.dataset.price), url: btn.dataset.url, qty,
      variant: sel ? `${sel.dataset.label}: ${sel.value}` : '', img: img.replace(BASE, '').replace(/^(\.\.\/)+/, ''),
    }, !scope, scope ? btn : null); // desde una tarjeta se abre el carrito lateral, que ya confirma la acción
    if (!scope) openDrawer();
  });

  // galería
  $$('[data-thumb]').forEach(t => t.addEventListener('click', () => {
    const main = $('[data-main]'); if (!main) return;
    main.src = t.dataset.thumb;
    $$('[data-thumb]').forEach(x => x.setAttribute('aria-current', x === t));
  }));

  // ---------- página carrito → WhatsApp
  const form = $('[data-order-form]');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const err = $('[data-error]', form);
    const d = new FormData(form);
    const nombre = String(d.get('nombre') || '').trim(), ciudad = String(d.get('ciudad') || '').trim(), notas = String(d.get('notas') || '').trim();
    const msg = !cart.length ? 'Tu carrito está vacío. Agrega al menos un producto.' : !nombre ? 'Escribe tu nombre para continuar.' : !ciudad ? 'Escribe la ciudad de envío para calcular el envío.' : '';
    if (msg) { err.textContent = msg; err.hidden = false; (form.querySelector(!nombre ? '[name=nombre]' : '[name=ciudad]'))?.focus(); return; }
    err.hidden = true;
    const lines = cart.map(i => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.qty}: ${fmt(i.price * i.qty)}`);
    const text = [body.dataset.waPedido, '', ...lines, '', `Total productos: ${fmt(total())} COP`, '', `Nombre: ${nombre}`, `Ciudad: ${ciudad}`, notas ? `Notas: ${notas}` : ''].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    window.open(waLink(text), '_blank', 'noopener');
  });

  // ---------- formularios que abren WhatsApp (asesoría, contacto)
  $$('[data-wa-form]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    $$('[aria-invalid]', f).forEach(el => el.removeAttribute('aria-invalid'));
    const req = $$('[required]', f).find(el => !el.value.trim());
    if (req) { req.focus(); req.setAttribute('aria-invalid', 'true'); return; }
    const parts = $$('[data-label]', f).filter(el => el.value.trim()).map(el => `${el.dataset.label}: ${el.value.trim()}`);
    window.open(waLink([f.dataset.prefix, '', ...parts].join('\n')), '_blank', 'noopener');
  }));

  // ---------- diagnóstico guiado
  const quiz = $('[data-quiz]');
  if (quiz) {
    const steps = $$('[data-step]', quiz), result = $('[data-quiz-result]', quiz);
    let answers = [], cat = null;
    const show = i => { steps.forEach((s, j) => (s.hidden = j !== i)); result.hidden = i < steps.length; if (i < steps.length) $('button', steps[i])?.focus(); };
    quiz.addEventListener('click', e => {
      const a = e.target.closest('[data-answer]');
      if (a) {
        if (a.dataset.cat) cat = { slug: a.dataset.cat, name: a.dataset.name };
        answers.push(a.textContent.trim());
        if (answers.length >= steps.length) {
          $('[data-quiz-name]', quiz).textContent = cat ? cat.name : 'la tienda';
          $('[data-quiz-link]', quiz).href = cat ? `${BASE}categoria/${cat.slug}/` : `${BASE}tienda/`;
          $('[data-quiz-wa]', quiz).href = waLink(`Hola Diana, hice el diagnóstico en la web:\n• ${answers.join('\n• ')}\n¿Qué me recomiendas?`);
          show(steps.length); $('[data-quiz-link]', quiz).focus();
        } else show(answers.length);
      }
      if (e.target.closest('[data-quiz-reset]')) { answers = []; cat = null; show(0); }
    });
  }

  // ---------- filtros, búsqueda y orden
  $$('[data-listing]').forEach(L => {
    const grid = $('[data-grid]', L); if (!grid) return;
    const cards = $$('.card', grid);
    cards.forEach(c => (c._f = JSON.parse(c.dataset.f || '[]')));
    const search = $('[data-search]', L), sort = $('[data-sort]', L), countEl = $('[data-count]', L), empty = $('[data-empty]', L);
    const panel = $('[data-filters]', L), toggle = $('[data-filters-toggle]', L);
    const params = new URLSearchParams(location.search);
    if (search && params.get('q')) search.value = params.get('q');
    if (sort && params.get('orden')) sort.value = params.get('orden');
    if (panel) params.forEach((v, k) => { const cb = $(`input[name="${CSS.escape(k)}"][value="${CSS.escape(v)}"]`, panel); if (cb) cb.checked = true; });
    if (location.hash === '#buscar' && search) setTimeout(() => search.focus(), 50);
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function apply() {
      const groups = {};
      if (panel) $$('input:checked', panel).forEach(cb => (groups[cb.name] = groups[cb.name] || []).push(`${cb.name}:${cb.value}`));
      const q = search ? norm(search.value.trim()).split(/\s+/).filter(Boolean) : [];
      let n = 0;
      cards.forEach(c => {
        const ok = Object.values(groups).every(vals => vals.some(v => c._f.includes(v))) && q.every(w => c.dataset.name.includes(w));
        c.hidden = !ok; if (ok) n++;
      });
      const mode = sort ? sort.value : 'recomendados';
      const key = { recomendados: c => +c.dataset.order, nuevos: c => -c.dataset.new * 1e6 + +c.dataset.order, 'precio-asc': c => +c.dataset.price, 'precio-desc': c => -c.dataset.price }[mode] || (c => +c.dataset.order);
      cards.slice().sort((a, b) => key(a) - key(b)).forEach(c => grid.appendChild(c));
      if (countEl) countEl.textContent = n;
      if (empty) empty.hidden = n > 0;
      grid.hidden = n === 0;
    }
    panel?.addEventListener('change', apply);
    search?.addEventListener('input', apply);
    sort?.addEventListener('change', apply);
    $$('[data-clear]', L).forEach(b => b.addEventListener('click', () => { if (panel) $$('input', panel).forEach(i => (i.checked = false)); if (search) search.value = ''; apply(); }));
    toggle?.addEventListener('click', () => { const o = panel.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); });
    apply();
  });

  render();
})();
