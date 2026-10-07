# ESSENZA by Diana Caliz · sitio web

Sitio estático generado desde un Excel. Los clientes arman su pedido en un carrito y lo envían por WhatsApp. Se publica gratis en GitHub Pages con dominio propio.

```
catalogo/catalogo.xlsx          ← productos, categorías, marcas y configuración
catalogo/productos/<SKU>/1.webp ← fotos de cada producto (1 = principal)
static/img/                     ← fotos del sitio (hero, Diana, universos…)
contenido/blog.json             ← artículos del blog
src/render.mjs                  ← plantillas de todas las páginas
scripts/build.mjs               ← lee el Excel y genera dist/
```

## Actualizar productos (el día a día)

1. Edita `catalogo/catalogo.xlsx`. Solo se publican las filas con estado **validado**.
2. Pon las fotos en `catalogo/productos/<SKU>/` con los nombres `1.webp`, `2.webp`… El nombre de la carpeta es el SKU exacto. No hace falta crearla: al correr `npm run build` o `npm run dev`, se crea sola para cada producto en estado **validado**.
3. Sube los cambios a GitHub (con GitHub Desktop: *Commit* y luego *Push*). El sitio se regenera y publica solo en 1 o 2 minutos.

Para revisar en tu computador antes de subir: `npm install` (solo la primera vez) y luego `npm run dev`. Se abre en http://localhost:4321

El build avisa en consola de productos incompletos, SKUs duplicados, fotos faltantes, número de WhatsApp inválido y posibles promesas médicas ("cura", "elimina", "garantiza"…).

Para una revisión más completa del Excel (qué cambió desde la última vez, columnas renombradas, categorías mal escritas, fotos huérfanas o pesadas): `npm run revisar`.

El build también genera `sitemap.xml`, `robots.txt` y `llms.txt` (resumen del catálogo para buscadores con IA como ChatGPT o Perplexity), siempre al día con el Excel.

## Publicar por primera vez en GitHub (cuenta jorgestevenledezma)

1. Entra a https://github.com/new y crea el repositorio **essenza-web** (puede ser público o privado; Pages en repos privados requiere plan de pago).
2. En la carpeta del proyecto ejecuta:
   ```bash
   git init
   git add .
   git commit -m "Sitio ESSENZA"
   git branch -M main
   git remote add origin https://github.com/jorgestevenledezma/essenza-web.git
   git push -u origin main
   ```
3. En GitHub ve a **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. En la pestaña **Actions** verás "Publicar sitio". Al terminar, el sitio queda en `https://jorgestevenledezma.github.io/essenza-web/`.

## Conectar el dominio essenzabydianacaliz.com

1. En la hoja **Config** del Excel, `dominio` = `https://www.essenzabydianacaliz.com` (el build crea el archivo CNAME solo).
2. En el proveedor del dominio crea estos registros DNS:
   - `CNAME` · nombre `www` → `jorgestevenledezma.github.io`
   - `A` · nombre `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. En GitHub, **Settings → Pages → Custom domain**: `www.essenzabydianacaliz.com` → Save. Cuando el certificado esté listo, activa **Enforce HTTPS**.

La propagación del DNS puede tardar desde minutos hasta 24 horas.

## Hoja Config

| clave | uso |
|---|---|
| whatsapp_numero | Número de destino con indicativo, sin + ni espacios: `573001234567` |
| dominio | URL pública del sitio |
| mensaje_general / mensaje_categoria / mensaje_producto / mensaje_pedido | Textos que se precargan en WhatsApp. `{categoria}`, `{producto}` y `{url}` se reemplazan solos |
| texto_envio, aviso_adultos | Textos de la ficha de producto |
| email, horario, instagram, facebook, tiktok | Opcionales. Si están vacíos no se muestran |
| newsletter_action | Opcional. URL del formulario de Mailchimp/Brevo; si está vacía no aparece el bloque de newsletter |

## Formatos dentro de una celda

- Listas (beneficios, características, relacionados): separadas por `|`
- Atributos para filtros: `clave:valor` separados por `|`, varios valores con coma: `uso:Individual,Pareja|control:App`
- Variaciones: `Color: Rosa|Morado`
- Si un dato no está confirmado escribe `pendiente de validación`: se oculta en la web y el build lo reporta.

## Importante

- No guardes usuarios, contraseñas ni datos de clientes en el Excel ni en el repositorio.
- Las páginas legales (envíos, privacidad, términos) tienen textos marcados como pendientes: deben completarse y revisarse antes del lanzamiento.
