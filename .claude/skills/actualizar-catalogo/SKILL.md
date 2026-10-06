---
name: actualizar-catalogo
description: Agregar, editar, ocultar o retirar productos, categorías o marcas de ESSENZA en catalogo/catalogo.xlsx, o aplicar un Excel nuevo que subió Diana. Úsala cuando pidan "agrega este producto", "cambia el precio", "pon en oferta", "agotado", "sube este Excel", "nueva marca/categoría".
---

# Actualizar el catálogo

El Excel es la fuente de verdad del sitio. Lee las reglas en `.claude/CLAUDE.md` (sección "Reglas del Excel").

## Si Diana subió un Excel nuevo

1. Si llegó con otro nombre (ej. `ESSENZA_catalogo_v3.xlsx`), revísalo **antes** de reemplazar:
   `npm run revisar -- ruta/al/archivo.xlsx`.
2. Lanza el agente **catalogo-excel** con esa ruta y muestra su reporte.
3. Solo si no hay bloqueantes, y el usuario lo confirma, cópialo a `catalogo/catalogo.xlsx`.
   Borra los temporales de Excel/Windows (`~$*.xlsx`, `*:Zone.Identifier`), que no deben subirse.

## Si piden un cambio puntual

Edita con SheetJS conservando todas las hojas (Instrucciones, Listas y los desplegables). Ten en cuenta que
SheetJS Community no conserva estilos ni validaciones de datos al reescribir: **avisa al usuario** y, si
Diana sigue usando el archivo con formato, propón que ella haga el cambio en Excel y tú solo lo revises.

```js
// node --input-type=module
import * as XLSX from 'xlsx'; import fs from 'node:fs';
const f = 'catalogo/catalogo.xlsx';
const wb = XLSX.read(fs.readFileSync(f));
const ws = wb.Sheets.Productos;
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
const p = rows.find(r => r.sku === 'ESZ-INT-001'); p.precio_promocional = 599000;
const header = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
wb.Sheets.Productos = XLSX.utils.json_to_sheet(rows.filter(r => r.sku || r.nombre), { header });
fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
```

Equivalencias habituales:

| Piden | Qué cambiar |
|---|---|
| Publicar | `estado = validado` (con los obligatorios completos) |
| Retirar temporalmente | `estado = oculto` (la URL deja de existir; avisa) |
| Agotado | `disponibilidad = agotado` (sigue visible, sin botón de compra) |
| Oferta | `precio_promocional` menor que `precio` |
| Destacar en el inicio | `destacado = sí` (máximo 4 se muestran) |
| Producto nuevo | SKU con el patrón `ESZ-<CAT>-<NNN>` (INT íntimo, PIE piel, EQU equilibrio, KIT kits) y carpeta `catalogo/productos/<SKU>/` |

Para un producto nuevo **nunca inventes** beneficios, ingredientes, dimensiones ni precio: lo que no te den
va como `pendiente de validación`. Para categorías o marcas nuevas, agrégalas primero en sus hojas.

## Cierre

1. `npm run revisar` y `npm run build`: sin errores y explica cada aviso.
2. Si cambió algo visible, `npm run dev` y revisa la ficha en http://localhost:4321/producto/<slug>/.
3. Para publicar, usa la skill **publicar-sitio**.
