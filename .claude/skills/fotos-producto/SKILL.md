---
name: fotos-producto
description: Preparar fotos de productos o del sitio de ESSENZA — convertir JPG/PNG a WebP, recortar a 4:5 (producto) o al formato de cada imagen editorial (hero, Diana, universos, blog, og 1200×630), comprimir, renombrar 1.webp, 2.webp… y ubicarlas en catalogo/productos/<SKU>/ o static/img/. Úsala cuando suban fotos nuevas o el revisor avise de imágenes pesadas o mal nombradas.
---

# Fotos de producto y del sitio

Se necesita ImageMagick (`convert`, `identify`) con soporte WebP: verifica con `convert -list format | grep -i webp`.

## Dónde va cada foto

| Tipo | Ruta | Formato |
|---|---|---|
| Producto | `catalogo/productos/<SKU>/1.webp`, `2.webp`… (1 = principal) | 4:5, 1200×1500 |
| Portada | `static/img/hero.webp` | 4:5, 1200×1500 |
| Retratos | `static/img/diana.webp`, `diana-nosotros.webp` | 4:5 |
| Universos | `static/img/universo-<slug-categoria>.webp` | 4:3, 1200×900 |
| Blog | `static/img/blog-<slug-articulo>.webp` | 16:9, 1600×900 |
| Compartir (WhatsApp/redes) | `static/img/og.jpg` | 1200×630; **JPG**, porque algunos bots no leen WebP |

El nombre de la carpeta debe ser el **SKU exacto** del Excel (mayúsculas incluidas).

## Convertir

```bash
# Producto: recorte centrado 4:5, 1200×1500, WebP calidad 82, sin metadatos (quita GPS de fotos de celular)
convert entrada.jpg -auto-orient -resize 1200x1500^ -gravity center -extent 1200x1500 -strip -quality 82 catalogo/productos/ESZ-INT-001/1.webp

# Lote: todas las fotos de una carpeta, en orden alfabético → 1.webp, 2.webp…
i=1; for f in $(ls ruta/origen/*.{jpg,jpeg,png,JPG} 2>/dev/null | sort); do
  convert "$f" -auto-orient -resize 1200x1500^ -gravity center -extent 1200x1500 -strip -quality 82 "catalogo/productos/<SKU>/$i.webp"; i=$((i+1)); done

# Imagen para compartir
convert entrada.jpg -auto-orient -resize 1200x630^ -gravity center -extent 1200x630 -strip -quality 85 static/img/og.jpg
```

Si el recorte centrado corta el producto, prueba `-gravity north` o `south`, o pide la foto con más aire.
Revisa el resultado abriendo el archivo con la herramienta Read (muestra la imagen) antes de darlo por bueno.

## Revisar

```bash
identify -format '%f %wx%h %b\n' catalogo/productos/*/*.webp   # meta: 1200x1500 y < 300 KB
npm run revisar                                                # carpetas huérfanas, nombres, pesos
```

## Criterio editorial (de Diana)

Fondo marfil o lino, luz natural, producto centrado con espacio alrededor. **Bienestar íntimo: composiciones
discretas, nunca explícitas.** Si una foto no cumple, dilo en vez de publicarla. Borra los originales pesados
que hayan quedado dentro del repo y los `*:Zone.Identifier` de Windows.
