# Manual de reglas de desarrollo - SiHuella

## Responsive Design Rules

Mobile-first approach usando Tailwind CSS v4 con breakpoints default.

## Breakpoints

| Prefijo | Min-width | Uso |
|---------|-----------|-----|
| *(ninguno)* | 0 | Mobile base |
| `sm:` | 640px | Tablets chicas |
| `md:` | 768px | Tablets grandes / landscape |
| `lg:` | 1024px | Desktop / laptop |
| `xl:` | 1280px | Pantallas anchas |
| `2xl:` | 1536px | Ultra wide |

## Reglas generales

### 1. Containers
```tsx
// Contenedor principal de página/sección
className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"

// Contenedor angosto (formularios, login, etc.)
className="max-w-md mx-auto px-4"
// o max-w-2xl, max-w-3xl, max-w-lg según el contenido
```

### 2. Grids

**Galeria / cards (3 cols desktop → 2 tablet → 1 mobile):**
```tsx
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
```

**Split de formulario / contenido (2 cols desktop → 1 mobile):**
```tsx
className="grid grid-cols-1 md:grid-cols-2 gap-8"
```

**Stats / tarjetas numericas (2 cols mobile → 4 desktop):**
```tsx
className="grid grid-cols-2 md:grid-cols-4 gap-4"
```

**Imagenes preview (2 cols mobile → 3 desktop):**
```tsx
className="grid grid-cols-2 sm:grid-cols-3 gap-3"
```

### 3. Tipografía responsive
```tsx
// Hero / titulos grandes
className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl"

// Subtitulos / secciones
className="text-2xl sm:text-3xl md:text-4xl"

// Texto de tarjetas
className="text-base sm:text-lg"

// Texto chico / badges
className="text-xs sm:text-sm"
```

### 4. Botones y CTAs
```tsx
// Boton primario
className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base"

// Grupo de botones (stack vertical mobile, horizontal desktop)
className="flex flex-col sm:flex-row gap-3"
```

### 5. Navegación

- **Desktop (md+):** Nav horizontal con items visibles + dropdown de usuario
- **Mobile (< md):** Menú hamburguesa con animación slide-down
- **Body scroll lock:** `document.body.style.overflow = 'hidden'` cuando el menú mobile está abierto
- **Cerrar menú:** Al hacer click en un link, cerrar el menú
- **User menu:** Dropdown con `position: absolute`, `right: 0`, click-outside detection

```tsx
// Ejemplo: mobile menu toggle
<button className="md:hidden" onClick={() => setIsOpen(!isOpen)} />
// Desktop nav
<div className="hidden md:flex items-center gap-4" />
```

### 6. Modales
```tsx
// Siempre centrados, con scroll interno
className="fixed inset-0 z-[60] flex items-center justify-center p-4"
// Overlay
className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
// Card del modal
className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col"
// Contenido scrolleable
className="p-6 sm:p-8 overflow-y-auto"
```

### 7. Tablas de datos (responsive)
```tsx
// Wrapper con scroll horizontal
<div className="overflow-x-auto rounded-2xl border border-brand-accent">
  <table className="w-full text-left min-w-max">
    ...
  </table>
</div>
```

### 8. Imágenes
```tsx
// Tarjetas
className="aspect-square object-cover"

// Hero / banners
className="w-full aspect-video sm:aspect-[3/1] object-cover"

// Galeria
className="aspect-square object-cover group-hover:scale-110 transition-transform duration-500"
```

### 9. Padding / margin de secciones
```tsx
// Seccion completa
className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8"

// Tarjetas / cards
className="p-5 sm:p-8"

// Icon containers
className="w-12 h-12 sm:w-14 sm:h-14"
```

### 10. Breakpoints en iconos y decoraciones
```tsx
// Icono de logo / marca
className="w-8 h-8 sm:w-10 sm:h-10"

// Badges
className="text-[10px] sm:text-xs"

// Esquinas redondeadas
className="rounded-xl sm:rounded-2xl"
```

### 11. Manejo de overflow
```tsx
// Texto largo en tarjetas
className="line-clamp-2"
className="line-clamp-3"

// Ubicaciones largas
className="break-words"

// Prevent icon shrink
className="shrink-0"

// Texto que no debe cortarse
className="whitespace-nowrap"
```

### 12. PWABanner
```tsx
className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96"
```

### 13. Accesibilidad
- NO usar `user-scalable=no` ni `maximum-scale=1.0` en viewport meta
- NO poner `overflow-hidden` en contenedores del body (excepto scroll lock del menú mobile)
- Textos con suficiente contraste, hover/active states en elementos interactivos

## Scraper Facebook (Termux — Puppeteer + Stealth + GraphQL)

Scraper self-hosted que corre en un celular con Termux + X11. Usa Chromium real con `puppeteer-extra` + `puppeteer-extra-plugin-stealth` para evitar detección de bots, con fallback a GraphQL API.

### Cómo funciona

- Se ejecuta en Termux como daemon via pm2 (`pm2 start fb-graphql-scraper.js --name fb-graphql-scraper`) o manual con flags
- Híbrido: primero intenta GraphQL (rápido, sin Chromium); si da 0 posts, usa Puppeteer DOM
- Session management: guarda cookies + `fb_dtsg` en `fb_scraper_profile/graphql-session.json`
- Login manual una vez via `node fb-graphql-scraper.js --login`
- Los posts se envían al webhook (`POST /api/facebook/webhook`) con imágenes en base64
- El servidor puede hacer fallback descargando desde `image_urls` si `image_buffers` está vacío

### Archivos

| Archivo | Descripción |
|---------|-------------|
| `fb-graphql-scraper.js` | Script principal. Hybrid GraphQL + Puppeteer DOM, session management, image download |
| `fb-relay.js` | Publicador: mismo patrón Puppeteer+stealth para publicar en grupos |
| `fb-pup-scraper.js` | Alternativa liviana: usa mbasic.facebook.com (HTML simplificado) |

### Configuración

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SCRAPER_TOKEN` | `sihuella` | Token para auth con el webhook |
| `FB_SCRAPER_HEADED` | `false` | `true` para modo X11 visible (login/test), `false` para headless |
| `FB_SCRAPER_INTERVAL` | `4` | Horas entre scrapes |
| `FB_SCRAPER_MAX_POSTS` | `20` | Máximo de posts por grupo por scrape |
| `CHROMIUM_PATH` | auto-detect | Path al binario de Chromium |
| `API_BASE_URL` | `https://sigotuhuella.online/api` | URL base del VPS |

### Session Restore Cascade

1. Intenta cargar cookies de `fb_scraper_profile/graphql-session.json`
2. Si no existen, descarga del VPS (`/api/relay/fb/cookie-download`)
3. Si el VPS tampoco tiene, necesita login manual via X11

### Referencia

| Comando | Descripción |
|---------|-------------|
| `node fb-graphql-scraper.js --login` | Login manual con X11 (headed) |
| `node fb-graphql-scraper.js --test` | Test scrape (primer grupo, 5 posts via DOM) |
| `node fb-graphql-scraper.js --debug-page` | Diagnóstico: screenshot + dump del DOM del feed |
| `pm2 start fb-graphql-scraper.js --name fb-graphql-scraper` | Iniciar daemon |
| `pm2 logs fb-graphql-scraper` | Ver logs |
| `pm2 restart fb-graphql-scraper` | Reiniciar |

### Troubleshooting: imágenes no se muestran en UI

1. Verificar que `image_data` tenga datos en la DB:
   ```sql
   SELECT fb_post_id, image_data IS NOT NULL as has_image, octet_length(image_data) as bytes
   FROM facebook_posts ORDER BY scraped_at DESC LIMIT 10;
   ```
2. Si `has_image = false`, el scraper no envió `image_buffers`. El webhook intenta descargar desde `image_urls` como fallback.
3. Verificar logs del webhook en VPS: `journalctl -u sihuella | grep -i "webhook\|image_buffers\|descargar"`
4. Usar `--debug-page` para diagnosticar la estructura del feed de Facebook.

## PostgreSQL (VPS)

- **Host:** localhost:5432
- **DB:** sigotuhuella
- **User:** sigotuhuella
- **Password:** javier040484
- **Persistent file:** `/root/.sihuella-db.env` (nunca se sobrescribe en deploy)
- La `DATABASE_URL` se restaura desde ese archivo al final del deploy

## Port 3000 conflict

El VPS tiene un server viejo en `/opt/sihuella/server/index.js` (scraper) que ocupaba el puerto 3000. El deploy ahora lo mata y lo elimina de PM2. Si el scraper vuelve a aparecer:

```bash
pm2 delete sihuella
kill -9 $(lsof -ti :3000)
```

## Checklist al agregar una nueva página/componente

- [ ] Mobile first: ¿se ve bien en 375px de ancho?
- [ ] Tablet: ¿se ve bien en 768px?
- [ ] Desktop: ¿se ve bien en 1280px?
- [ ] Grid: ¿cambia de columnas en los breakpoints correctos?
- [ ] Tipografía: ¿los tamaños escalan con sm/md/lg?
- [ ] Botones: ¿son full-width en mobile y auto en desktop?
- [ ] Imágenes: ¿tienen `object-cover` y aspect ratio definido?
- [ ] No hay scroll horizontal no deseado
- [ ] Sin `user-scalable=no` en el viewport
- [ ] Padding/margin laterales: usar `px-4 sm:px-6 lg:px-8`
