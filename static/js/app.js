(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const body = document.body;
  const BASE = body.dataset.base || '';
  const WA = body.dataset.wa || '';
  const fmt = n => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const waLink = msg => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Eventos de Google Analytics (gtag solo envía datos en el dominio publicado). Nunca se envían nombre ni ciudad
  const track = (name, params) => { try { window.gtag?.('event', name, params); } catch {} };
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

  // Los pedidos van directo a WhatsApp: ya no hay carrito. Se borra el que hubiera quedado guardado
  try { localStorage.removeItem('essenza_carrito_v1'); } catch {}

  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // selector de cantidad (ficha de producto)
  $$('[data-stepper]').forEach(st => {
    const input = $('[data-qty]', st), [dec, inc] = $$('[data-step]', st);
    const clamp = () => { const v = Math.max(1, Math.min(20, parseInt(input.value, 10) || 1)); input.value = v; dec.disabled = v <= 1; inc.disabled = v >= 20; };
    st.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; input.value = (parseInt(input.value, 10) || 1) + Number(b.dataset.step); clamp(); });
    input.addEventListener('change', clamp);
  });

  // ---------- pedir por WhatsApp: el enlace lleva cantidad y variante elegidas (mismo formato que orderMsg en render.mjs)
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-order]'); if (!a) return;
    const scope = a.closest('[data-product]') || (a.closest('[data-buy-bar]') && $('[data-product]'));
    const qty = scope ? Math.max(1, Math.min(20, parseInt($('[data-qty]', scope)?.value, 10) || 1)) : 1;
    const sel = scope && $('[data-variant]', scope);
    const variant = sel ? `${sel.dataset.label}: ${sel.value}` : '';
    const price = Number(a.dataset.price);
    const lines = [body.dataset.waPedido, '', `• ${a.dataset.name}${variant ? ` (${variant})` : ''} x${qty}: ${fmt(price * qty)}`, a.dataset.url, '', 'Nombre: ', 'Ciudad de envío: '];
    a.href = waLink(lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n'));
    track('generate_lead', { lead_source: scope ? 'pedido_ficha' : 'pedido_tarjeta', currency: 'COP', value: price * qty, items: [{ item_id: a.dataset.sku, item_name: a.dataset.name, item_variant: variant || undefined, price, quantity: qty }] });
  });

  // barra fija de pedido en móvil (ficha de producto): visible cuando el botón principal ya no se ve
  const bar = $('[data-buy-bar]'), mainBuy = $('.buy [data-order]');
  if (bar && mainBuy) {
    const sync = () => {
      const show = mainBuy.getBoundingClientRect().bottom < 0;
      if (bar.hidden === show) { bar.hidden = !show; body.classList.toggle('has-buy-bar', show); }
    };
    addEventListener('scroll', sync, { passive: true }); sync();
  }

  // galería
  $$('[data-thumb]').forEach(t => t.addEventListener('click', () => {
    const main = $('[data-main]'); if (!main) return;
    main.src = t.dataset.thumb;
    $$('[data-thumb]').forEach(x => x.setAttribute('aria-current', x === t));
  }));

  // ---------- formularios que abren WhatsApp (asesoría, contacto)
  $$('[data-wa-form]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    $$('[aria-invalid]', f).forEach(el => el.removeAttribute('aria-invalid'));
    const req = $$('[required]', f).find(el => !el.value.trim());
    if (req) { req.focus(); req.setAttribute('aria-invalid', 'true'); return; }
    const parts = $$('[data-label]', f).filter(el => el.value.trim()).map(el => `${el.dataset.label}: ${el.value.trim()}`);
    track('generate_lead', { lead_source: `formulario_${location.pathname.split('/').filter(Boolean).pop() || 'inicio'}` });
    window.open(waLink([f.dataset.prefix, '', ...parts].join('\n')), '_blank', 'noopener');
  }));

  // ---------- clics a WhatsApp (botón flotante, "Consultar por WhatsApp", asesoría, quiz)
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="https://wa.me/"]'); if (!a || a.matches('[data-order]')) return;
    track('contacto_whatsapp', { ubicacion: a.classList.contains('wa') ? 'boton_flotante' : (a.textContent.trim().slice(0, 40) || 'enlace') });
  });

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
    const search = $('[data-search]', L), sort = $('[data-sort]', L), empty = $('[data-empty]', L);
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
      $$('[data-count]', L).forEach(el => (el.textContent = n));
      if (empty) empty.hidden = n > 0;
      grid.hidden = n === 0;
    }
    panel?.addEventListener('change', apply);
    search?.addEventListener('input', apply);
    sort?.addEventListener('change', apply);
    $$('[data-clear]', L).forEach(b => b.addEventListener('click', () => { if (panel) $$('input', panel).forEach(i => (i.checked = false)); if (search) search.value = ''; apply(); }));
    const setPanel = o => { panel.classList.toggle('open', o); toggle.setAttribute('aria-expanded', o); };
    toggle?.addEventListener('click', () => setPanel(!panel.classList.contains('open')));
    // En móvil los grupos arrancan cerrados y "Ver N productos" cierra el panel y lleva a la rejilla
    if (panel && matchMedia('(max-width:900px)').matches) $$('details', panel).forEach(d => (d.open = false));
    $('[data-filters-done]', L)?.addEventListener('click', () => { setPanel(false); toggle?.focus(); (grid.hidden ? empty : grid)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); });
    apply();
  });

})();
