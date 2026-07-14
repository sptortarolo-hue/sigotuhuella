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

## Scraper Facebook (Termux — Puppeteer + Stealth)

Scraper self-hosted que corre en un celular con Termux + X11. Usa Chromium real con `puppeteer-extra` + `puppeteer-extra-plugin-stealth` para evitar detección de bots.

### Cómo funciona

- Se ejecuta en Termux como daemon via pm2 (`pm2 start fb-scraper.js --name fb-scraper`)
- Abre Chromium real en X11, navega a cada grupo, extrae posts via DOM
- Session management: guarda/carga cookies de Termux y las sincroniza con el VPS como backup
- Login manual una vez via `FB_SCRAPER_HEADED=true node fb-scraper.js --login`
- Los posts se envían al webhook interno (`POST /api/facebook/webhook`) para clasificación AI y matching
- El VPS sirve las cookies via `GET /api/relay/fb/cookie-download?token=sihuella`

### Archivos

| Archivo | Descripción |
|---------|-------------|
| `fb-scraper.js` | Script principal (~450 líneas). Puppeteer + stealth, DOM extraction, session management, human scrolling |
| `fb-scraper-setup.sh` | Script de setup en Termux (instala deps, configura env) |
| `fb-relay.js` | Referencia: mismo patrón Puppeteer+stealth para publicar en grupos |

### Configuración

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SCRAPER_TOKEN` | `sihuella` | Token para auth con el webhook |
| `FB_SCRAPER_HEADED` | `false` | `true` para modo X11 visible (login/test), `false` para headless |
| `FB_SCRAPER_INTERVAL` | `4` | Horas entre scrapes |
| `FB_SCRAPER_MAX_POSTS` | `20` | Máximo de posts por grupo por scrape |
| `CHROMIUM_PATH` | auto-detect | Path al binario de Chromium |

### Session Restore Cascade

1. Intenta cargar cookies de Termux local (`~/.fb-cookies.json`)
2. Si no existen, descarga del VPS (`/api/relay/fb/cookie-download`)
3. Si el VPS tampoco tiene, necesita login manual via X11

### Costo

$0 — todo corre local en el celular. Sin servicios cloud.

### Referencia

| Comando | Descripción |
|---------|-------------|
| `FB_SCRAPER_HEADED=true node fb-scraper.js --login` | Login manual con X11 |
| `FB_SCRAPER_HEADED=true node fb-scraper.js --test` | Test scrape (un grupo, 3 posts) |
| `pm2 start fb-scraper.js --name fb-scraper` | Iniciar daemon |
| `pm2 logs fb-scraper` | Ver logs |
| `pm2 restart fb-scraper` | Reiniciar |

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
