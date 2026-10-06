// Genera el sitio estático en dist/ a partir de catalogo/catalogo.xlsx
// Uso: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { normalize, buildSite } from '../src/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const EXCEL = path.join(ROOT, process.env.CATALOGO || 'catalogo/catalogo.xlsx');
const IMG_DIR = path.join(ROOT, 'catalogo/productos');
const STATIC = path.join(ROOT, 'static');
const IMG_EXT = /\.(webp|avif|jpe?g|png)$/i;

const t0 = Date.now();
if (!fs.existsSync(EXCEL)) { console.error(`✗ No encuentro el Excel: ${EXCEL}`); process.exit(1); }

// 1. Leer Excel
const wb = XLSX.read(fs.readFileSync(EXCEL), { type: 'buffer' });
const sheet = name => {
  const ws = wb.Sheets[name] || wb.Sheets[Object.keys(wb.Sheets).find(k => k.toLowerCase() === name.toLowerCase())];
  if (!ws) { console.warn(`! Falta la hoja "${name}"`); return []; }
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }).map((r, i) => ({ ...r, _fila: i + 2 }));
};

// 2. Imágenes por SKU: catalogo/productos/<SKU>/1.webp, 2.webp…
const imagenes = {};
if (fs.existsSync(IMG_DIR)) {
  for (const sku of fs.readdirSync(IMG_DIR)) {
    const dir = path.join(IMG_DIR, sku);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter(f => IMG_EXT.test(f)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    if (files.length) imagenes[sku] = files.map(f => `productos/${sku}/${f}`);
  }
}

const data = normalize({
  productos: sheet('Productos'), categorias: sheet('Categorias'), marcas: sheet('Marcas'), config: sheet('Config'), imagenes,
});

// 3. Contenido extra
const blogFile = path.join(ROOT, 'contenido/blog.json');
const blog = fs.existsSync(blogFile) ? JSON.parse(fs.readFileSync(blogFile, 'utf8')) : [];
const imgStatic = path.join(STATIC, 'img');
const assets = fs.existsSync(imgStatic) ? fs.readdirSync(imgStatic).filter(f => IMG_EXT.test(f)) : [];

const { pages, urls, llms, pendientes, missing } = buildSite(data, { blog, assets });

// 4. Escribir dist/
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(STATIC, OUT, { recursive: true });
for (const p of data.products) for (const rel of p.imagenes) {
  const dest = path.join(OUT, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'catalogo', rel), dest);
}
for (const [rel, html] of Object.entries(pages)) {
  const dest = path.join(OUT, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}
const dominio = String(data.cfg.dominio || '').replace(/\/$/, '');
// Sin <lastmod>: el build no sabe qué página cambió y Google ignora fechas que siempre son "hoy"
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'llms.txt'), llms);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${dominio}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const host = dominio.replace(/^https?:\/\//, '');
if (host && !host.endsWith('github.io')) fs.writeFileSync(path.join(OUT, 'CNAME'), host + '\n');

// 5. Reporte
console.log(`\nESSENZA · sitio generado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`  ✓ ${data.products.length} productos publicados · ${data.skipped} sin publicar (borrador/pendiente/incompletos)`);
console.log(`  ✓ ${Object.keys(pages).length} páginas · ${data.cats.length} categorías · ${data.brands.length} marcas · ${blog.length} artículos`);
if (!assets.some(a => a.startsWith('og.'))) missing.push('og');
if (data.warnings.length) { console.log(`\n  Revisar (${data.warnings.length}):`); data.warnings.forEach(w => console.log('  ! ' + w)); }
if (missing.length) console.log(`\n  Fotos del sitio que faltan en static/img/ (se muestra el monograma): ${missing.join(', ')}`);
if (pendientes.length) console.log(`\n  Textos legales pendientes (página sin indexar en Google):\n${pendientes.map(p => '  · ' + p).join('\n')}`);
console.log('');
