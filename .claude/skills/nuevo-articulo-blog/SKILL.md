---
name: nuevo-articulo-blog
description: Escribir o editar artículos del blog de ESSENZA en contenido/blog.json con la voz de la marca, SEO local para Colombia y sin promesas médicas. Úsala cuando pidan un artículo, una guía, una entrada de blog o contenido para posicionar una categoría o producto.
---

# Nuevo artículo del blog

Los artículos viven en `contenido/blog.json` (un arreglo; el primero aparece primero en el inicio).

```json
{
  "slug": "rutina-basica-piel-mixta",
  "titulo": "Rutina básica para piel mixta en clima cálido",
  "etiqueta": "Cuidado de la piel",
  "categoria": "cuidado-de-la-piel",
  "resumen": "Una frase de 120 a 155 caracteres: es la meta description y el texto de la vista previa en WhatsApp.",
  "lectura": "5 min de lectura",
  "fecha": "2026-10-05",
  "autor": "Diana Caliz",
  "cuerpo": [["p", "Párrafo…"], ["h", "Subtítulo (se vuelve h2)"], ["p", "…"]]
}
```

- `categoria` debe ser el slug de una categoría de la hoja Categorias: el artículo muestra debajo sus productos.
- `fecha` (ISO) y `autor` son opcionales pero recomendados: alimentan el JSON-LD `Article` (E-E-A-T).
  Usa `autor` solo si Diana firma el texto; si no, omítelo y queda la marca como autora.
- `slug` en minúsculas, sin tildes, con guiones. **No cambies el slug de un artículo publicado.**
- Foto opcional: `static/img/blog-<slug>.webp` 16:9 (skill **fotos-producto**). Se usa también como og:image.

## Voz ESSENZA

Cercana, calmada, educativa, sin sensacionalismo ni tecnicismos. Tutea. Frases cortas.
"Menos productos, mejor seleccionados, mejor explicados."

- **Sin promesas médicas**: nada de "cura", "elimina", "garantiza", "trata". Usa "ayuda a", "contribuye a".
- Cierra con una recomendación de consultar a un profesional cuando el tema lo amerite (piel con condición,
  suplementos, embarazo, medicamentos).
- Íntimo: natural, sin prejuicios, nunca explícito.
- No inventes estudios, cifras ni citas. Si das un dato, que sea de conocimiento general y prudente.
- Puedes mencionar productos del catálogo si existen y están publicados; no prometas resultados.

## SEO

- Título ≤ 60 caracteres con la búsqueda principal al inicio, pensada para Colombia
  ("protector solar para piel grasa", "cómo elegir lubricante a base de agua").
- 3 a 6 subtítulos `h` que respondan preguntas reales; 600 a 1.200 palabras.
- El primer párrafo responde la pregunta del título (los buscadores con IA citan respuestas directas).
- El texto termina en el CTA de asesoría (la plantilla ya lo agrega; no lo repitas).

## Cierre

`npm run build` (valida el JSON), revisa la página en `npm run dev` → `/blog/<slug>/`, confirma que aparece
en `dist/llms.txt` y `dist/sitemap.xml`. Muestra el texto completo al usuario para que Diana lo apruebe antes
de publicar.
