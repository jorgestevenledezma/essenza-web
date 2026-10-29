// Migra catalogo/catalogo.xlsx a archivos JSON editables con Pages CMS (contenido/catalogo/).
// Uso:
//   node scripts/excel-a-archivos.mjs ESZ-PIE-002 ESZ-INT-001   → solo esos productos (piloto)
//   node scripts/excel-a-archivos.mjs --todos                    → todo el catálogo
// Siempre exporta categorías, marcas y configuración. No borra productos que ya existan como archivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { slugify } from '../src/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'contenido/catalogo');
const args = process.argv.slice(2);
if (!args.length) { console.error('Indica SKUs o --todos. Ejemplo: node scripts/excel-a-archivos.mjs ESZ-PIE-002'); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(path.join(ROOT, 'catalogo/catalogo.xlsx')));
const sheet = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true });
const str = v => (v == null ? '' : String(v).trim());
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n'); };
// Quita los campos vacíos para que los archivos sean fáciles de leer
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
const list = v => str(v).split('|').map(x => x.trim()).filter(Boolean);
const yes = v => /^s[ií]/i.test(str(v));

// Categorías: el Excel tiene una fila por subcategoría; aquí queda un archivo por categoría
const cats = {};
for (const r of sheet('Categorias')) {
  const name = str(r.categoria); if (!name) continue;
  const c = cats[name] ??= { categoria: name, slug: str(r.slug) || slugify(name), descripcion_categoria: '', subcategorias: [] };
  if (str(r.descripcion_categoria)) c.descripcion_categoria = str(r.descripcion_categoria);
  if (str(r.subcategoria)) c.subcategorias.push(str(r.subcategoria));
}
for (const c of Object.values(cats)) write(`categorias/${c.slug}.json`, clean(c));

for (const r of sheet('Marcas')) {
  const name = str(r.marca); if (!name) continue;
  const slug = str(r.slug) || slugify(name);
  write(`marcas/${slug}.json`, clean({ marca: name, slug, universo: str(r.universo), descripcion_marca: str(r.descripcion_marca) }));
}

write('configuracion.json', Object.fromEntries(sheet('Config').filter(r => str(r.clave)).map(r => [str(r.clave), str(r.valor)])));

const todos = args.includes('--todos');
const pedidos = new Set(args.filter(a => a !== '--todos'));
let n = 0;
for (const r of sheet('Productos')) {
  const sku = str(r.sku);
  if (!sku || (!todos && !pedidos.has(sku))) continue;
  pedidos.delete(sku);
  const fotos = fs.existsSync(path.join(ROOT, 'catalogo/productos', sku))
    ? fs.readdirSync(path.join(ROOT, 'catalogo/productos', sku)).filter(f => /\.(webp|avif|jpe?g|png)$/i.test(f)).sort().map(f => `/productos/${sku}/${f}`)
    : [];
  write(`productos/${slugify(sku)}.json`, clean({
    estado: str(r.estado).toLowerCase() || 'borrador', sku, nombre: str(r.nombre), marca: str(r.marca), categoria: str(r.categoria),
    subcategoria: str(r.subcategoria), slug: str(r.slug), precio: Number(r.precio) || '', precio_promocional: Number(r.precio_promocional) || '',
    disponibilidad: str(r.disponibilidad).toLowerCase() || 'disponible', descripcion_corta: str(r.descripcion_corta),
    por_que_lo_recomendamos: str(r.por_que_lo_recomendamos), para_quien: str(r.para_quien), descripcion_completa: str(r.descripcion_completa),
    beneficios: list(r.beneficios), caracteristicas: list(r.caracteristicas), ingredientes_materiales: str(r.ingredientes_materiales),
    modo_uso: str(r.modo_uso), precauciones: str(r.precauciones), presentacion: str(r.presentacion), dimensiones: str(r.dimensiones),
    peso: str(r.peso), variaciones: str(r.variaciones), atributos: list(r.atributos),
    solo_adultos: yes(r.solo_adultos), destacado: yes(r.destacado), nuevo: yes(r.nuevo), relacionados: list(r.relacionados),
    imagenes: fotos, texto_alternativo: str(r.texto_alternativo), seo_title: str(r.seo_title), meta_description: str(r.meta_description),
    notas_internas: str(r.notas_internas),
  }));
  n++;
}
console.log(`✓ ${n} producto(s), ${Object.keys(cats).length} categorías, marcas y configuración en contenido/catalogo/`);
if (pedidos.size) console.warn(`! No encontré en el Excel: ${[...pedidos].join(', ')}`);
