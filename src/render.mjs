// ESSENZA by Diana Caliz — generador de páginas estáticas (sin dependencias).
// Lo usa scripts/build.mjs. Recibe los datos del Excel y devuelve { ruta: html }.

export const slugify = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => '$' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const PEND = /pendiente de validaci/i;
// Promesas médicas que no deben publicarse (ver hoja Instrucciones del Excel)
const MEDICO = /\b(cura[rn]?|curativ[oa]s?|elimina[rn]?|garantiza(do|da|mos)?|quema grasa|adelgaza|trata(miento)? de enfermedad|milagros[oa])\b/i;
const PUBLICOS = ['nombre', 'descripcion_corta', 'por_que_lo_recomendamos', 'para_quien', 'descripcion_completa', 'beneficios', 'caracteristicas', 'modo_uso', 'seo_title', 'meta_description'];
// Cierre para descriptions cortas: se usa la frase más larga que quepa en 155 caracteres
const DESC_EXTRA = [' Asesoría personalizada, empaque discreto y envíos a Colombia.', ' Asesoría personalizada y envíos a Colombia.', ' Envíos a Colombia.'];
// Google Analytics 4. Solo se carga en el dominio publicado, para que `npm run dev` no ensucie las estadísticas
const GA_ID = 'G-FTGK818FD4';
const FONTS ='https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap';
const str = v => (v == null ? '' : String(v).trim());
const has = v => str(v) !== '' && !PEND.test(String(v));
const list = v => (has(v) ? String(v).split('|').map(x => x.trim()).filter(x => x && !PEND.test(x)) : []);
const yes = v => /^s[ií]/i.test(str(v));
const tpl = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const paras = t => String(t).split(/\n+/).map(x => `<p>${esc(x)}</p>`).join('');
const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

const LABELS = {
  estimulacion: 'Tipo de estimulación', uso: 'Uso', experiencia: 'Nivel de experiencia', control: 'Control',
  resistente_agua: 'Resistente al agua', carga: 'Carga', material: 'Material', intensidad: 'Intensidad', tamano: 'Tamaño',
  ruido: 'Nivel de ruido', tipo_de_piel: 'Tipo de piel', necesidad: 'Necesidad', paso_rutina: 'Paso de la rutina',
  ingrediente: 'Ingrediente', textura: 'Textura', spf: 'Protección solar', objetivo: 'Objetivo', presentacion: 'Presentación', tipo: 'Tipo',
};
const attrLabel = k => LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

// ---------------------------------------------------------------- datos
export function normalize(raw) {
  const warnings = [];
  const cfg = {};
  for (const r of raw.config || []) if (str(r.clave)) cfg[str(r.clave)] = str(r.valor);

  const cats = [], catBy = {};
  for (const r of raw.categorias || []) {
    const name = str(r.categoria); if (!name) continue;
    let c = catBy[name];
    if (!c) { c = catBy[name] = { name, slug: str(r.slug) || slugify(name), desc: '', subs: [] }; cats.push(c); }
    if (str(r.descripcion_categoria)) c.desc = str(r.descripcion_categoria);
    if (str(r.subcategoria)) c.subs.push(str(r.subcategoria));
  }
  const brands = [], brandBy = {};
  for (const r of raw.marcas || []) {
    const name = str(r.marca); if (!name || brandBy[name]) continue;
    brands.push(brandBy[name] = { name, slug: str(r.slug) || slugify(name), universo: str(r.universo), desc: str(r.descripcion_marca) });
  }

  const products = [], skus = new Set(), slugs = new Set();
  let skipped = 0;
  (raw.productos || []).forEach((r, i) => {
    const fila = r._fila || i + 2;
    if (!str(r.sku) && !str(r.nombre)) return; // fila vacía del Excel
    if (str(r.estado).toLowerCase() !== 'validado') { skipped++; return; }
    const sku = str(r.sku), nombre = str(r.nombre), marca = str(r.marca), categoria = str(r.categoria), precio = Number(r.precio);
    const faltan = [];
    if (!sku) faltan.push('sku');
    if (!nombre) faltan.push('nombre');
    if (!marca) faltan.push('marca');
    if (!catBy[categoria]) faltan.push('categoría válida');
    if (!(precio > 0)) faltan.push('precio');
    if (!has(r.descripcion_corta)) faltan.push('descripcion_corta');
    if (faltan.length) { warnings.push(`Fila ${fila} (${sku || nombre || 'sin nombre'}): no se publica, falta ${faltan.join(', ')}.`); skipped++; return; }
    if (skus.has(sku)) { warnings.push(`Fila ${fila}: SKU duplicado ${sku}, se omite.`); skipped++; return; }
    skus.add(sku);
    if (!brandBy[marca]) { brands.push(brandBy[marca] = { name: marca, slug: slugify(marca), universo: '', desc: '' }); warnings.push(`Marca "${marca}" no está en la hoja Marcas; se creó automáticamente.`); }
    let slug = str(r.slug) || slugify(`${nombre} ${marca}`);
    if (slugs.has(slug)) slug = `${slug}-${slugify(sku)}`;
    slugs.add(slug);
    const atributos = list(r.atributos).map(pair => {
      const [k, ...rest] = pair.split(':');
      const key = slugify(k).replace(/-/g, '_');
      return { key, label: attrLabel(key), values: rest.join(':').split(',').map(x => x.trim()).filter(Boolean) };
    }).filter(a => a.key && a.values.length);
    let variacion = null;
    if (has(r.variaciones)) {
      const m = str(r.variaciones).match(/^([^:|]+):(.+)$/);
      variacion = m ? { label: m[1].trim(), options: m[2].split('|').map(x => x.trim()).filter(Boolean) } : { label: 'Opción', options: list(r.variaciones) };
    }
    const promo = Number(r.precio_promocional);
    const disp = str(r.disponibilidad).toLowerCase() || 'disponible';
    const pend = Object.entries(r).filter(([, v]) => PEND.test(String(v ?? ''))).map(([k]) => k);
    if (pend.length) warnings.push(`${sku}: campos "pendiente de validación" ocultos en la web → ${pend.join(', ')}.`);
    for (const k of PUBLICOS) { const m = str(r[k]).match(MEDICO); if (m) warnings.push(`${sku}: posible promesa médica "${m[0]}" en ${k}. Usa "ayuda a", "contribuye a", "acompaña".`); }
    const t = k => (has(r[k]) ? str(r[k]) : '');
    products.push({
      order: products.length, sku, nombre, marca, brand: brandBy[marca], cat: catBy[categoria], subcategoria: t('subcategoria'), slug,
      precio, promo: promo > 0 && promo < precio ? promo : null, disponibilidad: disp, agotado: disp === 'agotado',
      corta: t('descripcion_corta'), porque: t('por_que_lo_recomendamos'), paraQuien: t('para_quien'), completa: t('descripcion_completa'),
      beneficios: list(r.beneficios), caracteristicas: list(r.caracteristicas), materiales: t('ingredientes_materiales'),
      modoUso: t('modo_uso'), precauciones: t('precauciones'), presentacion: t('presentacion'), dimensiones: t('dimensiones'), peso: t('peso'),
      variacion, atributos, adultos: yes(r.solo_adultos), destacado: yes(r.destacado), nuevo: yes(r.nuevo), relacionados: list(r.relacionados),
      imagenes: (raw.imagenes && raw.imagenes[sku]) || [], alt: t('texto_alternativo') || `${nombre} · ${marca}`,
      seoTitle: t('seo_title'), metaDesc: t('meta_description'),
    });
  });
  products.forEach(p => {
    p.final = p.promo || p.precio;
    if (!p.imagenes.length) warnings.push(`${p.sku}: sin imágenes en catalogo/productos/${p.sku}/`);
    const faltantes = p.relacionados.filter(s => !skus.has(s));
    if (faltantes.length) warnings.push(`${p.sku}: relacionados que no están publicados → ${faltantes.join(', ')}.`);
  });
  if (!/^57\d{10}$/.test(str(cfg.whatsapp_numero).replace(/\D/g, '')) || /x/i.test(str(cfg.whatsapp_numero))) warnings.push(`Config: whatsapp_numero "${cfg.whatsapp_numero || ''}" no es válido (formato 573001234567). Los botones de WhatsApp no funcionarán.`);
  return { cfg, cats, brands, products, warnings, skipped };
}

// ---------------------------------------------------------------- sitio
export function buildSite(data, opts = {}) {
  const { cfg, cats: todasCats, brands } = data;
  // Orden "recomendados": primero lo general (piel, equilibrio…), luego kits y al final bienestar íntimo y todo lo +18,
  // para que quien llega a la tienda no se encuentre de entrada con productos para adultos. Dentro de cada grupo, el orden del Excel
  const catRank = c => ({ 'kits-y-rituales': 100, 'bienestar-intimo': 101 }[c.slug] ?? todasCats.indexOf(c));
  const products = [...data.products]
    .sort((a, b) => (a.adultos - b.adultos) || (catRank(a.cat) - catRank(b.cat)) || (a.order - b.order))
    .map((p, i) => Object.assign(p, { order: i }));
  // Categorías sin productos publicados: su página existe (sin indexar) pero no aparecen en menús, inicio ni llms.txt
  const cats = todasCats.filter(c => products.some(p => p.cat === c));
  const dominio = str(cfg.dominio).replace(/\/$/, '');
  // Dominio sin "www." y con los puntos escapados, para la expresión regular que activa Google Analytics
  const host = dominio.replace(/^https?:\/\/(www\.)?/, '').replace(/\./g, '\\.');
  const WA = str(cfg.whatsapp_numero).replace(/\D/g, '');
  const assets = opts.assets || [];
  const blog = opts.blog || [];
  const year = opts.year || new Date().getFullYear();
  const pages = {};
  const urlOf = path => `${dominio}/${path.replace(/index\.html$/, '')}`;
  const waHref = msg => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  const msgGeneral = cfg.mensaje_general || 'Hola Diana, quisiera recibir asesoría.';
  const msgCat = c => tpl(cfg.mensaje_categoria || 'Hola Diana, tengo una consulta sobre {categoria}.', { categoria: c.name });
  const mainCats = cats.filter(c => c.slug !== 'kits-y-rituales');
  const social = [cfg.instagram, cfg.facebook, cfg.tiktok].filter(has);
  const MISION = 'Acompañamos a nuestros clientes en el cuidado integral de su piel, su bienestar y su intimidad mediante productos cuidadosamente seleccionados y asesoría personalizada, creando experiencias que fortalecen la confianza, la salud y el equilibrio en cada etapa de la vida.';

  // Recuadro elegante cuando falta una foto: el cliente ve el monograma, el build avisa qué archivo falta
  const ph = alt => `<div class="ph" role="img" aria-label="${esc(alt)}"><span class="ph-mark" aria-hidden="true">E</span></div>`;
  const missing = new Set();
  const asset = (b, name, alt, label, eager) => {
    const f = assets.find(a => a.replace(/\.[^.]+$/, '') === name);
    if (!f) missing.add(name);
    return f ? `<img src="${b}img/${esc(f)}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">` : ph(alt);
  };
  const crumbs = (b, items) => `<nav class="crumbs" aria-label="Migas de pan"><a href="${b}">Inicio</a>${items.map(([t, h]) => `<span aria-hidden="true">/</span>${h ? `<a href="${b}${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join('')}</nav>`;
  const priceHTML = p => (p.promo ? `<s>${fmt(p.precio)}</s> ${fmt(p.promo)}` : fmt(p.precio));
  const dispText = p => ({ agotado: 'Agotado por ahora', 'por encargo': 'Disponible por encargo' }[p.disponibilidad] || 'Disponible');
  const searchKey = p => slugify(`${p.nombre} ${p.marca} ${p.corta} ${p.cat.name} ${p.subcategoria} ${p.atributos.flatMap(a => a.values).join(' ')}`).replace(/-/g, ' ');

  // Pedido directo por WhatsApp (sin carrito). static/js/app.js arma el mismo mensaje con la cantidad y la variante elegidas
  // Productos +18: el mensaje solo lleva la referencia (sin nombre ni enlace) para que el chat y las notificaciones sean discretos
  const orderName = p => (p.adultos ? `Ref. ${p.sku}` : `${p.nombre} · ${p.marca}`);
  const orderUrl = p => (p.adultos ? '' : urlOf(`producto/${p.slug}/index.html`));
  const orderMsg = (p, qty = 1, variant = '') => [
    cfg.mensaje_pedido || 'Hola Diana, quiero hacer este pedido:', '',
    `• ${orderName(p)}${variant ? ` (${variant})` : ''} x${qty}: ${fmt(p.final * qty)}`,
    orderUrl(p), '', 'Nombre: ', 'Ciudad de envío: ',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const orderBtn = (p, b, cls) => {
    if (p.agotado) return `<button type="button" class="${cls}" disabled>Agotado por ahora</button>`;
    if (p.variacion && cls.includes('btn-sm')) return `<a class="${cls}" href="${b}producto/${p.slug}/">Elegir ${esc(p.variacion.label.toLowerCase())}</a>`;
    return `<a class="${cls} btn-wa" href="${waHref(orderMsg(p, 1, p.variacion ? `${p.variacion.label}: ${p.variacion.options[0]}` : ''))}" target="_blank" rel="noopener" data-order data-sku="${esc(p.sku)}" data-name="${esc(orderName(p))}" data-price="${p.final}" data-url="${esc(orderUrl(p))}" aria-label="Pedir ${esc(p.nombre)} por WhatsApp"><svg class="wa-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8.2 8.2 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c.7.3 1.3.5 1.7.6a4.2 4.2 0 0 0 1.9.1 3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.2-.6-.4zM12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.2 24l6.4-1.7a11.8 11.8 0 0 0 5.4 1.4h.1A11.8 11.8 0 0 0 20.5 3.5z" fill="currentColor"/></svg>${cls.includes('btn-sm') ? 'Pedir' : 'Pedir por WhatsApp'}</a>`;
  };

  const card = (b, p) => {
    const f = [`cat:${p.cat.slug}`, `marca:${p.brand.slug}`, ...p.atributos.flatMap(a => a.values.map(v => `${a.key}:${v}`))];
    const badges = [p.nuevo && 'Novedad', p.promo && 'Oferta', p.agotado && 'Agotado'].filter(Boolean);
    return `<article class="card" data-name="${esc(searchKey(p))}" data-price="${p.final}" data-order="${p.order}" data-new="${p.nuevo ? 1 : 0}" data-f="${esc(JSON.stringify(f))}">
<a class="media card-media" href="${b}producto/${p.slug}/" tabindex="-1" aria-hidden="true" style="view-transition-name:p-${p.slug}">${p.imagenes[0] ? `<img src="${b}${p.imagenes[0]}" alt="" loading="lazy" decoding="async" width="800" height="1000">` : ph(p.alt).replace('role="img" ', '')}${badges.length ? `<span class="badges">${badges.map(t => `<span class="badge">${t}</span>`).join('')}</span>` : ''}</a>
<div class="card-body"><p class="meta">${esc(p.marca)}</p><h3 class="card-title"><a href="${b}producto/${p.slug}/">${esc(p.nombre)}</a></h3><p class="card-desc">${esc(p.corta)}</p><p class="price">${priceHTML(p)}</p>${orderBtn(p, b, 'btn btn-sm btn-block')}</div>
</article>`;
  };

  const listing = (b, ps, { search, showCat, showBrand } = {}) => {
    const groups = new Map();
    if (showCat) groups.set('cat', { label: 'Categoría', values: new Map(cats.filter(c => ps.some(p => p.cat === c)).map(c => [c.slug, c.name])) });
    if (showBrand) groups.set('marca', { label: 'Marca', values: new Map(brands.filter(m => ps.some(p => p.brand === m)).map(m => [m.slug, m.name])) });
    for (const p of ps) for (const a of p.atributos) {
      if (!groups.has(a.key)) groups.set(a.key, { label: a.label, values: new Map() });
      a.values.forEach(v => groups.get(a.key).values.set(v, v));
    }
    const filters = [...groups].filter(([, g]) => g.values.size > 1);
    return `<div class="listing" data-listing>
<div class="toolbar">${search ? `<label class="search"><span class="sr">Buscar productos</span><input type="search" id="buscar" data-search placeholder="Buscar por nombre, marca o necesidad" autocomplete="off"></label>` : ''}
<p class="meta"><span data-count>${ps.length}</span> productos</p>
${filters.length ? `<button type="button" class="btn btn-outline btn-sm filters-btn" data-filters-toggle aria-expanded="false" aria-controls="filtros">Filtros</button>` : ''}
<label class="sort"><span class="sr">Ordenar</span><select data-sort><option value="recomendados">Recomendados</option><option value="nuevos">Novedades</option><option value="precio-asc">Precio: menor a mayor</option><option value="precio-desc">Precio: mayor a menor</option></select></label></div>
<div class="listing-body${filters.length ? '' : ' no-filters'}">
${filters.length ? `<aside class="filters" id="filtros" data-filters aria-label="Filtros">${filters.map(([k, g]) => `<details class="fgroup" open><summary>${esc(g.label)}</summary><div class="fopts">${[...g.values].map(([v, l]) => `<label class="check"><input type="checkbox" name="${esc(k)}" value="${esc(v)}"> ${esc(l)}</label>`).join('')}</div></details>`).join('')}<div class="filters-foot"><button type="button" class="btn btn-sm btn-block filters-done" data-filters-done>Ver <span data-count>${ps.length}</span> productos</button><button type="button" class="link" data-clear>Limpiar filtros</button></div></aside>` : ''}
<div>${ps.length ? `<div class="grid-products" data-grid>${ps.map(p => card(b, p)).join('')}</div>
<div class="empty" data-empty hidden><p>No encontramos productos con esos filtros.</p><div class="actions center"><button type="button" class="btn btn-outline btn-sm" data-clear>Limpiar filtros</button><a class="btn btn-sm" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Pedir asesoría</a></div></div>`
      : `<div class="empty"><p>Muy pronto encontrarás productos aquí.</p><p class="muted">Mientras tanto, cuéntanos qué buscas y te orientamos.</p><a class="btn btn-sm" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div>`}</div>
</div></div>`;
  };

  const layout = (path, p) => {
    const depth = path.split('/').length - 1;
    const b = p.base ?? '../'.repeat(depth);
    const url = urlOf(path);
    const nav = [['tienda', 'Tienda'], ['marcas', 'Marcas'], ['asesoria', 'Asesoría'], ['blog', 'Blog'], ['nosotros', 'Nosotros'], ['contacto', 'Contacto']];
    const cur = k => (p.active === k ? ' aria-current="page"' : '');
    const og = p.og || (assets.find(a => a.startsWith('og.')) ? `img/${assets.find(a => a.startsWith('og.'))}` : '');
    const social = [['Instagram', cfg.instagram], ['Facebook', cfg.facebook], ['TikTok', cfg.tiktok]].filter(x => has(x[1]));
    // Description entre 120 y 155 caracteres: las cortas (vienen del Excel) se completan para que Google no las
    // reemplace por texto al azar, y las largas se recortan en una palabra para que no queden cortadas en el resultado
    const fit = s => (s.length <= 155 ? s : `${s.slice(0, 154).replace(/[\s,;:.]+\S*$/, '')}…`);
    const base = str(p.desc).replace(/\.?$/, '.');
    const desc = p.noindex ? str(p.desc) : fit(base.length >= 120 ? base : base + (DESC_EXTRA.find(x => (base + x).length <= 155) ?? ''));
    return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(desc)}">
${p.noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${esc(url)}">`}
${p.adult ? '<meta name="rating" content="adult">\n' : ''}
<meta property="og:type" content="${p.ogType || 'website'}">
<meta property="og:site_name" content="ESSENZA by Diana Caliz">
<meta property="og:locale" content="es_CO">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${og ? `<meta property="og:image" content="${esc(dominio + '/' + og)}">\n<meta property="og:image:alt" content="${esc(p.ogAlt || p.title)}">` : ''}
<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="icon" href="${b}favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#F8F5EF">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="${FONTS}" rel="stylesheet"></noscript>
<link rel="stylesheet" href="${b}css/styles.css">
<script>if(/(^|\\.)${esc(host)}$/.test(location.hostname)){var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id=${GA_ID}';document.head.appendChild(g)}window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>
<script>document.documentElement.classList.add('rv');setTimeout(function(){if(!window.__rv)document.documentElement.classList.remove('rv')},4000)</script>
${[p.jsonld].flat().filter(Boolean).map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body data-base="${b}" data-wa="${esc(WA)}" data-wa-pedido="${esc(cfg.mensaje_pedido || 'Hola Diana, quiero hacer este pedido:')}">
<a class="skip" href="#main">Saltar al contenido</a>
<div class="topbar"><span>Envíos a Colombia</span><span>Empaque discreto</span><span>Pedidos por WhatsApp</span><span>Asesoría personalizada</span></div>
<header class="header"><div class="header-in">
<button type="button" class="menu-btn" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú"><span></span><span></span><span></span></button>
<a class="logo" href="${b}" aria-label="ESSENZA by Diana Caliz, inicio">ESSENZA<small>BY DIANA CALIZ</small></a>
<nav id="nav" class="nav" aria-label="Principal">
<div class="nav-drop"><a href="${b}tienda/"${cur('tienda')}>Tienda</a><div class="drop">${cats.map(c => `<a href="${b}categoria/${c.slug}/">${esc(c.name)}</a>`).join('')}<a href="${b}tienda/?orden=nuevos">Novedades</a></div></div>
${nav.slice(1).map(([k, t]) => `<a href="${b}${k}/"${cur(k)}>${t}</a>`).join('')}
</nav>
<div class="tools"><a class="icon-btn" href="${b}tienda/#buscar" aria-label="Buscar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></a></div>
</div></header>
<main id="main">
${p.body(b)}
</main>
<footer class="footer">
<div class="footer-grid">
<div><p class="footer-logo">ESSENZA</p><p class="footer-sub">BY DIANA CALIZ</p><p class="footer-text">Cuidado de la piel, equilibrio interno y bienestar íntimo con asesoría personalizada. Colombia.</p>${social.length ? `<p class="footer-social">${social.map(([t, h]) => `<a href="${esc(h)}" target="_blank" rel="noopener">${t}</a>`).join('')}</p>` : ''}</div>
<div><h2 class="footer-h">Tienda</h2><ul>${cats.map(c => `<li><a href="${b}categoria/${c.slug}/">${esc(c.name)}</a></li>`).join('')}<li><a href="${b}marcas/">Marcas</a></li></ul></div>
<div><h2 class="footer-h">Ayuda</h2><ul><li><a href="${b}preguntas-frecuentes/">Preguntas frecuentes</a></li><li><a href="${b}envios-y-cambios/">Envíos y cambios</a></li><li><a href="${waHref(msgGeneral)}" target="_blank" rel="noopener">WhatsApp</a></li><li><a href="${b}contacto/">Contacto</a></li></ul></div>
<div><h2 class="footer-h">Legal</h2><ul><li><a href="${b}privacidad/">Privacidad y tratamiento de datos</a></li><li><a href="${b}terminos/">Términos y condiciones</a></li></ul></div>
</div>
<div class="footer-bottom"><span>© ${year} ESSENZA by Diana Caliz</span><span>Pedido, pago y envío se coordinan por WhatsApp</span></div>
</footer>
<a class="wa" href="${waHref(p.wa || msgGeneral)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8.2 8.2 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c.7.3 1.3.5 1.7.6a4.2 4.2 0 0 0 1.9.1 3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.2-.6-.4zM12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.2 24l6.4-1.7a11.8 11.8 0 0 0 5.4 1.4h.1A11.8 11.8 0 0 0 20.5 3.5z" fill="currentColor"/></svg><span>Asesoría</span></a>
<script src="${b}js/app.js" defer></script>
</body>
</html>`;
  };
  const put = (path, p) => { pages[path] = layout(path, p); if (p.noindex) noindex.add(path); };
  const noindex = new Set();
  // BreadcrumbList para Google: mismos pasos que las migas visibles. items = [[nombre, ruta]]
  const bcLD = items => ({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['Inicio', ''], ...items].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${dominio}/${path}` })),
  });
  const ORG = { '@type': 'Organization', name: 'ESSENZA by Diana Caliz', url: `${dominio}/` };

  // ------------------------------------------------ inicio
  // El inicio no muestra productos +18 (siguen en la tienda y en su categoría)
  const general = products.filter(p => !p.adultos);
  // Sin `destacado` en el Excel: uno por categoría, primero los que tienen foto
  const conFoto = [...general].sort((a, b) => !a.imagenes.length - !b.imagenes.length);
  const porCat = conFoto.filter((p, i) => conFoto.findIndex(x => x.cat === p.cat) === i);
  const destacados = (general.some(p => p.destacado) ? general.filter(p => p.destacado) : [...new Set([...porCat, ...conFoto])]).slice(0, 4);
  const kits = general.filter(p => p.cat.slug === 'kits-y-rituales' && !destacados.includes(p)).slice(0, 4);
  const kitCat = cats.find(c => c.slug === 'kits-y-rituales');
  put('index.html', {
    title: 'ESSENZA by Diana Caliz | Piel, equilibrio e intimidad',
    desc: 'Una selección cuidada de productos para tu piel, tu equilibrio y tu intimidad, con asesoría personalizada y empaque discreto. Envíos a Colombia.',
    jsonld: [
      {
        '@context': 'https://schema.org', ...ORG, '@type': 'OnlineStore', founder: { '@type': 'Person', name: 'Diana Caliz' },
        description: 'Cuidado de la piel, equilibrio interno y bienestar íntimo con asesoría personalizada. Envíos a Colombia.',
        areaServed: { '@type': 'Country', name: 'Colombia' }, currenciesAccepted: 'COP',
        ...(has(cfg.email) && { email: cfg.email }),
        ...(/^57\d{10}$/.test(WA) && { contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', telephone: `+${WA}`, availableLanguage: 'es' } }),
        ...(social.length && { sameAs: social }),
      },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'ESSENZA by Diana Caliz', url: `${dominio}/`, inLanguage: 'es-CO' },
    ],
    body: b => `
<section class="hero"><div class="hero-text">
<p class="eyebrow line">Autocuidado consciente</p>
<h1 class="display hero-title" aria-label="Tu piel. Tu bienestar. Tu esencia.">${'Tu piel. Tu bienestar. Tu esencia.'.split(' ').map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ')}</h1>
<p class="lead">Una selección cuidada de productos para tu piel, tu equilibrio y tu intimidad, acompañada de asesoría personalizada.</p>
<div class="actions"><a class="btn" href="${b}tienda/">Descubrir ESSENZA</a><a class="btn btn-outline" href="${b}asesoria/">Recibir asesoría</a></div>
</div><div class="media hero-media media-reveal is-hero">${asset(b, 'hero', 'Productos ESSENZA sobre lino con luz natural', 'Foto hero 4:5 — static/img/hero.jpg', true)}</div></section>

<section class="section white bordered"><div class="narrow center" data-reveal>
<p class="eyebrow">Nuestra filosofía</p>
<h2 class="h2">Menos productos. Mejor seleccionados. Mejor explicados.</h2>
<p class="muted">No buscamos tener miles de referencias. Cada producto que entra a ESSENZA pasa por un criterio de selección y llega acompañado de la información y la asesoría para elegirlo bien.</p>
<blockquote class="mision">“${MISION}”</blockquote>
</div></section>

<section class="section"><div class="inner center">
<p class="eyebrow">Tres universos, una sola casa</p><h2 class="h2">Elige por dónde empezar</h2>
<div class="grid-3 left" data-stagger>${mainCats.slice(0, 3).map(c => `<a class="tile" href="${b}categoria/${c.slug}/"><div class="media tile-media">${asset(b, 'universo-' + c.slug, c.name, 'Foto ' + c.name)}</div><div class="tile-body"><h3 class="h3">${esc(c.name)}</h3><p class="muted">${esc(c.desc)}</p><span class="more">Explorar →</span></div></a>`).join('')}</div>
</div></section>

<section class="split"><div class="media media-reveal" data-reveal>${asset(b, 'diana', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana.jpg')}</div>
<div class="split-text"><p class="eyebrow">Asesoría personalizada</p><h2 class="h2">No tienes que elegir sola.</h2>
<p class="muted">Estamos aquí para orientarte. Cuéntanos qué estás buscando y recibe una recomendación personalizada, cercana y confidencial.</p>
<div class="actions"><a class="btn" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Hablar por WhatsApp</a><a class="btn btn-outline" href="${b}asesoria/">Cómo funciona</a></div></div></section>

<section class="section sand"><div class="narrow center">
<p class="eyebrow">Diagnóstico guiado</p><h2 class="h2">Encuentra tu ritual</h2>
<p class="muted">Tres preguntas breves y te sugerimos por dónde empezar. No es un diagnóstico médico.</p>
<div class="quiz" data-quiz data-reveal>
<div data-step><p class="eyebrow">Pregunta 1 de 3</p><p class="quiz-q">¿Qué te gustaría cuidar hoy?</p><div class="chips">${mainCats.slice(0, 3).map(c => `<button type="button" class="chip" data-answer data-cat="${c.slug}" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join('')}${kitCat ? `<button type="button" class="chip" data-answer data-cat="${kitCat.slug}" data-name="${esc(kitCat.name)}">Busco un regalo</button>` : ''}</div></div>
<div data-step hidden><p class="eyebrow">Pregunta 2 de 3</p><p class="quiz-q">¿Cómo te describes frente a este tema?</p><div class="chips"><button type="button" class="chip" data-answer>Estoy empezando</button><button type="button" class="chip" data-answer>Ya tengo experiencia</button><button type="button" class="chip" data-answer>Busco algo específico</button></div></div>
<div data-step hidden><p class="eyebrow">Pregunta 3 de 3</p><p class="quiz-q">¿Para quién es?</p><div class="chips"><button type="button" class="chip" data-answer>Para mí</button><button type="button" class="chip" data-answer>Para compartir en pareja</button><button type="button" class="chip" data-answer>Para regalar</button></div></div>
<div data-quiz-result hidden><p class="quiz-q">Te sugerimos empezar por <strong data-quiz-name></strong>.</p><p class="muted">Si quieres una recomendación más precisa, envía tus respuestas a Diana.</p><div class="actions"><a class="btn" data-quiz-link href="${b}tienda/">Ver la selección</a><a class="btn btn-outline" data-quiz-wa href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div><button type="button" class="link quiz-reset" data-quiz-reset>Volver a empezar</button></div>
</div></div></section>

${destacados.length ? `<section class="section"><div class="inner">
<div class="section-head" data-reveal><div><h2 class="h2">Selección curada</h2><p class="muted">Pocos productos, elegidos con criterio.</p></div><a class="more" href="${b}tienda/">Ver la tienda →</a></div>
<div class="grid-products four" data-stagger>${destacados.map(p => card(b, p)).join('')}</div></div></section>` : ''}

${kits.length ? `<section class="section white bordered"><div class="inner">
<div class="section-head" data-reveal><div><p class="eyebrow">Kits y rituales</p><h2 class="h2">Rituales para regalar(te)</h2></div><a class="more" href="${b}categoria/kits-y-rituales/">Ver todos →</a></div>
<div class="grid-products four" data-stagger>${kits.map(p => card(b, p)).join('')}</div></div></section>` : ''}

<section class="section dark"><div class="pillars" data-stagger>
<div><h3>Selección responsable</h3><p>Cada producto pasa por una revisión de marca, materiales e información antes de publicarse.</p></div>
<div><h3>Información clara</h3><p>Fichas con beneficios, modo de uso y precauciones, sin promesas médicas.</p></div>
<div><h3>Privacidad primero</h3><p>Empaque discreto y conversaciones confidenciales en cada pedido.</p></div>
<div><h3>Acompañamiento</h3><p>Asesoría humana antes y después de tu compra.</p></div>
</div></section>

${brands.some(m => products.some(p => p.brand === m)) ? `<section class="section-sm bordered"><div class="brands" data-reveal><span class="eyebrow">Marcas</span>${brands.filter(m => products.some(p => p.brand === m)).map(m => `<a href="${b}marca/${m.slug}/">${esc(m.name)}</a>`).join('')}</div></section>` : ''}

${blog.length ? `<section class="section"><div class="inner">
<div class="section-head" data-reveal><h2 class="h2">Aprender a cuidarte</h2><a class="more" href="${b}blog/">Ver el blog →</a></div>
<div class="grid-3" data-stagger>${blog.slice(0, 3).map(a => postCard(b, a)).join('')}</div></div></section>` : ''}

${has(cfg.newsletter_action) ? `<section class="section sand"><div class="narrow center">
<h2 class="h2">Un espacio para cuidarte mejor</h2><p class="muted">Una carta al mes con rutinas, hábitos y novedades. Puedes salir cuando quieras.</p>
<form class="newsletter" action="${esc(cfg.newsletter_action)}" method="post" target="_blank"><label class="sr" for="nl-email">Correo electrónico</label><input id="nl-email" type="email" name="EMAIL" required placeholder="Tu correo electrónico" autocomplete="email"><button class="btn" type="submit">Suscribirme</button></form>
<p class="meta">Al suscribirte aceptas nuestra <a class="link" href="${b}privacidad/">política de tratamiento de datos</a>.</p>
</div></section>` : ''}`,
  });

  function postCard(b, a) {
    return `<a class="post" href="${b}blog/${a.slug}/"><div class="media post-media">${asset(b, 'blog-' + a.slug, a.titulo, 'Foto 3:2 — static/img/blog-' + a.slug + '.jpg')}</div><p class="tag">${esc(a.etiqueta)}</p><h3 class="post-title">${esc(a.titulo)}</h3><p class="meta">${esc(a.lectura)}</p></a>`;
  }

  // ------------------------------------------------ tienda y categorías
  put('tienda/index.html', {
    title: 'Tienda · ESSENZA by Diana Caliz', active: 'tienda',
    desc: 'Toda la selección ESSENZA: cuidado de la piel, equilibrio interno, bienestar íntimo y kits elegidos por Diana Caliz. Pedidos por WhatsApp.',
    body: b => `<section class="page-head">${crumbs(b, [['Tienda']])}<h1 class="h1">Tienda</h1><p class="muted">Toda la selección ESSENZA en un solo lugar. Filtra por categoría, marca o necesidad.</p></section>${listing(b, products, { search: true, showCat: true, showBrand: true })}`,
  });

  const GUIDES = {
    'cuidado-de-la-piel': ['Los tres pasos básicos', [['Limpieza suave', 'Retira impurezas sin resecar. Es la base para que el resto de la rutina funcione.'], ['Hidratación diaria', 'Elige la textura según tu tipo de piel: gel para piel grasa, crema para piel seca.'], ['Protección solar', 'Todos los días, incluso nublado. Reaplica cada 2 o 3 horas si estás al aire libre.']], 'Estas guías son orientativas. Si tienes una condición en la piel, consulta con un dermatólogo.'],
    'equilibrio-interno': ['Antes de elegir', [['Cosméticos, suplementos y homeopáticos', 'Cada producto indica a qué grupo pertenece. No son intercambiables entre sí.'], ['Hábitos primero', 'Ningún producto reemplaza el descanso, la alimentación y el movimiento.'], ['Consulta profesional', 'Si tomas medicamentos, estás en embarazo o lactancia, consulta antes con tu médico.']], 'Los suplementos no son medicamentos y no reemplazan una alimentación balanceada.'],
    'bienestar-intimo': ['Antes de elegir, tres cosas que ayudan', [['Conócete primero', 'Identifica qué te genera curiosidad o comodidad. No hay una forma correcta de empezar.'], ['Materiales y seguridad', 'Prioriza silicona de grado médico y verifica la compatibilidad con lubricantes a base de agua.'], ['Privacidad en cada paso', 'Del empaque discreto a la conversación confidencial: tu proceso es solo tuyo.']], 'Productos para personas mayores de 18 años.'],
  };
  for (const c of todasCats) {
    const ps = products.filter(p => p.cat === c);
    const g = GUIDES[c.slug];
    put(`categoria/${c.slug}/index.html`, {
      title: `${c.name} · ESSENZA by Diana Caliz`, active: 'tienda', wa: msgCat(c),
      jsonld: bcLD([['Tienda', 'tienda/'], [c.name, `categoria/${c.slug}/`]]),
      desc: `${c.desc ? c.desc.replace(/\.?$/, '.') + ' ' : ''}${c.name}: ${ps.length} productos seleccionados por Diana Caliz.`,
      adult: ps.length > 0 && ps.every(p => p.adultos), noindex: !ps.length,
      body: b => `<section class="page-head">${crumbs(b, [['Tienda', 'tienda/'], [c.name]])}<h1 class="h1">${esc(c.name)}</h1>${c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ''}
<div class="chips-row"><span class="pill">Empaque discreto</span><span class="pill">Asesoría confidencial</span>${c.slug === 'bienestar-intimo' ? '<span class="pill">Sin prejuicios</span>' : ''}</div></section>
${g ? `<section class="guide-wrap"><h2 class="h3">${g[0]}</h2><div class="guide" data-stagger>${g[1].map(([t, d]) => `<div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div><p class="meta">${g[2]}</p></section>` : ''}
${listing(b, ps, { showBrand: true })}`,
    });
  }

  // ------------------------------------------------ marcas
  put('marcas/index.html', {
    title: 'Marcas · ESSENZA by Diana Caliz', active: 'marcas',
    desc: 'Las marcas que seleccionamos por sus materiales, su información verificable y su coherencia con el autocuidado consciente.',
    body: b => `<section class="page-head center">${crumbs(b, [['Marcas']])}<p class="eyebrow">Selección responsable</p><h1 class="h1">Las marcas que elegimos</h1><p class="muted mx">Trabajamos con marcas que cumplen nuestros criterios: materiales seguros, información verificable y coherencia con una experiencia de autocuidado consciente.</p></section>
<section class="inner pad-x pad-b"><div class="grid-2" data-stagger>${brands.map(m => { const n = products.filter(p => p.brand === m).length; return `<a class="brand-card" href="${b}marca/${m.slug}/"><div class="brand-top"><h2 class="h3">${esc(m.name)}</h2>${m.universo ? `<span class="badge">${esc(m.universo)}</span>` : ''}</div>${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}<span class="more">${n ? `Ver ${n} producto${n > 1 ? 's' : ''} →` : 'Próximamente'}</span></a>`; }).join('')}</div></section>`,
  });
  for (const m of brands) {
    const ps = products.filter(p => p.brand === m);
    const enCats = cats.filter(c => ps.some(p => p.cat === c)).map(c => c.name.toLowerCase());
    put(`marca/${m.slug}/index.html`, {
      title: `${m.name} · ESSENZA by Diana Caliz`, active: 'marcas',
      jsonld: bcLD([['Marcas', 'marcas/'], [m.name, `marca/${m.slug}/`]]),
      // Marca con menos de 2 productos publicados: página delgada, no se indexa hasta que tenga más catálogo
      noindex: ps.length < 2,
      // Generada desde el catálogo (no desde la hoja Marcas) para que cada marca tenga una description única y verificable
      desc: `${m.name} en ESSENZA: ${ps.length === 1 ? 'un producto' : `${ps.length} productos`} de ${enCats.join(' y ') || 'nuestra selección'} ${ps.length === 1 ? 'elegido' : 'elegidos'} por Diana Caliz.`,
      adult: ps.length > 0 && ps.every(p => p.adultos),
      body: b => `<section class="page-head">${crumbs(b, [['Marcas', 'marcas/'], [m.name]])}<h1 class="h1">${esc(m.name)}</h1>${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}</section>${listing(b, products.filter(p => p.brand === m), { showCat: true })}`,
    });
  }

  // ------------------------------------------------ producto
  for (const p of products) {
    const url = urlOf(`producto/${p.slug}/index.html`);
    const waMsg = tpl(cfg.mensaje_producto || 'Hola Diana, me interesa {producto}: {url}', { producto: `${p.nombre} · ${p.marca}`, url, categoria: p.cat.name });
    const rel = [...p.relacionados.map(s => products.find(x => x.sku === s)).filter(Boolean), ...products.filter(x => x.cat === p.cat)].filter((x, i, a) => x !== p && a.indexOf(x) === i).slice(0, 4);
    const specs = [['Presentación', p.presentacion], ['Dimensiones', p.dimensiones], ['Peso', p.peso], ...p.atributos.map(a => [a.label, a.values.join(', ')])].filter(r => r[1]);
    put(`producto/${p.slug}/index.html`, {
      title: p.seoTitle || (p.marca === 'ESSENZA' ? `${p.nombre} | ESSENZA` : `${p.nombre} · ${p.marca} | ESSENZA`), active: 'tienda', wa: waMsg, ogType: 'product',
      desc: p.metaDesc || p.corta, og: p.imagenes[0] || '', ogAlt: p.alt, adult: p.adultos,
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'Product', name: p.nombre, sku: p.sku, description: p.corta, category: p.cat.name,
        brand: { '@type': 'Brand', name: p.marca }, ...(p.imagenes.length && { image: p.imagenes.map(i => `${dominio}/${i}`) }),
        offers: {
          '@type': 'Offer', price: p.final, priceCurrency: 'COP', url, itemCondition: 'https://schema.org/NewCondition', seller: ORG,
          availability: `https://schema.org/${{ agotado: 'OutOfStock', 'por encargo': 'BackOrder' }[p.disponibilidad] || 'InStock'}`,
        },
      }, bcLD([['Tienda', 'tienda/'], [p.cat.name, `categoria/${p.cat.slug}/`], [p.nombre, `producto/${p.slug}/`]])],
      body: b => {
        const acc = [
          ['¿Para quién es?', p.paraQuien && `<p>${esc(p.paraQuien)}</p>`],
          ['Descripción', p.completa && paras(p.completa)],
          ['Beneficios', p.beneficios.length && ul(p.beneficios)],
          ['Características', p.caracteristicas.length && ul(p.caracteristicas)],
          [p.cat.slug === 'bienestar-intimo' ? 'Materiales' : 'Ingredientes y materiales', p.materiales && `<p>${esc(p.materiales)}</p>`],
          ['Modo de uso', p.modoUso && paras(p.modoUso)],
          ['Precauciones', p.precauciones && paras(p.precauciones)],
          ['Especificaciones', specs.length && `<table class="specs">${specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`],
          ['Envíos y empaque', `<p>${esc(cfg.texto_envio || 'Envíos a Colombia en empaque 100% discreto.')}</p><p><a class="link" href="${b}envios-y-cambios/">Ver envíos y cambios</a></p>`],
        ].filter(x => x[1]);
        return `<div class="page-head">${crumbs(b, [['Tienda', 'tienda/'], [p.cat.name, `categoria/${p.cat.slug}/`], [p.nombre]])}</div>
<section class="product">
<div class="gallery"><div class="media main-img" style="view-transition-name:p-${p.slug}">${p.imagenes[0] ? `<img src="${b}${p.imagenes[0]}" alt="${esc(p.alt)}" data-main width="1200" height="1500" fetchpriority="high">` : ph(p.alt)}</div>
${p.imagenes.length > 1 ? `<div class="thumbs">${p.imagenes.map((src, i) => `<button type="button" data-thumb="${b}${src}" aria-label="Ver imagen ${i + 1}" aria-current="${i === 0}"><img src="${b}${src}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
<div class="info" data-product>
<p class="meta"><a href="${b}marca/${p.brand.slug}/">${esc(p.marca)}</a></p>
<h1>${esc(p.nombre)}</h1>
<p class="muted">${esc(p.corta)}</p>
<div><p class="price-lg">${priceHTML(p)} <small>COP</small></p><p class="stock${p.agotado ? ' out' : ''}">${dispText(p)}</p></div>
${p.porque ? `<div class="reco"><p class="eyebrow">Por qué lo recomendamos</p><p>${esc(p.porque)}</p></div>` : ''}
${p.variacion ? `<label class="field">${esc(p.variacion.label)}<select data-variant data-label="${esc(p.variacion.label)}">${p.variacion.options.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>` : ''}
<div class="buy">${p.agotado ? '' : `<div class="qty" data-stepper><button type="button" data-step="-1" aria-label="Quitar una unidad" disabled>−</button><input class="qty-input" type="number" min="1" max="20" value="1" data-qty inputmode="numeric" aria-label="Cantidad"><button type="button" data-step="1" aria-label="Agregar una unidad">+</button></div>`}${orderBtn(p, b, 'btn grow')}</div>
${p.agotado
  ? `<a class="btn btn-outline" href="${waHref(`Hola Diana, quiero saber cuándo vuelve ${p.nombre} · ${p.marca}: ${url}`)}" target="_blank" rel="noopener">Avísame cuando vuelva</a>`
  : `<p class="buy-note">Diana te confirma por WhatsApp disponibilidad, envío y forma de pago. ¿Dudas antes de pedir? <a class="link" href="${waHref(waMsg)}" target="_blank" rel="noopener">Pregúntale aquí</a>.</p>`}
${p.adultos ? `<p class="notice"><strong>+18</strong> ${esc(cfg.aviso_adultos || 'Producto para uso exclusivo de personas mayores de 18 años.')}</p>` : ''}
<ul class="trust"><li>Empaque 100% discreto</li><li>Asesoría personalizada y confidencial</li><li>Pedido y pago coordinados por WhatsApp</li></ul>
</div></section>
${p.agotado ? '' : `<div class="buy-bar" data-buy-bar hidden><p class="buy-bar-price">${priceHTML(p)}</p>${orderBtn(p, b, 'btn grow')}</div>`}
<section class="details">${acc.map(([t, c], i) => `<details${i < 2 ? ' open' : ''}><summary>${t}</summary><div class="content">${c}</div></details>`).join('')}</section>
${rel.length ? `<section class="related"><h2 class="h2">También te puede interesar</h2><div class="grid-products four" data-stagger>${rel.map(x => card(b, x)).join('')}</div></section>` : ''}`;
      },
    });
  }

  // ------------------------------------------------ carrito (retirado: los pedidos van directo a WhatsApp)
  put('carrito/index.html', {
    title: 'Pedidos por WhatsApp · ESSENZA by Diana Caliz', desc: 'Pide cada producto directamente por WhatsApp desde su ficha.', noindex: true,
    body: b => `<section class="page-head">${crumbs(b, [['Pedidos']])}<h1 class="h1">Ahora pides directo por WhatsApp</h1><p class="muted">Ya no necesitas carrito: en cada producto toca «Pedir por WhatsApp» y Diana te confirma disponibilidad, envío y forma de pago. Si quieres varios productos, cuéntaselo en la misma conversación.</p>
<div class="actions"><a class="btn" href="${b}tienda/">Ver la tienda</a><a class="btn btn-outline" href="${waHref('Hola Diana, quiero hacer un pedido.')}" target="_blank" rel="noopener">Escribir a Diana</a></div></section>`,
  });

  // ------------------------------------------------ asesoría
  const catOptions = [...mainCats.map(c => c.name), 'Un regalo', 'Prefiero contarlo por chat'];
  put('asesoria/index.html', {
    title: 'Asesoría personalizada · ESSENZA by Diana Caliz', active: 'asesoria',
    desc: 'Cuéntanos qué estás buscando y recibe por WhatsApp una recomendación personalizada, cercana y confidencial para tu piel, tu equilibrio o tu intimidad.',
    body: b => `<section class="split hero-split"><div class="media">${asset(b, 'diana', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana.jpg', true)}</div>
<div class="split-text"><p class="eyebrow">Asesoría personalizada</p><h1 class="h1">No tienes que elegir sola.</h1>
<p class="muted">Estamos aquí para orientarte. Cuéntanos qué estás buscando (una rutina para tu piel, un hábito de bienestar o un paso en tu intimidad) y recibe una recomendación personalizada, cercana y confidencial.</p>
<ul class="trust row"><li>Conversación confidencial</li><li>Sin juicios</li><li>Sin compromiso de compra</li></ul></div></section>
<section class="inner pad-x section-y two-col">
<div><h2 class="h2">Cómo funciona</h2><div class="steps" data-stagger>
<div class="step"><b>1</b><p>Nos cuentas qué buscas y para qué momento: piel, equilibrio interno o intimidad.</p></div>
<div class="step"><b>2</b><p>Te hacemos pocas preguntas para entender tu caso, con total confidencialidad.</p></div>
<div class="step"><b>3</b><p>Recibes una recomendación con el porqué de cada elección.</p></div></div>
<p class="meta spaced">La asesoría es orientativa y no reemplaza la consulta con un profesional de la salud.</p></div>
<form class="panel" data-wa-form data-prefix="${esc(msgGeneral)}">
<h2 class="h3">Escríbenos</h2><p class="muted">Al enviar se abre WhatsApp con tu mensaje listo. No guardamos esta información en el sitio.</p>
<label class="field">Nombre<input data-label="Nombre" autocomplete="given-name" required></label>
<label class="field">¿Sobre qué quieres asesoría?<select data-label="Tema">${catOptions.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
<label class="field">Cuéntanos brevemente (opcional)<textarea data-label="Mensaje" rows="4"></textarea></label>
<button class="btn btn-block" type="submit">Continuar en WhatsApp</button></form>
</section>`,
  });

  // ------------------------------------------------ nosotros
  put('nosotros/index.html', {
    title: 'Nosotros · ESSENZA by Diana Caliz', active: 'nosotros',
    desc: 'ESSENZA une cuidado de la piel, equilibrio interno y bienestar íntimo en una sola conversación, con productos seleccionados y asesoría personalizada.',
    body: b => `<section class="page-head center narrow">${crumbs(b, [['Nosotros']])}<p class="eyebrow">Nuestra historia</p><h1 class="h1">El bienestar no se divide en categorías.</h1>
<p class="muted mx">ESSENZA nace de una convicción: cuidar la piel, el cuerpo y la intimidad son parte de una misma conversación. Una conversación que merece información clara, productos seguros y cero prejuicios.</p></section>
<section class="split"><div class="media media-reveal" data-reveal>${asset(b, 'diana-nosotros', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana-nosotros.jpg')}</div>
<div class="split-text"><h2 class="h2">Diana Caliz</h2><p class="muted">Detrás de cada recomendación hay una persona real. Diana acompaña a cada cliente con cercanía y confidencialidad: escucha primero y recomienda después.</p>
<blockquote class="mision left">“${MISION}”</blockquote><a class="btn" href="${b}asesoria/">Conocer la asesoría</a></div></section>
<section class="section"><div class="inner"><h2 class="h2 center">Lo que nos guía</h2><div class="grid-3 values" data-stagger>
<div><h3 class="h3">Educación sin juicios</h3><p class="muted">Explicamos sin tecnicismos, sin alarmas y sin promesas médicas.</p></div>
<div><h3 class="h3">Privacidad como principio</h3><p class="muted">Empaque discreto, conversaciones confidenciales y datos tratados con respeto.</p></div>
<div><h3 class="h3">Selección responsable</h3><p class="muted">Menos productos, mejor seleccionados y mejor explicados.</p></div></div></div></section>
<section class="section sand"><div class="narrow center"><h2 class="h2">Empieza por donde quieras.</h2><p class="muted">Explora la tienda o escríbenos para una recomendación a tu medida.</p><div class="actions center spaced"><a class="btn" href="${b}tienda/">Ir a la tienda</a><a class="btn btn-outline" href="${b}asesoria/">Recibir asesoría</a></div></div></section>`,
  });

  // ------------------------------------------------ contacto
  put('contacto/index.html', {
    title: 'Contacto · ESSENZA by Diana Caliz', active: 'contacto',
    desc: 'Escríbenos por WhatsApp, correo o redes. Toda conversación es confidencial.',
    body: b => `<section class="inner pad-x section-y two-col">
<div>${crumbs(b, [['Contacto']])}<p class="eyebrow">Contacto</p><h1 class="h1">Estamos para escucharte.</h1><p class="muted spaced">Escríbenos por el canal que prefieras. Toda conversación es confidencial.</p>
<dl class="channels">
<div><dt>WhatsApp</dt><dd><a class="link" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Iniciar conversación →</a></dd></div>
${has(cfg.email) ? `<div><dt>Correo</dt><dd><a class="link" href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></dd></div>` : ''}
${has(cfg.instagram) ? `<div><dt>Instagram</dt><dd><a class="link" href="${esc(cfg.instagram)}" target="_blank" rel="noopener">Ver perfil →</a></dd></div>` : ''}
${has(cfg.horario) ? `<div><dt>Horario de atención</dt><dd>${esc(cfg.horario)}</dd></div>` : ''}
</dl></div>
<form class="panel" data-wa-form data-prefix="Hola, escribo desde la web de ESSENZA.">
<h2 class="h3">Envíanos un mensaje</h2><p class="muted">Se abrirá WhatsApp con tu mensaje listo para enviar.</p>
<label class="field">Nombre<input data-label="Nombre" autocomplete="name" required></label>
<label class="field">Asunto<select data-label="Asunto"><option>Asesoría de producto</option><option>Estado de mi pedido</option><option>Cambios y devoluciones</option><option>Alianzas y marcas</option><option>Otro</option></select></label>
<label class="field">Mensaje<textarea data-label="Mensaje" rows="5" required></textarea></label>
<button class="btn btn-block" type="submit">Continuar en WhatsApp</button></form>
</section>`,
  });

  // ------------------------------------------------ blog
  put('blog/index.html', {
    title: 'Blog · ESSENZA by Diana Caliz', active: 'blog',
    desc: 'Rutinas de piel, hábitos de equilibrio interno e intimidad consciente, explicados con calma.',
    body: b => `<section class="page-head center">${crumbs(b, [['Blog']])}<p class="eyebrow">El diario ESSENZA</p><h1 class="h1">Aprender a cuidarte</h1><p class="muted mx">Rutinas de piel, hábitos de equilibrio interno e intimidad consciente, explicados con calma y sin sensacionalismo.</p></section>
<section class="inner pad-x pad-b"><div class="grid-3" data-stagger>${blog.map(a => postCard(b, a)).join('')}</div></section>`,
  });
  for (const a of blog) {
    const c = todasCats.find(x => x.slug === a.categoria);
    const ps = c ? products.filter(p => p.cat === c).slice(0, 4) : [];
    put(`blog/${a.slug}/index.html`, {
      title: a.titulo.length > 52 ? a.titulo : `${a.titulo} · ESSENZA`, active: 'blog', ogType: 'article', desc: a.resumen,
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'Article', headline: a.titulo, description: a.resumen, inLanguage: 'es-CO',
        author: a.autor ? { '@type': 'Person', name: a.autor } : ORG, publisher: ORG, mainEntityOfPage: urlOf(`blog/${a.slug}/index.html`),
        ...(a.fecha && { datePublished: a.fecha }), ...(a.actualizado && { dateModified: a.actualizado }),
        ...(assets.some(f => f.startsWith(`blog-${a.slug}.`)) && { image: `${dominio}/img/${assets.find(f => f.startsWith(`blog-${a.slug}.`))}` }),
      }, bcLD([['Blog', 'blog/'], [a.titulo, `blog/${a.slug}/`]])],
      og: (assets.find(f => f.startsWith(`blog-${a.slug}.`)) && `img/${assets.find(f => f.startsWith(`blog-${a.slug}.`))}`) || undefined,
      body: b => `<article><header class="page-head narrow">${crumbs(b, [['Blog', 'blog/'], [a.titulo]])}<p class="tag">${esc(a.etiqueta)} · ${esc(a.lectura)}</p><h1 class="h1">${esc(a.titulo)}</h1><p class="lead spaced">${esc(a.resumen)}</p></header>
<div class="narrow pad-x"><div class="media post-hero">${asset(b, 'blog-' + a.slug, a.titulo, 'Foto 16:9 — static/img/blog-' + a.slug + '.jpg')}</div></div>
<div class="prose">${a.cuerpo.map(([t, x]) => (t === 'h' ? `<h2>${esc(x)}</h2>` : `<p>${esc(x)}</p>`)).join('')}
<div class="cta-box"><p class="h3">¿Quieres una recomendación para ti?</p><p class="muted">Cuéntanos qué buscas y te orientamos de forma confidencial.</p><a class="btn" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Hablar por WhatsApp</a></div></div></article>
${ps.length ? `<section class="related"><h2 class="h2">Productos relacionados</h2><div class="grid-products four" data-stagger>${ps.map(p => card(b, p)).join('')}</div></section>` : ''}`,
    });
  }

  // ------------------------------------------------ páginas legales y ayuda
  const PENDIENTE = `<span class="pending">Estamos terminando de redactar esta sección. Si tienes una duda, <a href="${waHref(msgGeneral)}" target="_blank" rel="noopener">escríbenos por WhatsApp</a> y te respondemos.</span>`;
  const pendientes = [];
  // Una sección con texto propio puede traer HTML (párrafos y listas); el resto va en un <p>
  const legal = (slug, title, desc, sections) => (sections.some(([, t]) => t.includes(PENDIENTE)) && pendientes.push(`${slug}: ${sections.filter(([, t]) => t.includes(PENDIENTE)).map(([h]) => h).join(', ')}`), put(`${slug}/index.html`, {
    title: `${title} · ESSENZA by Diana Caliz`, desc,
    // Mientras tenga textos pendientes no se indexa: contenido incompleto no debe aparecer en Google
    noindex: sections.some(([, t]) => t.includes(PENDIENTE)),
    body: b => `<section class="page-head narrow">${crumbs(b, [[title]])}<h1 class="h1">${title}</h1>${vigencia ? `<p class="meta">Vigente desde ${vigencia}</p>` : ''}</section><div class="prose">${sections.map(([h, t]) => `<h2>${h}</h2>${t.startsWith('<') ? t : `<p>${t}</p>`}`).join('')}</div>`,
  }));
  // Datos que solo Diana conoce (hoja Config). Si falta alguno, la sección que lo usa queda pendiente.
  const dato = k => (has(cfg[k]) ? esc(cfg[k]) : '');
  const conDatos = (keys, html) => (keys.every(k => has(cfg[k])) ? html() : PENDIENTE);
  const vigencia = dato('politica_vigencia');
  const waTxt = WA ? `+${WA.slice(0, 2)} ${WA.slice(2, 5)} ${WA.slice(5)}` : '';
  const contacto = () => `el correo <strong>${dato('email')}</strong> o WhatsApp <strong>${waTxt}</strong>`;
  const responsable = () => `<p><strong>${dato('responsable_nombre')}</strong>, identificada con ${dato('responsable_documento')}, con domicilio en ${dato('responsable_ciudad')} (Colombia), es la responsable de la tienda ESSENZA by Diana Caliz y del tratamiento de tus datos personales. Contacto: ${contacto()}.</p>`;
  const RESPONSABLE = ['responsable_nombre', 'responsable_documento', 'responsable_ciudad', 'email'];

  legal('envios-y-cambios', 'Envíos y cambios', 'Envíos a toda Colombia en empaque 100 % discreto, tiempos de entrega, cambios por producto equivocado o defectuoso y garantía legal.', [
    ['Cobertura', 'Realizamos envíos a Colombia por transportadora. La transportadora disponible para tu ciudad se confirma por WhatsApp al coordinar el pedido.'],
    ['Empaque discreto', 'Todos los pedidos viajan en empaque 100 % discreto, sin logotipos ni referencias al contenido en la caja ni en la guía de envío.'],
    ['Costos y tiempos de entrega', conDatos(['envio_tiempos'], () => `<p>El costo del envío depende de tu ciudad y te lo informamos por WhatsApp antes de que confirmes el pedido; no se cobra nada sin tu confirmación.</p><p>Tiempos de entrega habituales, una vez confirmado el pago: ${dato('envio_tiempos')}. Son estimados de la transportadora y pueden variar en temporadas altas o por causas ajenas a nosotros; si tu pedido se retrasa, te avisamos.</p>`)],
    ['Cambios por producto equivocado o dañado', conDatos(['cambios_dias'], () => `<p>Si recibes un producto distinto al que pediste, o llega dañado, escríbenos dentro de los <strong>${dato('cambios_dias')} días calendario</strong> siguientes a la entrega, con fotos del empaque y del producto. Lo revisamos y te enviamos el producto correcto, sin costo adicional para ti.</p>`)],
    ['Productos de uso personal y retracto', `<p>En las compras a distancia tienes derecho de retracto dentro de los 5 días hábiles siguientes a la entrega (artículo 47 de la Ley 1480 de 2011), salvo en los casos que la ley exceptúa, entre ellos los <strong>bienes de uso personal</strong>.</p><p>Por higiene y seguridad, los productos de bienestar íntimo, cuidado de la piel y suplementos se consideran de uso personal: una vez abiertos o sin su sello original <strong>no admiten retracto ni cambio</strong>, salvo que tengan un defecto (ver Garantía legal). Si tienes dudas antes de comprar, escríbenos y te orientamos.</p>`],
    ['Garantía legal', `<p>Todos los productos tienen la garantía legal de calidad, idoneidad y seguridad que establece el Estatuto del Consumidor (Ley 1480 de 2011). Si un producto presenta un defecto, escríbenos con fotos y el número de tu pedido: lo revisamos y, según el caso, lo cambiamos o te devolvemos el dinero.</p><p>Respondemos las solicitudes de garantía en un plazo máximo de 15 días hábiles. La garantía no cubre el uso distinto al indicado en el empaque o en la ficha del producto.</p>`],
  ]);

  legal('privacidad', 'Privacidad y tratamiento de datos', 'Política de tratamiento de datos personales de ESSENZA (Ley 1581 de 2012): qué datos usamos, para qué, con quién se comparten y cómo ejercer tus derechos.', [
    ['Responsable', conDatos(RESPONSABLE, responsable)],
    ['Qué datos usamos', '<p>Este sitio no tiene cuentas de usuario y no guarda formularios. Los datos personales que tratamos son los que tú nos das por WhatsApp o por correo para atender tu consulta o tu pedido: nombre, teléfono, ciudad y dirección de entrega, y el contenido del pedido o de la conversación.</p>'],
    ['Datos sensibles', '<p>La información sobre productos de bienestar íntimo o de salud puede revelar datos que la ley considera <strong>sensibles</strong> (por ejemplo, sobre tu vida sexual o tu salud). No estás obligada u obligado a darnos datos sensibles: los usamos solo si tú los compartes para pedir asesoría o hacer un pedido, con la reserva que exige la ley, y nunca los usamos con fines publicitarios.</p>'],
    ['Para qué los usamos', '<ul><li>Responder tus consultas y darte asesoría.</li><li>Coordinar tu pedido, el pago, el envío y las garantías.</li><li>Cumplir obligaciones legales, contables y tributarias.</li><li>Solo si nos autorizas aparte, enviarte novedades u ofertas; puedes pedir que dejemos de hacerlo en cualquier momento.</li></ul>'],
    ['Quién más interviene', '<ul><li><strong>WhatsApp (Meta Platforms)</strong>, por donde conversamos contigo.</li><li><strong>La transportadora</strong>, que recibe solo los datos necesarios para entregar tu pedido.</li><li><strong>Google Analytics (Google LLC, Estados Unidos)</strong>, que mide de forma agregada cómo se usa el sitio (páginas vistas, tipo de dispositivo, ciudad aproximada) mediante cookies. No le enviamos tu nombre, tu teléfono ni los datos de tu pedido. Puedes bloquear o borrar las cookies en la configuración de tu navegador.</li></ul><p>No vendemos ni alquilamos tus datos personales.</p>'],
    ['Tus derechos', '<p>Como titular de los datos tienes derecho a conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización que nos diste; ser informada o informado del uso que les damos; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización o pedir que eliminemos tus datos cuando no exista un deber legal de conservarlos; y acceder a ellos de forma gratuita (artículo 8 de la Ley 1581 de 2012).</p>'],
    ['Cómo ejercerlos', conDatos(['email'], () => `<p>Escríbenos por ${contacto()} indicando tu nombre, tu solicitud y un dato de contacto. Respondemos las <strong>consultas</strong> en máximo 10 días hábiles y los <strong>reclamos</strong> (corrección, actualización o supresión) en máximo 15 días hábiles; si necesitamos más tiempo te lo informaremos antes de que se cumpla el plazo, como lo permite la ley. Antes de acudir a la Superintendencia de Industria y Comercio debes haber presentado la solicitud ante nosotros.</p>`)],
    ['Cuánto tiempo los guardamos', '<p>Conservamos tus datos solo mientras sean necesarios para las finalidades anteriores y para cumplir obligaciones legales, contables o tributarias. Después los eliminamos.</p>'],
    ['Menores de edad', '<p>Los productos de bienestar íntimo son exclusivamente para personas mayores de 18 años y no tratamos datos de menores de edad para venderlos.</p>'],
    ['Marco legal y vigencia', conDatos(['politica_vigencia'], () => `<p>Esta política se rige por la Ley 1581 de 2012 y sus decretos reglamentarios (Decreto 1074 de 2015). Está vigente desde el ${dato('politica_vigencia')} y te avisaremos en este sitio de cualquier cambio importante.</p>`)],
  ]);

  legal('terminos', 'Términos y condiciones', 'Términos y condiciones de uso del sitio y de compra en ESSENZA: cómo se confirma un pedido, precios en COP, productos para adultos y ley aplicable.', [
    ['Quiénes somos', conDatos(RESPONSABLE, responsable)],
    ['Uso del sitio', '<p>Este sitio es un catálogo: te permite conocer los productos y enviarnos tu pedido por WhatsApp. Al usarlo aceptas estos términos. Las fotos son de referencia; la presentación del producto puede variar según el lote del fabricante.</p>'],
    ['Cómo se confirma un pedido', '<p>Enviar tu pedido por WhatsApp no es todavía una compra: es una solicitud. El pedido queda confirmado cuando te confirmamos por WhatsApp la disponibilidad, el valor total con envío y la forma de pago, y tú realizas el pago.</p>'],
    ['Precios', 'Los precios están en pesos colombianos (COP). Pueden cambiar sin previo aviso, pero respetamos el precio que te confirmamos por WhatsApp para tu pedido. El costo del envío se informa aparte antes de confirmar.'],
    ['Productos para adultos', 'Los productos de bienestar íntimo son para uso exclusivo de personas mayores de 18 años. Al pedirlos confirmas que eres mayor de edad.'],
    ['Información de producto', 'La información publicada es orientativa, proviene del fabricante o del empaque y no reemplaza la consulta con un profesional de la salud. Los suplementos no son medicamentos. Lee siempre las indicaciones y precauciones del empaque.'],
    ['Envíos, cambios y garantía', `<p>Las condiciones de envío, cambios, retracto y garantía están en <a href="../envios-y-cambios/">Envíos y cambios</a>.</p>`],
    ['Ley aplicable', '<p>Estos términos se rigen por las leyes de Colombia, en especial el Estatuto del Consumidor (Ley 1480 de 2011). Si tienes una queja, escríbenos primero para resolverla; también puedes acudir a la Superintendencia de Industria y Comercio.</p>'],
  ]);
  const FAQ = [
    ['¿Cómo hago un pedido?', 'En la ficha de cada producto elige la cantidad y toca «Pedir por WhatsApp». Si quieres varios productos, agrégalos en la misma conversación. Allí confirmamos disponibilidad, costo de envío y forma de pago.'],
    ['¿Cómo llega mi pedido?', 'En empaque 100% discreto, sin logotipos ni referencias al contenido.'],
    ['¿Hacen envíos a toda Colombia?', 'Enviamos a Colombia. Los tiempos y costos dependen de tu ciudad y se confirman por WhatsApp.'],
    ['¿Qué medios de pago aceptan?', 'Los medios de pago se coordinan por WhatsApp al confirmar tu pedido.'],
    ['¿Mis conversaciones son confidenciales?', 'Sí. Las consultas se atienden de forma privada y solo se usan para orientarte o coordinar tu pedido.'],
    ['¿Puedo pedir una recomendación antes de comprar?', 'Claro. Escríbenos por WhatsApp o usa el formulario de asesoría y te orientamos.'],
  ];
  put('preguntas-frecuentes/index.html', {
    title: 'Preguntas frecuentes · ESSENZA by Diana Caliz', desc: 'Resolvemos tus dudas sobre cómo hacer un pedido por WhatsApp, envíos a Colombia, empaque discreto, medios de pago y asesoría personalizada.',
    jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    body: b => `<section class="page-head narrow">${crumbs(b, [['Preguntas frecuentes']])}<h1 class="h1">Preguntas frecuentes</h1></section>
<section class="details">${FAQ.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${q}</summary><div class="content"><p>${a}</p></div></details>`).join('')}</section>`,
  });

  put('404.html', {
    title: 'Página no encontrada · ESSENZA', desc: 'La página que buscas no existe.', noindex: true, base: '/',
    body: b => `<section class="section center"><div class="narrow"><p class="eyebrow">Error 404</p><h1 class="h1">No encontramos esta página.</h1><p class="muted spaced">Puede que el enlace haya cambiado. Te ayudamos a encontrar lo que buscas.</p><div class="actions center spaced"><a class="btn" href="/">Volver al inicio</a><a class="btn btn-outline" href="/tienda/">Ir a la tienda</a></div></div></section>`,
  });

  const urls = Object.keys(pages).filter(p => !noindex.has(p)).map(urlOf);
  return { pages, urls, pendientes, missing: [...missing], llms: llmsTxt({ cfg, cats, brands, products, blog, urlOf, noindex }) };
}

// llms.txt (https://llmstxt.org): resumen en Markdown para buscadores con IA (ChatGPT, Perplexity, Gemini, Claude).
// Se genera desde el Excel en cada build, así nunca queda desactualizado.
function llmsTxt({ cfg, cats, brands, products, blog, urlOf, noindex }) {
  const u = p => urlOf(p);
  const linea = (t, url, d) => `- [${t}](${url})${d ? `: ${d}` : ''}`;
  // Los productos +18 no se exponen a buscadores con IA: solo se listan los de uso general y sus marcas
  const general = products.filter(p => !p.adultos);
  const precio = p => `${fmt(p.final)} COP${p.agotado ? ', agotado por ahora' : p.disponibilidad === 'por encargo' ? ', por encargo' : ''}`;
  const out = [
    '# ESSENZA by Diana Caliz',
    '',
    '> Tienda en línea colombiana de cuidado de la piel, equilibrio interno y bienestar íntimo, con una selección corta de productos y asesoría personalizada de Diana Caliz. Los pedidos, el pago y el envío se coordinan por WhatsApp. Envíos a Colombia en empaque 100 % discreto.',
    '',
    '- Idioma: español (Colombia). Precios en pesos colombianos (COP).',
    '- Cómo comprar: tocar «Pedir por WhatsApp» en la ficha de cada producto; allí se confirman disponibilidad, costo de envío y forma de pago.',
    '- Los productos de bienestar íntimo son solo para personas mayores de 18 años y no se listan aquí; se pueden consultar en la categoría Bienestar íntimo del sitio.',
    '- La información es orientativa, no hace promesas médicas y no reemplaza la consulta con un profesional de la salud.',
    ...(has(cfg.email) ? [`- Correo: ${cfg.email}`] : []),
    ...(has(cfg.horario) ? [`- Horario de atención: ${cfg.horario}`] : []),
    '',
    '## Categorías',
    ...cats.map(c => linea(c.name, u(`categoria/${c.slug}/index.html`), c.desc)),
    '',
    '## Productos',
    ...general.map(p => linea(`${p.nombre} · ${p.marca}`, u(`producto/${p.slug}/index.html`), `${p.corta} (${p.cat.name}; ${precio(p)})`)),
    '',
    '## Marcas',
    ...brands.filter(m => general.some(p => p.brand === m)).map(m => linea(m.name, u(`marca/${m.slug}/index.html`), m.desc)),
    '',
    '## Ayuda',
    linea('Asesoría personalizada', u('asesoria/index.html'), 'cómo pedir una recomendación confidencial'),
    linea('Preguntas frecuentes', u('preguntas-frecuentes/index.html'), 'pedidos, envíos, empaque discreto y pagos'),
    linea('Contacto', u('contacto/index.html')),
    linea('Nosotros', u('nosotros/index.html'), 'quién es Diana Caliz y qué guía la selección'),
    ...(blog.length ? ['', '## Blog', ...blog.map(a => linea(a.titulo, u(`blog/${a.slug}/index.html`), a.resumen))] : []),
    '',
    '## Optional',
    ...[['Envíos y cambios', 'envios-y-cambios'], ['Privacidad y tratamiento de datos', 'privacidad'], ['Términos y condiciones', 'terminos']]
      .filter(([, s]) => !noindex.has(`${s}/index.html`)).map(([t, s]) => linea(t, u(`${s}/index.html`))),
    linea('Tienda completa', u('tienda/index.html')),
    '',
  ];
  return out.join('\n');
}
