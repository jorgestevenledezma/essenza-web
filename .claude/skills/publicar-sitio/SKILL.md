---
name: publicar-sitio
description: Publicar cambios de ESSENZA en producción (GitHub Pages, repo jorgestevenledezma/essenza-web) — revisión previa, commit, push a main, seguimiento del workflow "Publicar sitio" y verificación en el dominio. También cubre la primera publicación y la conexión del dominio essenzabydianacaliz.com. Úsala cuando pidan publicar, subir, desplegar o "que se vea en la web".
---

# Publicar el sitio

Push a `main` → GitHub Actions (`.github/workflows/deploy.yml`) corre `npm run build` y publica `dist/`
en GitHub Pages. No hay otro entorno: **lo que entra a main sale a producción en 1 o 2 minutos.**

## 1. Antes de subir

```bash
npm run revisar        # si cambió el Excel o las fotos; si hay errores, para aquí
npm run build          # debe terminar sin errores; explica cada aviso al usuario
git status --short     # nada de ~$*.xlsx, *:Zone.Identifier, node_modules ni dist
```

Si cambió el catálogo, usa el agente **catalogo-excel**; si cambiaron plantillas o páginas, el **seo-specialist**.
Confirma con el usuario antes del push: es publicar.

## 2. Subir

```bash
git add -A && git commit -m "<qué cambia, en español>"   # ej. "Agrega Lush 3 y actualiza precios de kits"
git push origin main
gh run watch --exit-status $(gh run list --workflow "Publicar sitio" -L1 --json databaseId -q '.[0].databaseId')
```

Si falla: `gh run view --log-failed`. Casi siempre es el Excel (hoja renombrada, archivo dañado) o la descarga
de `xlsx` desde cdn.sheetjs.com; reintenta con `gh run rerun --failed` si fue la red.

## 3. Verificar

```bash
D=https://www.essenzabydianacaliz.com   # o https://jorgestevenledezma.github.io/essenza-web si aún no hay dominio
for p in / /tienda/ /sitemap.xml /robots.txt /llms.txt; do echo "$(curl -s -o /dev/null -w '%{http_code}' $D$p) $p"; done
```

Mientras el dominio no apunte a GitHub, el sitio en `github.io/essenza-web/` funciona, pero canonical, sitemap y
og:url ya apuntan al dominio final (es lo correcto) y el 404 usa rutas absolutas que solo funcionan con el dominio.

## Primera publicación (una sola vez)

```bash
git init -b main && git add -A && git commit -m "Sitio ESSENZA"
gh repo create jorgestevenledezma/essenza-web --source . --push --public   # o --private (Pages requiere plan pago)
gh api -X POST repos/jorgestevenledezma/essenza-web/pages -f build_type=workflow
```

Antes de hacerlo público, revisa `notas_internas` del Excel: quedará legible para cualquiera.

## Dominio (una sola vez)

1. Hoja Config: `dominio = https://www.essenzabydianacaliz.com` (el build genera `CNAME`).
2. DNS en el proveedor: `CNAME www → jorgestevenledezma.github.io` y `A @ → 185.199.108.153, .109.153, .110.153, .111.153`.
3. `gh api -X PUT repos/jorgestevenledezma/essenza-web/pages -f cname=www.essenzabydianacaliz.com`, y cuando el
   certificado esté listo: `gh api -X PUT repos/jorgestevenledezma/essenza-web/pages -F https_enforced=true`.
4. Google Search Console: verificar el dominio y enviar `https://www.essenzabydianacaliz.com/sitemap.xml`.
