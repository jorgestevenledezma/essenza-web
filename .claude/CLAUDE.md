# ESSENZA by Diana Caliz · contexto del proyecto

Sitio estático de una tienda colombiana de **cuidado de la piel, equilibrio interno y bienestar íntimo**.
No hay backend, ni pagos en línea, ni cuentas: el cliente arma un carrito (guardado en `localStorage`)
y lo envía por **WhatsApp**, donde Diana confirma disponibilidad, envío y pago.

- Dueña del negocio y quien edita el catálogo: **Diana Caliz** (no es programadora; usa Excel y GitHub Desktop).
- Mantenimiento técnico: Jorge Steven Ledezma (cuenta GitHub `jorgestevenledezma`).
- Dominio final: `https://www.essenzabydianacaliz.com` (GitHub Pages + CNAME generado por el build).
- Idioma de todo el sitio, los mensajes del build y la documentación: **español de Colombia**.

## Cómo funciona

```
catalogo/catalogo.xlsx            ← fuente de verdad: hojas Productos, Categorias, Marcas, Config
catalogo/productos/<SKU>/1.webp   ← fotos por SKU (1 = principal, 4:5, 1200×1500)
static/                           ← CSS, JS del carrito/filtros/quiz, favicon, img/ editoriales
contenido/blog.json               ← artículos: [{slug,titulo,etiqueta,categoria,resumen,lectura,cuerpo:[["p"|"h",texto]],fecha?,autor?}]
src/render.mjs                    ← normalize() valida el Excel; buildSite() genera HTML, JSON-LD y llms.txt
scripts/build.mjs                 ← lee Excel + fotos → dist/ (HTML, sitemap.xml, robots.txt, llms.txt, CNAME)
scripts/revisar-catalogo.mjs      ← `npm run revisar`: valida el Excel y lo compara con el último commit
scripts/serve.mjs                 ← `npm run dev`: build + servidor en http://localhost:4321
.github/workflows/deploy.yml      ← push a main → build → GitHub Pages
```

Comandos: `npm install` (una vez), `npm run build`, `npm run dev`, `npm run revisar`.
Sin framework, sin bundler y con una sola dependencia (`xlsx` de SheetJS desde su CDN). Mantenlo así:
no agregues React, Tailwind, Astro, etc. sin que lo pidan.

## Reglas del Excel (las aplica `normalize()`)

- Solo se publican filas con `estado = validado`. Otros estados: `borrador`, `pendiente`, `oculto`.
- Obligatorios para publicar: `sku`, `nombre`, `marca`, `categoria` (existente en hoja Categorias), `precio` > 0, `descripcion_corta`.
- Listas dentro de una celda: separadas por `|`. Atributos: `clave:valor1,valor2|clave2:valor`. Variaciones: `Color: Rosa|Morado`.
- `pendiente de validación` en cualquier celda = se oculta en la web y el build lo reporta.
- Precios en COP, número sin puntos ni `$`. `precio_promocional` solo cuenta si es menor que `precio`.
- `slug` vacío → se genera desde `nombre + marca`. **Cambiar el slug de un producto publicado rompe su URL.**
- `notas_internas` nunca se muestra en la web, pero sí queda en GitHub.

## Reglas de contenido (no negociables)

- **Sin promesas médicas**: nada de "cura", "elimina", "garantiza", "quema grasa", "adelgaza". Usar "ayuda a",
  "contribuye a", "acompaña". El build avisa si las encuentra.
- Nunca inventar atributos, ingredientes, beneficios, dimensiones ni precios. Si falta un dato → `pendiente de validación`.
- Bienestar íntimo: tono natural, sin prejuicios y **nunca explícito** (ni en texto ni en fotos). Productos +18 con `solo_adultos = sí`.
- Suplementos: aclarar que no son medicamentos. Siempre recomendar consultar a un profesional de la salud cuando aplique.
- Privacidad: no guardar datos de clientes, contraseñas ni tokens en el repo ni en el Excel.
- Las páginas legales (envíos, privacidad, términos) tienen textos `PENDIENTE`; mientras los tengan llevan `noindex`.
  La de privacidad debe cumplir la Ley 1581 de 2012 (Colombia).

## SEO (ya implementado en `render.mjs`)

Título, description y canonical por página; Open Graph (`og:locale es_CO`) y tarjeta de Twitter/X; JSON-LD de
`OnlineStore` + `WebSite` (inicio), `Product` + `Offer` en COP (producto), `BreadcrumbList` (categoría, marca,
producto, blog), `Article` (blog) y `FAQPage`; `noindex` en carrito, 404 y legales pendientes; `sitemap.xml`
sin esas páginas; `llms.txt` para buscadores con IA, generado desde el Excel. Las imágenes `og.*`, `hero.*`, etc.
van en `static/img/` (ver `static/img/LEEME.md`).

## Front (estado tras la revisión de octubre de 2026)

- Fotos faltantes: se muestra un monograma "E" de marca (`ph()` en `render.mjs`), nunca rutas de archivo. El build
  lista qué fotos del sitio faltan en `static/img/`.
- Textos legales pendientes: aviso amable con enlace a WhatsApp + `noindex`; el build los lista.
- Marcas sin productos publicados: `noindex` y fuera de la franja de marcas del inicio.
- Accesibilidad: contraste AA (`--taupe:#75685A`), carrito lateral como diálogo con foco atrapado y Escape,
  inputs de 16px en móvil (evita el zoom de iOS), `prefers-reduced-motion` respetado.
- Movimiento: curvas `--ease-out` y `--ease-drawer`; carrito lateral con deslizamiento, avisos únicos (no se apilan).
- Pruebas: después de tocar el front, revisa en `npm run dev` escritorio (1440px) y móvil (360–390px).

## Agentes y skills de este repo

- Agente `catalogo-excel`: úsalo **siempre que cambie `catalogo/catalogo.xlsx` o las fotos de productos**.
- Agente `seo-specialist`: al agregar páginas, cambiar `render.mjs`/`build.mjs` o antes de publicar.
- Skills: `actualizar-catalogo`, `fotos-producto`, `nuevo-articulo-blog`, `publicar-sitio`.

## Al editar código

- Todo el HTML sale de plantillas en `src/render.mjs`; escapa todo texto del Excel con `esc()`.
- Rutas relativas con el prefijo `b` (`../` según profundidad); el 404 usa `base: '/'`.
- Después de cualquier cambio: `npm run build` y revisar la consola (avisos) y `dist/`.
