// ESSENZA by Diana Caliz — generador de páginas estáticas (sin dependencias).
// Lo usa scripts/build.mjs. Recibe los datos del Excel y devuelve { ruta: html }.

export const slugify = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => '$' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const PEND = /pendiente de validaci/i;
// Promesas médicas que no deben publicarse (ver hoja Instrucciones del Excel)
const MEDICO = /\b(cura[rn]?|curativ[oa]s?|elimina[rn]?|garantiza(do|da|mos)?|quema grasa|adelgaza|trata(miento)? de enfermedad|milagros[oa])\b/i;
const PUBLICOS = ['nombre', 'descripcion_corta', 'por_que_lo_recomendamos', 'para_quien', 'descripcion_completa', 'beneficios', 'caracteristicas', 'modo_uso', 'seo_title', 'meta_description'];
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
  const { cfg, cats, brands, products } = data;
  const dominio = str(cfg.dominio).replace(/\/$/, '');
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

  const addBtn = (p, b, cls) => {
    if (p.agotado) return `<button type="button" class="${cls}" disabled>Agotado</button>`;
    if (p.variacion && cls.includes('btn-sm')) return `<a class="${cls}" href="${b}producto/${p.slug}/">Elegir ${esc(p.variacion.label.toLowerCase())}</a>`;
    return `<button type="button" class="${cls}" data-add data-sku="${esc(p.sku)}" data-name="${esc(p.nombre + ' · ' + p.marca)}" data-price="${p.final}" data-url="producto/${p.slug}/" aria-label="Agregar ${esc(p.nombre)} al carrito">Agregar al carrito</button>`;
  };

  const card = (b, p) => {
    const f = [`cat:${p.cat.slug}`, `marca:${p.brand.slug}`, ...p.atributos.flatMap(a => a.values.map(v => `${a.key}:${v}`))];
    const badges = [p.nuevo && 'Novedad', p.promo && 'Oferta', p.agotado && 'Agotado'].filter(Boolean);
    return `<article class="card" data-name="${esc(searchKey(p))}" data-price="${p.final}" data-order="${p.order}" data-new="${p.nuevo ? 1 : 0}" data-f="${esc(JSON.stringify(f))}">
<a class="media card-media" href="${b}producto/${p.slug}/" tabindex="-1" aria-hidden="true">${p.imagenes[0] ? `<img src="${b}${p.imagenes[0]}" alt="" loading="lazy" decoding="async" width="800" height="1000">` : ph(p.alt).replace('role="img" ', '')}${badges.length ? `<span class="badges">${badges.map(t => `<span class="badge">${t}</span>`).join('')}</span>` : ''}</a>
<div class="card-body"><p class="meta">${esc(p.marca)}</p><h3 class="card-title"><a href="${b}producto/${p.slug}/">${esc(p.nombre)}</a></h3><p class="card-desc">${esc(p.corta)}</p><p class="price">${priceHTML(p)}</p>${addBtn(p, b, 'btn btn-sm btn-block')}</div>
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
${filters.length ? `<aside class="filters" id="filtros" data-filters aria-label="Filtros">${filters.map(([k, g]) => `<fieldset><legend>${esc(g.label)}</legend>${[...g.values].map(([v, l]) => `<label class="check"><input type="checkbox" name="${esc(k)}" value="${esc(v)}"> ${esc(l)}</label>`).join('')}</fieldset>`).join('')}<button type="button" class="link" data-clear>Limpiar filtros</button></aside>` : ''}
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
    // Descripciones cortas (vienen del Excel) se completan para que Google no las reemplace por texto al azar
    const desc = p.noindex || str(p.desc).length >= 110 ? str(p.desc) : `${str(p.desc).replace(/\.?$/, '.')} Asesoría personalizada, empaque discreto y envíos a Colombia.`.slice(0, 160);
    return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(desc)}">
${p.noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${esc(url)}">`}
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
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${b}css/styles.css">
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
<div class="tools"><a class="icon-btn" href="${b}tienda/#buscar" aria-label="Buscar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></a><button type="button" class="cart-btn" data-cart-open aria-label="Abrir carrito">Carrito · <span data-cart-count>0</span></button></div>
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
<div class="drawer-overlay" data-cart-close hidden></div>
<aside class="drawer" data-drawer role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
<div class="drawer-head"><h2 class="h3" id="drawer-title">Tu carrito</h2><button type="button" class="icon-btn" data-cart-close aria-label="Cerrar carrito">✕</button></div>
<div class="drawer-items" data-cart-items></div>
<div class="drawer-foot" data-cart-has hidden><div class="total"><span>Subtotal</span><strong data-cart-total></strong></div><a class="btn btn-block" href="${b}carrito/">Finalizar pedido</a><p class="meta center">Empaque discreto · Pedido por WhatsApp</p></div>
</aside>
<p class="sr" aria-live="polite" data-live></p>
<a class="wa" href="${waHref(p.wa || msgGeneral)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>Asesoría</span></a>
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
  const destacados = (products.filter(p => p.destacado).length ? products.filter(p => p.destacado) : products).slice(0, 4);
  const kits = products.filter(p => p.cat.slug === 'kits-y-rituales' && !destacados.includes(p)).slice(0, 4);
  const kitCat = cats.find(c => c.slug === 'kits-y-rituales');
  put('index.html', {
    title: 'ESSENZA by Diana Caliz | Cuidado de la piel y bienestar íntimo',
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
<h1 class="display">Tu piel. Tu bienestar. Tu esencia.</h1>
<p class="lead">Una selección cuidada de productos para tu piel, tu equilibrio y tu intimidad, acompañada de asesoría personalizada.</p>
<div class="actions"><a class="btn" href="${b}tienda/">Descubrir ESSENZA</a><a class="btn btn-outline" href="${b}asesoria/">Recibir asesoría</a></div>
</div><div class="media hero-media">${asset(b, 'hero', 'Productos ESSENZA sobre lino con luz natural', 'Foto hero 4:5 — static/img/hero.jpg', true)}</div></section>

<section class="section white bordered"><div class="narrow center">
<p class="eyebrow">Nuestra filosofía</p>
<h2 class="h2">Menos productos. Mejor seleccionados. Mejor explicados.</h2>
<p class="muted">No buscamos tener miles de referencias. Cada producto que entra a ESSENZA pasa por un criterio de selección y llega acompañado de la información y la asesoría para elegirlo bien.</p>
<blockquote class="mision">“${MISION}”</blockquote>
</div></section>

<section class="section"><div class="inner center">
<p class="eyebrow">Tres universos, una sola casa</p><h2 class="h2">Elige por dónde empezar</h2>
<div class="grid-3 left">${mainCats.slice(0, 3).map(c => `<a class="tile" href="${b}categoria/${c.slug}/"><div class="media tile-media">${asset(b, 'universo-' + c.slug, c.name, 'Foto ' + c.name)}</div><div class="tile-body"><h3 class="h3">${esc(c.name)}</h3><p class="muted">${esc(c.desc)}</p><span class="more">Explorar →</span></div></a>`).join('')}</div>
</div></section>

<section class="split"><div class="media">${asset(b, 'diana', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana.jpg')}</div>
<div class="split-text"><p class="eyebrow">Asesoría personalizada</p><h2 class="h2">No tienes que elegir sola.</h2>
<p class="muted">Estamos aquí para orientarte. Cuéntanos qué estás buscando y recibe una recomendación personalizada, cercana y confidencial.</p>
<div class="actions"><a class="btn" href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Hablar por WhatsApp</a><a class="btn btn-outline" href="${b}asesoria/">Cómo funciona</a></div></div></section>

<section class="section sand"><div class="narrow center">
<p class="eyebrow">Diagnóstico guiado</p><h2 class="h2">Encuentra tu ritual</h2>
<p class="muted">Tres preguntas breves y te sugerimos por dónde empezar. No es un diagnóstico médico.</p>
<div class="quiz" data-quiz>
<div data-step><p class="eyebrow">Pregunta 1 de 3</p><p class="quiz-q">¿Qué te gustaría cuidar hoy?</p><div class="chips">${mainCats.slice(0, 3).map(c => `<button type="button" class="chip" data-answer data-cat="${c.slug}" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join('')}${kitCat ? `<button type="button" class="chip" data-answer data-cat="${kitCat.slug}" data-name="${esc(kitCat.name)}">Busco un regalo</button>` : ''}</div></div>
<div data-step hidden><p class="eyebrow">Pregunta 2 de 3</p><p class="quiz-q">¿Cómo te describes frente a este tema?</p><div class="chips"><button type="button" class="chip" data-answer>Estoy empezando</button><button type="button" class="chip" data-answer>Ya tengo experiencia</button><button type="button" class="chip" data-answer>Busco algo específico</button></div></div>
<div data-step hidden><p class="eyebrow">Pregunta 3 de 3</p><p class="quiz-q">¿Para quién es?</p><div class="chips"><button type="button" class="chip" data-answer>Para mí</button><button type="button" class="chip" data-answer>Para compartir en pareja</button><button type="button" class="chip" data-answer>Para regalar</button></div></div>
<div data-quiz-result hidden><p class="quiz-q">Te sugerimos empezar por <strong data-quiz-name></strong>.</p><p class="muted">Si quieres una recomendación más precisa, envía tus respuestas a Diana.</p><div class="actions"><a class="btn" data-quiz-link href="${b}tienda/">Ver la selección</a><a class="btn btn-outline" data-quiz-wa href="${waHref(msgGeneral)}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div><button type="button" class="link quiz-reset" data-quiz-reset>Volver a empezar</button></div>
</div></div></section>

${destacados.length ? `<section class="section"><div class="inner">
<div class="section-head"><div><h2 class="h2">Selección curada</h2><p class="muted">Pocos productos, elegidos con criterio.</p></div><a class="more" href="${b}tienda/">Ver la tienda →</a></div>
<div class="grid-products four">${destacados.map(p => card(b, p)).join('')}</div></div></section>` : ''}

${kits.length ? `<section class="section white bordered"><div class="inner">
<div class="section-head"><div><p class="eyebrow">Kits y rituales</p><h2 class="h2">Rituales para regalar(te)</h2></div><a class="more" href="${b}categoria/kits-y-rituales/">Ver todos →</a></div>
<div class="grid-products four">${kits.map(p => card(b, p)).join('')}</div></div></section>` : ''}

<section class="section dark"><div class="pillars">
<div><h3>Selección responsable</h3><p>Cada producto pasa por una revisión de marca, materiales e información antes de publicarse.</p></div>
<div><h3>Información clara</h3><p>Fichas con beneficios, modo de uso y precauciones, sin promesas médicas.</p></div>
<div><h3>Privacidad primero</h3><p>Empaque discreto y conversaciones confidenciales en cada pedido.</p></div>
<div><h3>Acompañamiento</h3><p>Asesoría humana antes y después de tu compra.</p></div>
</div></section>

${brands.some(m => products.some(p => p.brand === m)) ? `<section class="section-sm bordered"><div class="brands"><span class="eyebrow">Marcas</span>${brands.filter(m => products.some(p => p.brand === m)).map(m => `<a href="${b}marca/${m.slug}/">${esc(m.name)}</a>`).join('')}</div></section>` : ''}

${blog.length ? `<section class="section"><div class="inner">
<div class="section-head"><h2 class="h2">Aprender a cuidarte</h2><a class="more" href="${b}blog/">Ver el blog →</a></div>
<div class="grid-3">${blog.slice(0, 3).map(a => postCard(b, a)).join('')}</div></div></section>` : ''}

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
    desc: 'Cuidado de la piel, equilibrio interno, bienestar íntimo y kits seleccionados por Diana Caliz.',
    body: b => `<section class="page-head">${crumbs(b, [['Tienda']])}<h1 class="h1">Tienda</h1><p class="muted">Toda la selección ESSENZA en un solo lugar. Filtra por categoría, marca o necesidad.</p></section>${listing(b, products, { search: true, showCat: true, showBrand: true })}`,
  });

  const GUIDES = {
    'cuidado-de-la-piel': ['Los tres pasos básicos', [['Limpieza suave', 'Retira impurezas sin resecar. Es la base para que el resto de la rutina funcione.'], ['Hidratación diaria', 'Elige la textura según tu tipo de piel: gel para piel grasa, crema para piel seca.'], ['Protección solar', 'Todos los días, incluso nublado. Reaplica cada 2 o 3 horas si estás al aire libre.']], 'Estas guías son orientativas. Si tienes una condición en la piel, consulta con un dermatólogo.'],
    'equilibrio-interno': ['Antes de elegir', [['Cosméticos, suplementos y homeopáticos', 'Cada producto indica a qué grupo pertenece. No son intercambiables entre sí.'], ['Hábitos primero', 'Ningún producto reemplaza el descanso, la alimentación y el movimiento.'], ['Consulta profesional', 'Si tomas medicamentos, estás en embarazo o lactancia, consulta antes con tu médico.']], 'Los suplementos no son medicamentos y no reemplazan una alimentación balanceada.'],
    'bienestar-intimo': ['Antes de elegir, tres cosas que ayudan', [['Conócete primero', 'Identifica qué te genera curiosidad o comodidad. No hay una forma correcta de empezar.'], ['Materiales y seguridad', 'Prioriza silicona de grado médico y verifica la compatibilidad con lubricantes a base de agua.'], ['Privacidad en cada paso', 'Del empaque discreto a la conversación confidencial: tu proceso es solo tuyo.']], 'Productos para personas mayores de 18 años.'],
  };
  for (const c of cats) {
    const ps = products.filter(p => p.cat === c);
    const g = GUIDES[c.slug];
    put(`categoria/${c.slug}/index.html`, {
      title: `${c.name} · ESSENZA by Diana Caliz`, active: 'tienda', wa: msgCat(c),
      jsonld: bcLD([['Tienda', 'tienda/'], [c.name, `categoria/${c.slug}/`]]),
      desc: c.desc || `${c.name} seleccionados por Diana Caliz, con asesoría personalizada.`,
      body: b => `<section class="page-head">${crumbs(b, [['Tienda', 'tienda/'], [c.name]])}<h1 class="h1">${esc(c.name)}</h1>${c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ''}
<div class="chips-row"><span class="pill">Empaque discreto</span><span class="pill">Asesoría confidencial</span>${c.slug === 'bienestar-intimo' ? '<span class="pill">Sin prejuicios</span>' : ''}</div></section>
${g ? `<section class="guide-wrap"><h2 class="h3">${g[0]}</h2><div class="guide">${g[1].map(([t, d]) => `<div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div><p class="meta">${g[2]}</p></section>` : ''}
${listing(b, ps, { showBrand: true })}`,
    });
  }

  // ------------------------------------------------ marcas
  put('marcas/index.html', {
    title: 'Marcas · ESSENZA by Diana Caliz', active: 'marcas',
    desc: 'Las marcas que seleccionamos por sus materiales, su información verificable y su coherencia con el autocuidado consciente.',
    body: b => `<section class="page-head center">${crumbs(b, [['Marcas']])}<p class="eyebrow">Selección responsable</p><h1 class="h1">Las marcas que elegimos</h1><p class="muted mx">Trabajamos con marcas que cumplen nuestros criterios: materiales seguros, información verificable y coherencia con una experiencia de autocuidado consciente.</p></section>
<section class="inner pad-x pad-b"><div class="grid-2">${brands.map(m => { const n = products.filter(p => p.brand === m).length; return `<a class="brand-card" href="${b}marca/${m.slug}/"><div class="brand-top"><h2 class="h3">${esc(m.name)}</h2>${m.universo ? `<span class="badge">${esc(m.universo)}</span>` : ''}</div>${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}<span class="more">${n ? `Ver ${n} producto${n > 1 ? 's' : ''} →` : 'Próximamente'}</span></a>`; }).join('')}</div></section>`,
  });
  for (const m of brands) {
    put(`marca/${m.slug}/index.html`, {
      title: `${m.name} · ESSENZA by Diana Caliz`, active: 'marcas',
      jsonld: bcLD([['Marcas', 'marcas/'], [m.name, `marca/${m.slug}/`]]),
      // Marca sin productos publicados: página delgada, no se indexa hasta que tenga catálogo
      noindex: !products.some(p => p.brand === m),
      desc: m.desc || `Productos ${m.name} seleccionados por ESSENZA.`,
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
      desc: p.metaDesc || p.corta, og: p.imagenes[0] || '', ogAlt: p.alt,
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
<div class="gallery"><div class="media main-img">${p.imagenes[0] ? `<img src="${b}${p.imagenes[0]}" alt="${esc(p.alt)}" data-main width="1200" height="1500" fetchpriority="high">` : ph(p.alt)}</div>
${p.imagenes.length > 1 ? `<div class="thumbs">${p.imagenes.map((src, i) => `<button type="button" data-thumb="${b}${src}" aria-label="Ver imagen ${i + 1}" aria-current="${i === 0}"><img src="${b}${src}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
<div class="info" data-product>
<p class="meta"><a href="${b}marca/${p.brand.slug}/">${esc(p.marca)}</a></p>
<h1>${esc(p.nombre)}</h1>
<p class="muted">${esc(p.corta)}</p>
<div><p class="price-lg">${priceHTML(p)} <small>COP</small></p><p class="stock${p.agotado ? ' out' : ''}">${dispText(p)}</p></div>
${p.porque ? `<div class="reco"><p class="eyebrow">Por qué lo recomendamos</p><p>${esc(p.porque)}</p></div>` : ''}
${p.variacion ? `<label class="field">${esc(p.variacion.label)}<select data-variant data-label="${esc(p.variacion.label)}">${p.variacion.options.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>` : ''}
<div class="buy">${p.agotado ? '' : `<div class="qty" data-stepper><button type="button" data-step="-1" aria-label="Quitar una unidad" disabled>−</button><input class="qty-input" type="number" min="1" max="20" value="1" data-qty inputmode="numeric" aria-label="Cantidad"><button type="button" data-step="1" aria-label="Agregar una unidad">+</button></div>`}${addBtn(p, b, 'btn grow')}</div>
<a class="btn btn-outline" href="${waHref(waMsg)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>
${p.adultos ? `<p class="notice"><strong>+18</strong> ${esc(cfg.aviso_adultos || 'Producto para uso exclusivo de personas mayores de 18 años.')}</p>` : ''}
<ul class="trust"><li>Empaque 100% discreto</li><li>Asesoría personalizada y confidencial</li><li>Pedido y pago coordinados por WhatsApp</li></ul>
</div></section>
<section class="details">${acc.map(([t, c], i) => `<details${i < 2 ? ' open' : ''}><summary>${t}</summary><div class="content">${c}</div></details>`).join('')}</section>
${rel.length ? `<section class="related"><h2 class="h2">También te puede interesar</h2><div class="grid-products four">${rel.map(x => card(b, x)).join('')}</div></section>` : ''}`;
      },
    });
  }

  // ------------------------------------------------ carrito
  put('carrito/index.html', {
    title: 'Tu pedido · ESSENZA by Diana Caliz', desc: 'Revisa tu pedido y envíalo por WhatsApp.', noindex: true,
    wa: 'Hola Diana, necesito ayuda para completar mi pedido.',
    body: b => `<section class="page-head">${crumbs(b, [['Tu pedido']])}<h1 class="h1">Tu pedido</h1><p class="muted">Revisa tus productos y envía el pedido por WhatsApp. Allí confirmamos disponibilidad, costo de envío y forma de pago.</p></section>
<div class="inner pad-x pad-b cart-page" data-cart-page>
<div class="panel"><h2 class="h3">Productos</h2><div data-cart-items></div></div>
<form class="panel" data-order-form novalidate>
<h2 class="h3">Datos para el envío</h2>
<label class="field">Nombre<input name="nombre" autocomplete="name" required></label>
<label class="field">Ciudad de envío<input name="ciudad" autocomplete="address-level2" required></label>
<label class="field">Notas (opcional)<textarea name="notas" rows="3" placeholder="Barrio, horario de entrega, preguntas…"></textarea></label>
<div class="total"><span>Total productos</span><strong data-cart-total>$0</strong></div>
<p class="meta">El costo de envío se confirma por WhatsApp según tu ciudad.</p>
<p class="error" data-error role="alert" hidden></p>
<button class="btn btn-block" type="submit">Enviar pedido por WhatsApp</button>
<ul class="trust"><li>Empaque 100% discreto, sin referencias al contenido</li><li>Tus datos solo se usan para coordinar tu pedido</li></ul>
</form></div>`,
  });

  // ------------------------------------------------ asesoría
  const catOptions = [...mainCats.map(c => c.name), 'Un regalo', 'Prefiero contarlo por chat'];
  put('asesoria/index.html', {
    title: 'Asesoría personalizada · ESSENZA by Diana Caliz', active: 'asesoria',
    desc: 'Cuéntanos qué estás buscando y recibe una recomendación personalizada, cercana y confidencial.',
    body: b => `<section class="split hero-split"><div class="media">${asset(b, 'diana', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana.jpg', true)}</div>
<div class="split-text"><p class="eyebrow">Asesoría personalizada</p><h1 class="h1">No tienes que elegir sola.</h1>
<p class="muted">Estamos aquí para orientarte. Cuéntanos qué estás buscando (una rutina para tu piel, un hábito de bienestar o un paso en tu intimidad) y recibe una recomendación personalizada, cercana y confidencial.</p>
<ul class="trust row"><li>Conversación confidencial</li><li>Sin juicios</li><li>Sin compromiso de compra</li></ul></div></section>
<section class="inner pad-x section-y two-col">
<div><h2 class="h2">Cómo funciona</h2><div class="steps">
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
    desc: 'ESSENZA une el cuidado de la piel, el equilibrio interno y el bienestar íntimo en una sola conversación, con productos seleccionados y asesoría personalizada.',
    body: b => `<section class="page-head center narrow">${crumbs(b, [['Nosotros']])}<p class="eyebrow">Nuestra historia</p><h1 class="h1">El bienestar no se divide en categorías.</h1>
<p class="muted mx">ESSENZA nace de una convicción: cuidar la piel, el cuerpo y la intimidad son parte de una misma conversación. Una conversación que merece información clara, productos seguros y cero prejuicios.</p></section>
<section class="split"><div class="media">${asset(b, 'diana-nosotros', 'Diana Caliz', 'Retrato de Diana Caliz — static/img/diana-nosotros.jpg')}</div>
<div class="split-text"><h2 class="h2">Diana Caliz</h2><p class="muted">Detrás de cada recomendación hay una persona real. Diana acompaña a cada cliente con cercanía y confidencialidad: escucha primero y recomienda después.</p>
<blockquote class="mision left">“${MISION}”</blockquote><a class="btn" href="${b}asesoria/">Conocer la asesoría</a></div></section>
<section class="section"><div class="inner"><h2 class="h2 center">Lo que nos guía</h2><div class="grid-3 values">
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
<section class="inner pad-x pad-b"><div class="grid-3">${blog.map(a => postCard(b, a)).join('')}</div></section>`,
  });
  for (const a of blog) {
    const c = cats.find(x => x.slug === a.categoria);
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
${ps.length ? `<section class="related"><h2 class="h2">Productos relacionados</h2><div class="grid-products four">${ps.map(p => card(b, p)).join('')}</div></section>` : ''}`,
    });
  }

  // ------------------------------------------------ páginas legales y ayuda
  const PENDIENTE = `<span class="pending">Estamos terminando de redactar esta sección. Si tienes una duda, <a href="${waHref(msgGeneral)}" target="_blank" rel="noopener">escríbenos por WhatsApp</a> y te respondemos.</span>`;
  const pendientes = [];
  const legal = (slug, title, desc, sections) => (sections.some(([, t]) => t.includes(PENDIENTE)) && pendientes.push(`${slug}: ${sections.filter(([, t]) => t.includes(PENDIENTE)).map(([h]) => h).join(', ')}`), put(`${slug}/index.html`, {
    title: `${title} · ESSENZA by Diana Caliz`, desc,
    // Mientras tenga textos pendientes no se indexa: contenido incompleto no debe aparecer en Google
    noindex: sections.some(([, t]) => t.includes(PENDIENTE)),
    body: b => `<section class="page-head narrow">${crumbs(b, [[title]])}<h1 class="h1">${title}</h1></section><div class="prose">${sections.map(([h, t]) => `<h2>${h}</h2><p>${t}</p>`).join('')}</div>`,
  }));
  legal('envios-y-cambios', 'Envíos y cambios', 'Envíos a Colombia en empaque discreto. Condiciones de cambios y devoluciones.', [
    ['Cobertura', 'Realizamos envíos a Colombia. La transportadora y los tiempos se confirman por WhatsApp según tu ciudad.'],
    ['Empaque discreto', 'Todos los pedidos viajan en empaque 100% discreto, sin logotipos ni referencias al contenido en la caja ni en la guía de envío.'],
    ['Costos y tiempos de entrega', PENDIENTE],
    // Por confirmar con Diana: si los productos íntimos abiertos admiten cambio (por higiene, normalmente no)
    ['Cambios y devoluciones', PENDIENTE],
    ['Garantías', PENDIENTE],
  ]);
  legal('privacidad', 'Privacidad y tratamiento de datos', 'Cómo tratamos tus datos personales.', [
    ['Responsable', PENDIENTE],
    ['Qué datos usamos', 'Este sitio no tiene cuentas de usuario ni guarda formularios. Tu carrito se guarda solo en tu navegador. Los datos que envías por WhatsApp se usan únicamente para atender tu consulta o coordinar tu pedido.'],
    ['Marco legal', `La política de tratamiento de datos debe ajustarse a la Ley 1581 de 2012 de Colombia. ${PENDIENTE}`],
    ['Tus derechos', `Puedes conocer, actualizar, rectificar o solicitar la eliminación de tus datos escribiéndonos. ${PENDIENTE}`],
  ]);
  legal('terminos', 'Términos y condiciones', 'Condiciones de uso del sitio y de compra.', [
    ['Uso del sitio', PENDIENTE],
    ['Precios', 'Los precios están en pesos colombianos (COP) y pueden cambiar sin previo aviso. El valor final del pedido, incluido el envío, se confirma por WhatsApp.'],
    ['Productos para adultos', 'Los productos de bienestar íntimo son para uso exclusivo de personas mayores de 18 años.'],
    ['Información de producto', 'La información publicada es orientativa y no reemplaza la consulta con un profesional de la salud.'],
  ]);
  const FAQ = [
    ['¿Cómo hago un pedido?', 'Agrega los productos al carrito y envía tu pedido por WhatsApp. Allí confirmamos disponibilidad, costo de envío y forma de pago.'],
    ['¿Cómo llega mi pedido?', 'En empaque 100% discreto, sin logotipos ni referencias al contenido.'],
    ['¿Hacen envíos a toda Colombia?', 'Enviamos a Colombia. Los tiempos y costos dependen de tu ciudad y se confirman por WhatsApp.'],
    ['¿Qué medios de pago aceptan?', 'Los medios de pago se coordinan por WhatsApp al confirmar tu pedido.'],
    ['¿Mis conversaciones son confidenciales?', 'Sí. Las consultas se atienden de forma privada y solo se usan para orientarte o coordinar tu pedido.'],
    ['¿Puedo pedir una recomendación antes de comprar?', 'Claro. Escríbenos por WhatsApp o usa el formulario de asesoría y te orientamos.'],
  ];
  put('preguntas-frecuentes/index.html', {
    title: 'Preguntas frecuentes · ESSENZA by Diana Caliz', desc: 'Pedidos, envíos, empaque discreto, pagos y asesoría.',
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
  const precio = p => `${fmt(p.final)} COP${p.agotado ? ', agotado por ahora' : p.disponibilidad === 'por encargo' ? ', por encargo' : ''}`;
  const out = [
    '# ESSENZA by Diana Caliz',
    '',
    '> Tienda en línea colombiana de cuidado de la piel, equilibrio interno y bienestar íntimo, con una selección corta de productos y asesoría personalizada de Diana Caliz. Los pedidos, el pago y el envío se coordinan por WhatsApp. Envíos a Colombia en empaque 100 % discreto.',
    '',
    '- Idioma: español (Colombia). Precios en pesos colombianos (COP).',
    '- Cómo comprar: agregar productos al carrito del sitio y enviar el pedido por WhatsApp; allí se confirman disponibilidad, costo de envío y forma de pago.',
    '- Los productos de bienestar íntimo son solo para personas mayores de 18 años.',
    '- La información es orientativa, no hace promesas médicas y no reemplaza la consulta con un profesional de la salud.',
    ...(has(cfg.email) ? [`- Correo: ${cfg.email}`] : []),
    ...(has(cfg.horario) ? [`- Horario de atención: ${cfg.horario}`] : []),
    '',
    '## Categorías',
    ...cats.map(c => linea(c.name, u(`categoria/${c.slug}/index.html`), c.desc)),
    '',
    '## Productos',
    ...products.map(p => linea(`${p.nombre} · ${p.marca}`, u(`producto/${p.slug}/index.html`), `${p.corta} (${p.cat.name}; ${precio(p)})`)),
    '',
    '## Marcas',
    ...brands.filter(m => products.some(p => p.brand === m)).map(m => linea(m.name, u(`marca/${m.slug}/index.html`), m.desc)),
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
