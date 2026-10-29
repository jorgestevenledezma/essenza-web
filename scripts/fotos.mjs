// Prepara las fotos de producto que Diana deja en catalogo/imagenes/ (cualquier nombre con el SKU, JPG/PNG/WebP)
// y las que queden sin optimizar dentro de catalogo/productos/<SKU>/.
// Uso: npm run fotos               → procesa
//      npm run fotos -- --revisar  → solo muestra qué haría
// Nombres: ESZ-INT-001.jpg → 1.webp (principal) · ESZ-INT-001-2.jpg → 2.webp · "ESZ-INT-001 (3).png" → 3.webp
// Necesita ImageMagick (convert, identify, montage) con soporte WebP.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENTRADA = path.resolve(ROOT, arg('--entrada', 'catalogo/imagenes'));
const SALIDA = path.resolve(ROOT, arg('--salida', 'catalogo/productos'));
const SOLO_REVISAR = process.argv.includes('--revisar');
const MARFIL = '#F8F5EF';
const FOTO = /\.(jpe?g|png|webp)$/i;

const im = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
try { if (!/WEBP/.test(im('convert', ['-list', 'format']))) throw 0; } catch { console.error('✗ Falta ImageMagick con soporte WebP (sudo apt install imagemagick).'); process.exit(1); }

const skus = new Set(XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(path.join(ROOT, 'catalogo/catalogo.xlsx'))).Sheets.Productos, { defval: '' }).map(r => String(r.sku).trim()).filter(Boolean));
const leerNombre = f => {
  const m = path.basename(f).match(/^(ESZ-[A-Z]{3}-\d{3})(?:\s*[-_ (]\s*(\d{1,2})\)?)?/i);
  return m && { sku: m[1].toUpperCase(), n: m[2] ? Number(m[2]) : 1 };
};

// Fondo liso: si al recortar el borde uniforme la foto pierde más del 8 % del área, el producto está sobre
// un fondo claro y se centra sobre marfil con aire alrededor. Si no, es una foto "a sangre" y se recorta 4:5.
function procesar(src, dest) {
  const [w, h] = im('identify', ['-format', '%w %h', src + '[0]']).split(' ').map(Number);
  const [tw, th] = im('convert', [src + '[0]', '-auto-orient', '-fuzz', '8%', '-trim', '-format', '%w %h', 'info:']).split(' ').map(Number);
  const fondoLiso = tw * th < w * h * 0.92;
  const args = fondoLiso
    ? [src + '[0]', '-auto-orient', '-fuzz', '8%', '-trim', '+repage', '-resize', '1000x1300', '-background', MARFIL, '-gravity', 'center', '-extent', '1200x1500',
      // el fondo claro que quedó alrededor del producto pasa a marfil (relleno desde las 4 esquinas)
      '-fill', MARFIL, '-fuzz', '4%', '-draw', 'color 0,0 floodfill', '-draw', 'color 1199,0 floodfill', '-draw', 'color 0,1499 floodfill', '-draw', 'color 1199,1499 floodfill']
    : [src + '[0]', '-auto-orient', '-resize', '1200x1500^', '-gravity', 'center', '-extent', '1200x1500'];
  if (!SOLO_REVISAR) { fs.mkdirSync(path.dirname(dest), { recursive: true }); im('convert', [...args, '-strip', '-quality', '82', dest + '.tmp.webp']); fs.renameSync(dest + '.tmp.webp', dest); }
  return fondoLiso ? 'fondo claro → centrado sobre marfil' : 'foto completa → recorte 4:5 (si el fondo distrae, quítalo antes)';
}

const hechos = [], sinSku = [], skuDesconocido = [], originales = [];
// 1. Fotos nuevas en catalogo/imagenes/
const entrada = fs.existsSync(ENTRADA) ? fs.readdirSync(ENTRADA).filter(f => FOTO.test(f) && !f.startsWith('_')) : [];
for (const f of entrada) {
  const id = leerNombre(f);
  if (!id) { sinSku.push(f); continue; }
  if (!skus.has(id.sku)) { skuDesconocido.push(`${f} (${id.sku} no está en el Excel)`); continue; }
  const dest = path.join(SALIDA, id.sku, `${id.n}.webp`);
  const reemplaza = fs.existsSync(dest);
  hechos.push({ desde: f, dest, modo: procesar(path.join(ENTRADA, f), dest), reemplaza });
  originales.push(path.join(ENTRADA, f));
}
// 2. Fotos sin optimizar que alguien puso directo en catalogo/productos/<SKU>/
for (const sku of fs.existsSync(SALIDA) ? fs.readdirSync(SALIDA) : []) {
  const dir = path.join(SALIDA, sku);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter(x => FOTO.test(x) && !x.endsWith('.tmp.webp'))) {
    const ok = /^\d+\.webp$/.test(f) && im('identify', ['-format', '%wx%h', path.join(dir, f)]) === '1200x1500' && fs.statSync(path.join(dir, f)).size < 300e3;
    if (ok) continue;
    const n = Number((f.match(/^(\d+)/) || [])[1]) || (fs.readdirSync(dir).filter(x => /^\d+\.webp$/.test(x)).length + 1);
    const dest = path.join(dir, `${n}.webp`);
    hechos.push({ desde: `${sku}/${f}`, dest, modo: procesar(path.join(dir, f), dest), reemplaza: false });
    if (path.join(dir, f) !== dest) originales.push(path.join(dir, f));
  }
}

// 3. Los originales salen del repositorio a catalogo/imagenes/procesadas/ (ignorada por Git), nunca se borran
if (!SOLO_REVISAR && originales.length) {
  const bodega = path.join(ENTRADA, 'procesadas'); fs.mkdirSync(bodega, { recursive: true });
  for (const o of originales) if (fs.existsSync(o)) fs.renameSync(o, path.join(bodega, `${Date.now()}-${path.basename(o)}`));
}

// 4. Hoja de contacto para revisar todo de un vistazo (catalogo/imagenes/_revision.jpg)
let hoja = '';
if (!SOLO_REVISAR && hechos.length) {
  hoja = path.join(ENTRADA, '_revision.jpg');
  const fichas = hechos.map(h => ['-label', `${path.basename(path.dirname(h.dest))} · ${path.basename(h.dest)}`, h.dest]).flat();
  im('montage', [...fichas, '-tile', `${Math.min(6, hechos.length)}x`, '-geometry', '240x300+6+6', '-pointsize', '13', '-background', 'white', hoja]);
}

console.log(`\nFotos de producto${SOLO_REVISAR ? ' (solo revisión, no se cambió nada)' : ''}`);
for (const h of hechos) console.log(`  ✓ ${h.desde} → ${path.relative(ROOT, h.dest)} · ${h.modo}${h.reemplaza ? ' · REEMPLAZA la anterior' : ''}`);
if (!hechos.length) console.log('  · No hay fotos nuevas por procesar.');
if (sinSku.length) console.log(`\n  ! Sin SKU en el nombre (renómbralas, p. ej. ESZ-INT-001.jpg): ${sinSku.join(', ')}`);
if (skuDesconocido.length) console.log(`\n  ! SKU que no existe en el Excel: ${skuDesconocido.join(', ')}`);
if (hoja) console.log(`\n  Revisa la hoja de contacto: ${path.relative(ROOT, hoja)}`);
console.log('');
