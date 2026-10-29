// Lee el catálogo desde contenido/catalogo/ (archivos JSON que edita Pages CMS) y lo entrega con la misma
// forma que las hojas del Excel, para que normalize() valide igual sin importar la fuente.
import fs from 'node:fs';
import path from 'node:path';

const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const files = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []);
const join = v => (Array.isArray(v) ? v.join('|') : v ?? '');
const siNo = v => (v === true ? 'sí' : v === false ? 'no' : v ?? '');

export const hayArchivos = root => fs.existsSync(path.join(root, 'contenido/catalogo/productos'));

export function leerArchivos(root) {
  const dir = path.join(root, 'contenido/catalogo');
  const productos = [], imagenes = {};
  for (const f of files(path.join(dir, 'productos'))) {
    const p = json(path.join(dir, 'productos', f));
    // _fila se usa en los avisos del build: con archivos se muestra el nombre del archivo
    productos.push({
      ...p, _fila: f, beneficios: join(p.beneficios), caracteristicas: join(p.caracteristicas), atributos: join(p.atributos),
      relacionados: join(p.relacionados), solo_adultos: siNo(p.solo_adultos), destacado: siNo(p.destacado), nuevo: siNo(p.nuevo),
    });
    // Pages CMS guarda "/productos/<SKU>/foto.webp"; el build trabaja con rutas relativas a catalogo/
    if (p.sku && Array.isArray(p.imagenes) && p.imagenes.length) imagenes[p.sku] = p.imagenes.map(i => String(i).replace(/^\/+/, ''));
  }
  // Una fila por subcategoría, como en la hoja Categorias del Excel
  const categorias = files(path.join(dir, 'categorias')).flatMap(f => {
    const c = json(path.join(dir, 'categorias', f));
    const subs = c.subcategorias?.length ? c.subcategorias : [''];
    return subs.map(subcategoria => ({ categoria: c.categoria, slug: c.slug, descripcion_categoria: c.descripcion_categoria, subcategoria }));
  });
  const marcas = files(path.join(dir, 'marcas')).map(f => json(path.join(dir, 'marcas', f)));
  const cfgFile = path.join(dir, 'configuracion.json');
  const config = fs.existsSync(cfgFile) ? Object.entries(json(cfgFile)).map(([clave, valor]) => ({ clave, valor })) : [];
  return { productos, categorias, marcas, config, imagenes };
}
