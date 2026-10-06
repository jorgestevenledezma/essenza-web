// Revisa catalogo.xlsx antes de publicar: qué cambió respecto a git y qué está mal o incompleto.
// Uso: npm run revisar                       (compara con el último commit)
//      npm run revisar -- otro.xlsx --contra main
// No modifica nada. Lo usa el agente catalogo-excel.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { normalize, slugify } from '../src/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ref = args.includes('--contra') ? args[args.indexOf('--contra') + 1] : 'HEAD';
const rel = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--contra') || 'catalogo/catalogo.xlsx';
const EXCEL = path.resolve(ROOT, rel);
if (!fs.existsSync(EXCEL)) { console.error(`✗ No encuentro ${EXCEL}`); process.exit(1); }

const COLUMNAS = ['estado', 'sku', 'nombre', 'marca', 'categoria', 'subcategoria', 'slug', 'precio', 'precio_promocional', 'disponibilidad', 'descripcion_corta', 'por_que_lo_recomendamos', 'para_quien', 'descripcion_completa', 'beneficios', 'caracteristicas', 'ingredientes_materiales', 'modo_uso', 'precauciones', 'presentacion', 'dimensiones', 'peso', 'variaciones', 'atributos', 'solo_adultos', 'destacado', 'nuevo', 'relacionados', 'carpeta_imagenes', 'texto_alternativo', 'seo_title', 'meta_description', 'notas_internas'];
const ESTADOS = ['borrador', 'pendiente', 'validado', 'oculto'];
const DISP = ['disponible', 'agotado', 'por encargo'];
const str = v => (v == null ? '' : String(v).trim());

const leer = buf => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const hoja = n => wb.Sheets[Object.keys(wb.Sheets).find(k => k.toLowerCase() === n.toLowerCase())];
  const filas = n => (hoja(n) ? XLSX.utils.sheet_to_json(hoja(n), { defval: '', raw: true }).map((r, i) => ({ ...r, _fila: i + 2 })) : []);
  const cabecera = n => (hoja(n) ? (XLSX.utils.sheet_to_json(hoja(n), { header: 1 })[0] || []).map(str) : []);
  return {
    hojas: wb.SheetNames, cabecera: cabecera('Productos'),
    productos: filas('Productos').filter(r => str(r.sku) || str(r.nombre)),
    categorias: filas('Categorias'), marcas: filas('Marcas'), config: filas('Config'),
  };
};

const nuevo = leer(fs.readFileSync(EXCEL));
let viejo = null;
try {
  const gitPath = path.relative(ROOT, EXCEL).split(path.sep).join('/');
  viejo = leer(execFileSync('git', ['show', `${ref}:${gitPath}`], { cwd: ROOT, maxBuffer: 50e6, stdio: ['ignore', 'pipe', 'ignore'] }));
} catch { /* sin git o archivo nuevo */ }

const out = [];
const sec = t => out.push('', `## ${t}`);
const item = t => out.push(`- ${t}`);

// ---------------------------------------------------------------- resumen
out.push(`# Revisión de ${path.relative(ROOT, EXCEL)}`);
const porEstado = {};
nuevo.productos.forEach(r => { const e = str(r.estado).toLowerCase() || '(vacío)'; porEstado[e] = (porEstado[e] || 0) + 1; });
sec('Resumen');
item(`${nuevo.productos.length} filas de producto: ${Object.entries(porEstado).map(([e, n]) => `${n} ${e}`).join(', ')}`);
item(`Hojas: ${nuevo.hojas.join(', ')}`);

// ---------------------------------------------------------------- estructura
const errores = [], avisos = [];
const faltanCols = COLUMNAS.filter(c => !nuevo.cabecera.includes(c));
const extraCols = nuevo.cabecera.filter(c => c && !COLUMNAS.includes(c));
if (faltanCols.length) errores.push(`Faltan columnas en Productos (¿se renombraron?): ${faltanCols.join(', ')}`);
if (extraCols.length) avisos.push(`Columnas que el sitio no usa: ${extraCols.join(', ')}`);
for (const h of ['Productos', 'Categorias', 'Marcas', 'Config']) if (!nuevo.hojas.some(x => x.toLowerCase() === h.toLowerCase())) errores.push(`Falta la hoja "${h}"`);

// ---------------------------------------------------------------- filas
const catNames = new Set(nuevo.categorias.map(r => str(r.categoria)).filter(Boolean));
const subsDe = c => new Set(nuevo.categorias.filter(r => str(r.categoria) === c).map(r => str(r.subcategoria)).filter(Boolean));
const marcaNames = new Set(nuevo.marcas.map(r => str(r.marca)).filter(Boolean));
const slugsVistos = {};
for (const r of nuevo.productos) {
  const id = `Fila ${r._fila} (${str(r.sku) || str(r.nombre)})`;
  const estado = str(r.estado).toLowerCase();
  if (!ESTADOS.includes(estado)) errores.push(`${id}: estado "${r.estado}" no es válido (${ESTADOS.join(', ')}).`);
  if (str(r.precio) && typeof r.precio !== 'number') errores.push(`${id}: precio "${r.precio}" es texto; escribe solo números, sin puntos ni $ (ej. 670000).`);
  if (str(r.precio_promocional) && Number(r.precio_promocional) >= Number(r.precio)) avisos.push(`${id}: precio_promocional no es menor que precio; no se mostrará como oferta.`);
  if (str(r.disponibilidad) && !DISP.includes(str(r.disponibilidad).toLowerCase())) errores.push(`${id}: disponibilidad "${r.disponibilidad}" no es válida (${DISP.join(', ')}).`);
  if (str(r.categoria) && !catNames.has(str(r.categoria))) errores.push(`${id}: categoría "${r.categoria}" no existe en la hoja Categorias (revisa tildes y mayúsculas).`);
  else if (str(r.subcategoria) && !subsDe(str(r.categoria)).has(str(r.subcategoria))) avisos.push(`${id}: subcategoría "${r.subcategoria}" no está registrada para ${r.categoria}.`);
  if (str(r.marca) && !marcaNames.has(str(r.marca))) avisos.push(`${id}: marca "${r.marca}" no está en la hoja Marcas; se creará sin descripción.`);
  if (str(r.categoria) === 'Bienestar íntimo' && !/^s[ií]/i.test(str(r.solo_adultos))) avisos.push(`${id}: es de Bienestar íntimo pero solo_adultos no es "sí".`);
  for (const par of str(r.atributos).split('|').filter(Boolean)) if (!/^[^:]+:.+$/.test(par.trim())) errores.push(`${id}: atributo "${par.trim()}" sin formato clave:valor.`);
  if (str(r.variaciones) && !/^[^:|]+:.+$/.test(str(r.variaciones))) avisos.push(`${id}: variaciones sin etiqueta (usa "Color: Rosa|Morado").`);
  if (str(r.meta_description).length > 160) avisos.push(`${id}: meta_description de ${str(r.meta_description).length} caracteres; Google corta en ~155.`);
  if (str(r.seo_title).length > 60) avisos.push(`${id}: seo_title de ${str(r.seo_title).length} caracteres; Google corta en ~60.`);
  if (estado === 'validado') {
    const slug = str(r.slug) || slugify(`${r.nombre} ${r.marca}`);
    (slugsVistos[slug] ||= []).push(str(r.sku));
    if (str(r.descripcion_corta).length > 160) avisos.push(`${id}: descripcion_corta de ${str(r.descripcion_corta).length} caracteres; se usa como meta description, ideal ≤155.`);
  }
  if (str(r.notas_internas)) avisos.push(`${id}: tiene notas_internas. El Excel se sube a GitHub; si el repositorio es público cualquiera puede leerlas.`);
}
for (const [slug, s] of Object.entries(slugsVistos)) if (s.length > 1) avisos.push(`Slug repetido "${slug}" en ${s.join(', ')}; el build le agrega el SKU al segundo.`);

// Config
const cfg = Object.fromEntries(nuevo.config.map(r => [str(r.clave), str(r.valor)]));
if (cfg.dominio && !/^https:\/\/[^/]+$/.test(cfg.dominio.replace(/\/$/, ''))) errores.push(`Config: dominio "${cfg.dominio}" debe ser una URL https sin ruta.`);
for (const k of ['instagram', 'facebook', 'tiktok', 'newsletter_action']) if (cfg[k] && !/^https?:\/\//.test(cfg[k])) errores.push(`Config: ${k} debe ser una URL completa (https://…).`);

// Imágenes
const IMG = path.join(ROOT, 'catalogo/productos');
const carpetas = fs.existsSync(IMG) ? fs.readdirSync(IMG).filter(d => fs.statSync(path.join(IMG, d)).isDirectory()) : [];
const skus = new Set(nuevo.productos.map(r => str(r.sku)).filter(Boolean));
const huerfanas = carpetas.filter(d => !skus.has(d));
if (huerfanas.length) avisos.push(`Carpetas de fotos sin SKU en el Excel (¿SKU mal escrito?): ${huerfanas.join(', ')}`);
for (const d of carpetas) for (const f of fs.readdirSync(path.join(IMG, d))) {
  if (/\.(jpe?g|png)$/i.test(f) && fs.statSync(path.join(IMG, d, f)).size > 500e3) avisos.push(`${d}/${f} pesa ${(fs.statSync(path.join(IMG, d, f)).size / 1e6).toFixed(1)} MB; conviértela a .webp (skill fotos-producto).`);
  if (/\.(webp|avif|jpe?g|png)$/i.test(f) && !/^\d+\./.test(f)) avisos.push(`${d}/${f}: el nombre debe ser un número (1.webp, 2.webp…) para respetar el orden.`);
}

// Reglas del build (las mismas que verá GitHub Actions)
const imagenes = Object.fromEntries(carpetas.map(d => [d, fs.readdirSync(path.join(IMG, d)).filter(f => /\.(webp|avif|jpe?g|png)$/i.test(f)).map(f => `productos/${d}/${f}`)]).filter(([, v]) => v.length));
const data = normalize({ ...nuevo, imagenes });

sec(`Errores (${errores.length})`);
errores.length ? errores.forEach(item) : item('Ninguno');
sec(`Avisos del build (${data.warnings.length})`);
data.warnings.length ? data.warnings.forEach(item) : item('Ninguno');
sec(`Otros avisos (${avisos.length})`);
avisos.length ? avisos.forEach(item) : item('Ninguno');
sec('Se publicarán');
data.products.forEach(p => item(`${p.sku} · ${p.nombre} (${p.marca}) · ${p.cat.name} · $${p.final}${p.promo ? ' (oferta)' : ''}${p.agotado ? ' · agotado' : ''} · ${p.imagenes.length} foto(s) → /producto/${p.slug}/`));

// ---------------------------------------------------------------- cambios
sec(`Cambios respecto a ${ref}`);
if (!viejo) item('No hay versión anterior en git para comparar.');
else {
  const mapa = ps => new Map(ps.filter(r => str(r.sku)).map(r => [str(r.sku), r]));
  const a = mapa(viejo.productos), b = mapa(nuevo.productos);
  let n = 0;
  for (const [sku, r] of b) if (!a.has(sku)) { item(`NUEVO ${sku} · ${r.nombre} (${r.estado})`); n++; }
  for (const [sku, r] of a) if (!b.has(sku)) { item(`ELIMINADO ${sku} · ${r.nombre}`); n++; }
  for (const [sku, r] of b) {
    const o = a.get(sku); if (!o) continue;
    const dif = COLUMNAS.filter(c => str(o[c]) !== str(r[c]));
    if (!dif.length) continue;
    n++;
    const det = dif.map(c => (['estado', 'precio', 'precio_promocional', 'disponibilidad', 'categoria', 'marca', 'slug'].includes(c) ? `${c}: "${str(o[c])}" → "${str(r[c])}"` : c));
    item(`${sku}: ${det.join('; ')}`);
    if (dif.includes('slug') && str(o.estado) === 'validado') item(`  ⚠ ${sku} cambió de slug: la URL anterior dejará de existir (enlaces compartidos y Google).`);
  }
  for (const h of ['categorias', 'marcas', 'config']) if (JSON.stringify(viejo[h].map(({ _fila, ...x }) => x)) !== JSON.stringify(nuevo[h].map(({ _fila, ...x }) => x))) { item(`Cambió la hoja ${h[0].toUpperCase() + h.slice(1)}`); n++; }
  if (!n) item('Sin cambios.');
}

console.log(out.join('\n') + '\n');
process.exit(errores.length ? 1 : 0);
