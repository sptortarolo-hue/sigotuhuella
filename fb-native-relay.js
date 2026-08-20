/**
 * fb-native-relay.js  —  Relay nativo de Facebook para AutoJs6
 *
 * Replica/comparte un post (action='share') en grupos vía la app NATIVA de
 * Facebook usando el accessibility service de AutoJs6. Corre 100% on-device,
 * sin ADB ni PC. Pollea la misma cola del VPS que usa fb-relay.js.
 *
 * Flujo (cuenta de page business): abre el post, toca Compartir → "Grupo"
 * (con scroll horizontal si el botón está oculto en la fila de destinos),
 * marca el checkbox de cada grupo del batch, toca "Siguiente" → "Publicar"
 * una sola vez. Todos los grupos del mismo post se publican en una pasada.
 *
 * ─── Setup ───────────────────────────────────────────────────────────────
 * 1. Instalar AutoJs6 (https://github.com/SuperMonster003/AutoJs6 releases)
 * 2. Activar su accessibility service (Ajustes > Accesibilidad)
 * 3. Loguear la app de Facebook con la cuenta target
 * 4. Configurar CONFIG.apiBase y CONFIG.token
 * 5. Ejecutar este script (o programarlo con el scheduler de AutoJs6)
 * ─────────────────────────────────────────────────────────────────────────
 */

auto.waitFor();

var CONFIG = {
  // Base del API del VPS (mismo que fb-relay.js). Sin barra final.
  apiBase: "https://sigotuhuella.com.ar/api/relay",
  // RELAY_TOKEN del server (.env del VPS)
  token: "wa-relay-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p",
  // Intervalo de polling cuando no hay tareas (ms)
  pollIntervalMs: 60 * 1000,
  // Delay al arrancar el script (ms): da tiempo a bloquear la pantalla a mano
  // antes de que arranque el primer batch (útil para probar el flujo 24/7).
  // En producción desatendida no molesta: solo agrega una espera única al
  // inicio; el scheduler de AutoJs6 lo sigue lanzando igual.
  startupDelayMs: 5000,
  // Delay entre grupos del MISMO post (ms) — compartir grupo a grupo con
  // variación humana (10-15s): son 7 grupos por post, no puede tardar minutos.
  minDelayMs: 10 * 1000,
  maxDelayMs: 15 * 1000,
  // Delay entre POSTS distintos (ms) — con variación (25-45s) para que el ritmo
  // entre publicaciones se vea más espaciado que entre grupos de un mismo post.
  betweenPostsMinDelayMs: 25 * 1000,
  betweenPostsMaxDelayMs: 45 * 1000,
  // Delay antes de auto-relanzar el script al salir del mainLoop (ms)
  restartDelayMs: 30 * 1000,
  // Package de la app nativa de Facebook
  fbPackage: "com.facebook.katana",
  // Cuánto esperar cada selector (ms)
  findTimeoutMs: 15000,
  // Desbloqueo automático de pantalla (24/7): PIN numérico del lock screen.
  // En vacío (""), desbloquea con swipe sin PIN (recomendado si el celular
  // puede vivir sin patrón). Para PIN, poner los dígitos en orden.
  enableAutoUnlock: true,
  screenPin: "",
  // Mantener la pantalla encendida mientras el celular está cargando, usando
  // Shizuku ("svc power stayon usb" — comportamiento del "No dormir" del modo
  // desarrollador). FALSO: la pantalla se apaga y bloquea al terminar cada
  // post (screenOffAndLock) y se despierta a demanda cuando llega una tarea,
  // evitando burn-in AMOLED y LEDs de noche.
  stayAwakeWhileCharging: false,
  // Patrón del PIN: dónde buscar cada dígito en el keypad del lock screen.
  // Samsung OneUI suele exponer los números como text()/desc(). Con pinPattern
  // vacío se busca el dígito como texto; si no aparece, usar sendDebug para
  // inspeccionar y ajustar.
  pinDigitsLabels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
};

var API_BASE = CONFIG.apiBase;
var TOKEN = CONFIG.token;

// ─── Log a archivo ─────────────────────────────────────────────────────────
// La consola flotante de AutoJs6 se oculta al bloquear la pantalla, y si
// Android pausa/mata el proceso de AutoJs6 en background, los console.log se
// pierden. Escribir también a /sdcard/fb-native-relay.log (rota a .log.1 al
// pasar de 500KB) para poder diagnosticar el relay aunque la consola no
// muestre nada.
var LOG_FILE = (function () {
  try { return files.join(files.getSdcardPath(), "fb-native-relay.log"); }
  catch (e) { return files.join(files.cwd(), "fb-native-relay.log"); }
})();
function logToFile(msg) {
  try {
    var f = LOG_FILE;
    try {
      if (files.exists(f) && files.getLength(f) > 500 * 1024) {
        try { files.rename(f, f + ".1"); } catch (e) {}
      }
    } catch (e2) {}
    var line = new Date().toISOString().substring(11, 23) + " " + msg + "\n";
    files.append(f, line);
  } catch (e) {}
}

// log(msg): escribe a console.log (si visible) Y a archivo.
// Úsalo en lugar de console.log para que el log persista aunque la consola
// flote se oculte al bloquear la pantalla.
function log(msg) {
  try { console.log(msg); } catch (e) {}
  try { logToFile(String(msg)); } catch (e) {}
}

// logError(msg): igual que log pero prefix ERR para filtrar.
function logError(msg) {
  try { console.error(msg); } catch (e) {}
  try { logToFile("ERR " + String(msg)); } catch (e) {}
}

// ─── Helpers HTTP ─────────────────────────────────────────────────────────

function apiGet(path) {
  var res = null;
  try {
    res = http.get(API_BASE + path, {
      headers: { Authorization: "Bearer " + TOKEN, Connection: "close" },
      timeout: 30000,
    });
    if (res.statusCode === 200) return res.body.json();
    throw new Error("HTTP " + res.statusCode + " en " + path);
  } finally {
    try { if (res && res.body && res.body.close) res.body.close(); } catch (e) {}
  }
}

function apiPost(path, body) {
  var res = null;
  try {
    res = http.postJson(API_BASE + path, body, {
      headers: { Authorization: "Bearer " + TOKEN, Connection: "close" },
      timeout: 30000,
    });
    if (res.statusCode !== 200) throw new Error("HTTP " + res.statusCode + " en " + path);
    return res.body.json();
  } finally {
    try { if (res && res.body && res.body.close) res.body.close(); } catch (e) {}
  }
}

// ─── Helpers de UI (multi-fallback) ────────────────────────────────────────

function rnd(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Busca un nodo visible por texto/desc (exacto y por contenido), en ese orden.
// Incluye variantes case-insensitive (los rows de FB suelen mostrar el nombre
// con mayúscula inicial aunque se busque en minúscula).
function findNode(labels, timeoutMs) {
  var t = timeoutMs || CONFIG.findTimeoutMs;
  var candidates = [];
  for (var i = 0; i < labels.length; i++) {
    var lab = labels[i];
    candidates.push(text(lab));
    candidates.push(desc(lab));
    candidates.push(descContains(lab));
    candidates.push(textContains(lab));
    candidates.push(descContains(lab.toLowerCase()));
    candidates.push(textContains(lab.toLowerCase()));
    candidates.push(descContains(capitalize(lab)));
    candidates.push(textContains(capitalize(lab)));
  }
  // OJO: findOne(timeout) bloquea hasta el timeout si no encuentra. Con 8
  // selectores por label × N labels, probarlos todos en serie puede tardar
  // MINUTOS (48 × 2s = ~96s para 6 labels). Acá rotamos con findOne corto
  // (300ms) dentro de la ventana total: tiempo acotado a timeoutMs y respuesta
  // rápida cuando aparece.
  var deadline = Date.now() + t;
  var j = 0;
  while (Date.now() < deadline) {
    try {
      var node = candidates[j % candidates.length].findOne(300);
      if (node && node.visibleToUser()) return node;
    } catch (e) {}
    j++;
  }
  return null;
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Busca el primer nodo clickable visible debajo de un EditText (fallback
// posicional: el resultado del buscador aparece justo abajo del box).
// No filtra por clase: FB usa Compose/React Native, los rows pueden ser de
// cualquier tipo. Se toma el primer nodo visible con texto/desc debajo del box
// y se clickea su ancestro clickable.
function clickResultBelowEditText(timeoutMs) {
  var deadline = Date.now() + (timeoutMs || CONFIG.findTimeoutMs);
  while (Date.now() < deadline) {
    try {
      var edit = className("android.widget.EditText").findOne(1500);
      if (edit && edit.visibleToUser()) {
        var eb = edit.bounds();
        var belowY = eb.bottom + 1;
        // Nodos con texto visible debajo del box
        var withText = textMatches(/.*/).find();
        var best = null;
        for (var i = 0; i < withText.length; i++) {
          var n = withText[i];
          try {
            if (!n.visibleToUser()) continue;
            var b = n.bounds();
            if (b.top < belowY) continue;
            var txt = n.text() || "";
            if (!txt.trim()) continue;
            // elegir el primero debajo del box (el resultado de la búsqueda)
            best = n;
            break;
          } catch (e) {}
        }
        if (best) return best;
      }
    } catch (e) {}
    sleep(400);
  }
  return null;
}

// Busca el row de un grupo en la pantalla de selección múltiple (cuenta
// business): el row está DEBAJO del EditText del buscador (el EditText contiene
// el texto recién tipeado, así que findNode por texto devolvería el box, no el
// resultado). Prioriza el nodo cuyo texto EQUALS el nombre (case-insensitive);
// si no, el primer row que lo contiene. Descarta los nodos contador del tipo
// "N resultado para \"...\"" (matchean el nombre por substring pero NO son el
// row). Devuelve el nodo del row o null.
function isCounterNode(txt) {
  var t = (txt || "").toLowerCase();
  return /resultado.*para|result.*for|resultad/.test(t);
}

function findGroupRowBelowEditText(searchName, timeoutMs) {
  var deadline = Date.now() + (timeoutMs || CONFIG.findTimeoutMs);
  var nameLower = (searchName || "").toLowerCase();
  while (Date.now() < deadline) {
    try {
      var edit = className("android.widget.EditText").findOne(1500);
      if (edit && edit.visibleToUser()) {
        var eb = edit.bounds();
        var belowY = eb.bottom + 1;
        var withText = textMatches(/.*/).find();
        var best = null;
        var exact = null;
        for (var i = 0; i < withText.length; i++) {
          var n = withText[i];
          try {
            if (!n.visibleToUser()) continue;
            var b = n.bounds();
            if (b.top < belowY) continue;
            var txt = (n.text() || "").trim();
            if (!txt) continue;
            if (isCounterNode(txt)) continue; // "1 resultado para..." no es el row
            var tl = txt.toLowerCase();
            if (nameLower && tl === nameLower) {
              if (!exact) exact = n; // match exacto gana
              continue;
            }
            if (!best) best = n;
          } catch (e) {}
        }
        if (exact) return exact;
        // Sin match exacto: el que contiene el nombre (primero) o el primer row
        for (var k = 0; k < withText.length; k++) {
          var nk = withText[k];
          try {
            if (!nk.visibleToUser()) continue;
            var bk = nk.bounds();
            if (bk.top < belowY) continue;
            var tk = (nk.text() || "").trim();
            if (!tk) continue;
            if (isCounterNode(tk)) continue;
            if (nameLower && tk.toLowerCase().indexOf(nameLower) >= 0) return nk;
          } catch (e) {}
        }
        if (best) return best;
      }
    } catch (e) {}
    sleep(400);
  }
  return null;
}

// Sube por la jerarquía hasta el primer nodo clickable (el "row" real de FB).
// Los TextView encontrados por texto no son el objetivo del tap: el contenedor
// padre clickable sí lo es.
function clickableAncestor(node) {
  var n = node;
  for (var i = 0; i < 6; i++) {
    try { if (n.clickable()) return n; } catch (e) {}
    try { n = n.parent(); } catch (e) { return null; }
    if (!n) return null;
  }
  return null;
}

function nodeCenter(node) {
  var b = node.bounds();
  return [Math.round(b.centerX()), Math.round(b.centerY())];
}

function screenWidth() {
  try { return device.width; } catch (e) {}
  return 1080;
}

function screenHeight() {
  try { return device.height; } catch (e) {}
  return 2340;
}

// La ventana flotante de la consola intercepta los taps en la zona que cubre.
// Se achica y se mueve a una esquina para no bloquear los clicks sobre la app.
function parkConsole() {
  try {
    console.setSize(220, 120);
    console.setPosition(screenWidth() - 230, 60);
  } catch (e) {}
}

// Punto dentro del nodo por fracción (x e y en 0..1), clampado a la pantalla.
// Con fracY ~0.3 se clickea la parte visible de rows cortados en el borde.
function nodePoint(node, fracX, fracY) {
  var b = node.bounds();
  var x = Math.round(b.left + b.width() * (fracX || 0.5));
  var y = Math.round(b.top + b.height() * (fracY || 0.5));
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > screenWidth() - 1) x = screenWidth() - 1;
  if (y > screenHeight() - 1) y = screenHeight() - 1;
  return [x, y];
}

// Click "en capas": distintas estrategias de tap para los views custom de FB.
// Cada una devuelve true tras DESPACHAR el gesto (el caller verifica si navegó).
//  0: click simple en centro del nodo
//  1: click en centro del ancestro clickable (el row real)
//  2: press con duración (tap más parecido al dedo real)
//  3: doble tap (los selectores de destino de FB lo requieren)
//  4: ACTION_CLICK nativo
//  5: click en la parte superior del row (rows cortados en el borde inferior)
//  6: click sobre el icono (izquierda del row, donde están las "3 personas")
function tapStrategy(node, idx) {
  try {
    if (idx === 0) {
      var c = nodePoint(node, 0.5, 0.5);
      click(c[0], c[1]);
      return true;
    }
    if (idx === 1) {
      var anc = clickableAncestor(node);
      if (!anc) return false;
      var ac = nodePoint(anc, 0.5, 0.5);
      click(ac[0], ac[1]);
      return true;
    }
    if (idx === 2) {
      var p = nodePoint(node, 0.5, 0.5);
      press(p[0], p[1], 120);
      return true;
    }
    if (idx === 3) {
      var d = nodePoint(node, 0.5, 0.5);
      click(d[0], d[1]);
      sleep(250);
      click(d[0], d[1]);
      return true;
    }
    if (idx === 4) {
      node.click();
      return true;
    }
    if (idx === 5) {
      var up = nodePoint(node, 0.5, 0.3);
      click(up[0], up[1]);
      return true;
    }
    if (idx === 6) {
      var icon = nodePoint(node, 0.2, 0.5);
      click(icon[0], icon[1]);
      return true;
    }
    if (idx === 7) {
      try { node.scrollIntoView(); } catch (e) {}
      sleep(800);
      var sv = nodePoint(node, 0.5, 0.5);
      click(sv[0], sv[1]);
      return true;
    }
    if (idx === 8) {
      // Franja superior visible del row (rows cortados por la barra de gestos)
      var top = nodePoint(node, 0.5, 0.1);
      click(top[0], top[1]);
      return true;
    }
  } catch (e) {}
  return false;
}

// Click en un nodo por texto/desc con reintentos cortos. Si scrollIntoView está
// activo y el nodo no es visible (p.ej. el botón Compartir de un post largo está
// debajo del pliegue), hace scroll gestual hacia abajo hasta encontrarlo.
function clickLabel(labels, timeoutMs, scrollIntoView) {
  var deadline = Date.now() + (timeoutMs || CONFIG.findTimeoutMs);
  var logged = false;
  var scrolls = 0;
  var lastScrollAt = 0;
  var maxScrolls = 8;
  while (Date.now() < deadline) {
    var node = findNode(labels, 2000);
    if (node) {
      try {
        if (scrollIntoView) node.scrollForward();
        if (tapStrategy(node, 0)) return true;
      } catch (e) {}
    } else if (scrollIntoView && scrolls < maxScrolls && Date.now() - lastScrollAt > 1500) {
      // El nodo no está en el árbol visible → el contenido es largo y el botón
      // está más abajo. Swipe hacia arriba (scroll down) con gesto humano y
      // seguir buscando. Se repite hasta maxScrolls o el timeout.
      try {
        scrollDownOnce();
        scrolls++;
        lastScrollAt = Date.now();
        console.log("[native] scroll " + scrolls + "/" + maxScrolls + " buscando '" + labels[0] + "'...");
      } catch (e2) {}
    }
    if (!logged && Date.now() - deadline > -8000) {
      // log una sola vez si pasa ~7s sin encontrar el label
      console.log("[native] buscando '" + labels[0] + "' sin éxito aún (" + labels.length + " variantes)...");
      logged = true;
    }
    sleep(500);
  }
  return false;
}

// Scroll gestual hacia abajo (swipe de abajo hacia arriba), como un humano.
// Usa Shizuku si está disponible (más fiable sobre el árbol de FB nativo).
function scrollDownOnce() {
  var h = screenHeight();
  var w = screenWidth();
  var x = Math.round(w / 2);
  var y1 = Math.round(h * 0.75);
  var y2 = Math.round(h * 0.25);
  try {
    if (shizukuAvailable()) {
      shizukuCmd("input swipe " + x + " " + y1 + " " + x + " " + y2 + " 400");
    } else {
      swipe(x, y1, x, y2, 400);
    }
  } catch (e) {}
  sleep(800);
}

// Scroll gestual HORIZONTAL de la fila de destinos del composer (cuenta de page
// business: el botón "Grupo" queda oculto en un bloque de botones que se
// desplaza de lado). Desliza derecha→izquierda sobre la zona donde vive la fila:
// justo arriba del EditText del mensaje, o al 40% de la altura si no hay box.
function scrollComposerRowOnce() {
  var h = screenHeight();
  var w = screenWidth();
  var y = Math.round(h * 0.4);
  try {
    var edit = className("android.widget.EditText").findOne(800);
    if (edit && edit.visibleToUser()) {
      var eb = edit.bounds();
      y = Math.max(60, eb.top - Math.round((eb.height() || 80) * 1.2));
    }
  } catch (e) {}
  var y1 = Math.max(40, y - 40);
  var y2 = Math.min(h - 40, y + 40);
  var x1 = Math.round(w * 0.82);
  var x2 = Math.round(w * 0.18);
  try {
    if (shizukuAvailable()) {
      shizukuCmd("input swipe " + x1 + " " + y1 + " " + x2 + " " + y2 + " 400");
    } else {
      swipe(x1, y1, x2, y2, 400);
    }
  } catch (e) {}
  sleep(800);
}

// Escribe texto en el campo EditText visible (setText directo).
function typeIntoEditText(textVal, timeoutMs) {
  var t = timeoutMs || CONFIG.findTimeoutMs;
  var deadline = Date.now() + t;
  while (Date.now() < deadline) {
    var edit = className("android.widget.EditText").findOne(2000);
    if (edit && edit.visibleToUser()) {
      try {
        edit.click();
        sleep(400);
        edit.setText(textVal);
        return true;
      } catch (e) {}
    }
    sleep(500);
  }
  return false;
}

// Espera a que el EditText contenga el texto (verificación post-setText).
function waitEditTextHas(textVal, timeoutMs) {
  var deadline = Date.now() + (timeoutMs || 8000);
  while (Date.now() < deadline) {
    var edit = className("android.widget.EditText").findOne(1000);
    if (edit && (edit.text() || "").indexOf(textVal) >= 0) return true;
    sleep(500);
  }
  return false;
}

// Cierra el teclado virtual usando varias estrategias. Solo envía back() si el
// EditText sigue enfocado (teclado abierto); si ya está cerrado, back() cerraría
// el sheet de selección y rompería el flujo. Devuelve true si cree que cerró.
function hideKeyboard() {
  try {
    var edit = className("android.widget.EditText").findOne(800);
    var focused = !!(edit && edit.visibleToUser() && edit.isFocused());
    if (!focused) return false; // sin foco → sin teclado → no tocar nada
  } catch (e) {}
  try {
    // 1) API IME de AutoJs6
    if (input && input.ime) {
      if (typeof input.ime.hide === "function") {
        input.ime.hide();
        sleep(400);
        return true;
      }
      if (typeof input.ime.isOpen === "function" && input.ime.isOpen()) {
        if (typeof input.ime.close === "function") input.ime.close();
        sleep(400);
        return true;
      }
    }
  } catch (e) {}
  try {
    // 2) back() nativo (solo llegamos acá si había foco = teclado abierto)
    back();
    sleep(500);
    return true;
  } catch (e) {}
  try {
    // 3) Shizuku: inyectar KEYCODE_BACK (4) directo, no depende del árbol
    if (shizukuAvailable()) {
      shizukuCmd("input keyevent 4");
      sleep(500);
      return true;
    }
  } catch (e) {}
  return false;
}

// Borra el texto del buscador de grupos para que reaparezca la lista completa
// y el botón "Siguiente" (con texto escrito, FB no muestra el botón). Si el
// teclado virtual queda abierto tapando el botón, lo cierra.
function clearGroupSearchText(timeoutMs) {
  var t = timeoutMs || CONFIG.findTimeoutMs;
  var deadline = Date.now() + t;
  while (Date.now() < deadline) {
    try {
      var edit = className("android.widget.EditText").findOne(1500);
      if (edit && edit.visibleToUser()) {
        edit.setText("");
        sleep(500);
        var edit2 = className("android.widget.EditText").findOne(1000);
        if (edit2 && (edit2.text() || "").trim() === "") {
          console.log("[native] buscador de grupos limpiado");
          break;
        }
      }
    } catch (e) {}
    sleep(500);
  }
  // Cerrar el teclado virtual si quedó abierto (queda tapando "Siguiente").
  hideKeyboard();
  console.log("[native] teclado cerrado");
  sleep(rnd(600, 1000));
}

// ─── Checkpoint / sesión expirada ─────────────────────────────────────────

var CHECKPOINT_MARKS = [
  "Confirmá tu identidad", "Verify your identity", "confirm your identity",
  "Account Temporarily Locked", "Cuenta bloqueada temporalmente",
  "Security Check", "Verificación de seguridad", "Checkpoint",
  "Sesión", "session has expired", "sesión expirada", "Log in", "Iniciar sesión",
  "Enter the code", "Ingresá el código",
];

function checkCheckpoint() {
  for (var i = 0; i < CHECKPOINT_MARKS.length; i++) {
    var hit = textContains(CHECKPOINT_MARKS[i]).findOne(800);
    if (hit) return CHECKPOINT_MARKS[i];
  }
  return null;
}

// Dump del árbol de accesibilidad visible (text + content-desc) para debug.
function dumpUi(maxNodes) {
  var out = [];
  var cap = maxNodes || 60;
  try {
    var withText = textMatches(/.*/).find();
    for (var i = 0; i < withText.length && out.length < cap; i++) {
      var n = withText[i];
      var txt = "";
      try { txt = n.text() || ""; } catch (e) {}
      if (txt && txt.trim()) out.push({ t: txt, d: "", b: nodeBoundsStr(n) });
    }
    var withDesc = descMatches(/.*/).find();
    for (var j = 0; j < withDesc.length && out.length < cap; j++) {
      var m = withDesc[j];
      var d = "";
      try { d = m.desc() || ""; } catch (e) {}
      if (d && d.trim()) out.push({ t: "", d: d, b: nodeBoundsStr(m) });
    }
  } catch (e) {
    out.push({ t: "dumpUi error: " + e.message, d: "" });
  }
  return out;
}

function nodeBoundsStr(node) {
  try {
    var b = node.bounds();
    return "(" + b.left + "," + b.top + " " + b.width() + "x" + b.height() + ")";
  } catch (e) {
    return "(?)";
  }
}

// ─── Debug (screenshot + dump a /fb-debug) ────────────────────────────────

function sendDebug(label, url) {
  try {
    // Mostrar la consola al diagnosticar: si está oculta (tras screenOffAndLock)
    // el dump no se vería en el celular.
    try { console.show(); } catch (eC) {}
    var payload = {
      label: "native:" + label,
      url: url || "",
      timestamp: new Date().toISOString(),
      uiNodes: dumpUi(80),
    };
    // Log del dump en consola para verlo sin depender del server
    console.log("=== DUMP " + label + " (" + payload.uiNodes.length + " nodos) ===");
    for (var i = 0; i < payload.uiNodes.length; i++) {
      var n = payload.uiNodes[i];
      console.log("  [" + (n.t || "-") + "] | desc: " + (n.d || "-") + " | b: " + (n.b || "?"));
    }
    // Captura de pantalla. NO usar images.captureScreen() salvo que la captura
    // ya esté autorizada: si no, Android abre el diálogo MediaProjection
    // "¿Compartir tu pantalla?" que queda tapando la UI y cuelga el flujo.
    // Con Shizuku se captura por ADB (screencap) sin diálogos.
    try {
      var img = null;
      if (shizukuAvailable()) {
        var shotPath = files.join(files.getSdcardPath() || "/sdcard", "fb-relay-shot.png");
        var sr = shizukuCmd("screencap -p " + shotPath);
        if (sr && sr.code === 0 && files.exists(shotPath)) {
          img = images.read(shotPath);
          files.remove(shotPath);
        }
      }
      if (!img) {
        try { img = images.captureScreen(); } catch (e3) {}
      }
      if (img) {
        payload.screenshot = images.toBase64(img, "png", 70);
        img.recycle();
      }
    } catch (e2) {
      payload.screenshotError = e2.message;
    }
    apiPost("/fb-debug", payload);
    console.log("[native] debug enviado: " + label);
  } catch (e) {
    console.log("[native] debug falló: " + e.message);
  }
}

// ─── Lock ─────────────────────────────────────────────────────────────────

function getLockPath() {
  try {
    var sdcard = files.getSdcardPath();
    if (sdcard) return files.join(sdcard, "fb-native-relay.lock");
  } catch (e) {}
  return files.join(files.cwd(), "fb-native-relay.lock");
}

function acquireLock() {
  try {
    var lockFile = getLockPath();
    if (files.exists(lockFile)) {
      var ts = parseInt(files.read(lockFile), 10);
      var stale = Date.now() - (isNaN(ts) ? 0 : ts);
      if (stale < 5 * 60 * 1000) return false;
    }
    files.createWithDirs(lockFile);
    files.write(lockFile, String(Date.now()));
    return true;
  } catch (e) {
    console.error("[native] lock falló (continúo sin lock): " + e.message);
    return true;
  }
}

function releaseLock() {
  try { files.remove(getLockPath()); } catch (e) {}
}

// El lock lo renueva el LOOP PRINCIPAL (markLoopHeartbeat), NO un thread ciego.
// Antes startHeartbeat() renovaba el timestamp del lock cada 60s sin importar si
// el loop estaba vivo: si el loop se colgaba, la zombie seguía renovando el lock
// y el watchdog relanzaba el script pero la instancia nueva no podía tomarlo
// ("lock ocupado") → el relay quedaba muerto para siempre. Ahora si el loop se
// cuelga, el lock expira solo en 5 min (stale de acquireLock) y una instancia
// nueva puede tomarlo.

// Watchdog del loop principal: si el loop no actualiza el heartbeat por más de
// WATCHDOG_STALE_MS, se relanza este mismo script con engines.execScriptFile
// para que el relay nunca quede caído tras un cuelgue/excepción interna.
var watchdogThread = null;
var WATCHDOG_STALE_MS = 6 * 60 * 1000; // 6 min sin heartbeat del loop
var lastLoopHeartbeat = Date.now();

function markLoopHeartbeat() {
  lastLoopHeartbeat = Date.now();
  // Renovar el lock: refleja que el loop está VIVO, no solo que el proceso
  // existe. Si el loop se cuelga, el lock deja de renovarse y queda stale.
  try {
    files.write(getLockPath(), String(Date.now()));
  } catch (e) {}
}

function startWatchdog() {
  try {
    watchdogThread = threads.start(function () {
      while (true) {
        sleep(60 * 1000);
        var stale = Date.now() - lastLoopHeartbeat;
        if (stale > WATCHDOG_STALE_MS) {
          console.error("[native] watchdog: loop sin heartbeat " + Math.round(stale / 1000) + "s, relanzando script");
          // Liberar el lock ANTES de relanzar: la instancia nueva debe poder
          // tomarlo. Si no, el lock stale (5 min) bloquearía el relanzamiento.
          releaseLock();
          stopHeartbeatThread();
          cancelScreenAwake();
          try {
            var scriptPath = files.join(files.cwd(), "fb-native-relay.js");
            if (files.exists(scriptPath)) {
              engines.execScriptFile(scriptPath);
            } else {
              console.error("[native] watchdog: no encuentro fb-native-relay.js en " + files.cwd());
            }
          } catch (e) {
            console.error("[native] watchdog relanzamiento falló: " + e.message);
          }
          sleep(3000);
          exit();
        }
      }
    });
  } catch (e) {
    console.log("[native] watchdog no disponible: " + e.message);
  }
}

function stopWatchdog() {
  try { if (watchdogThread) watchdogThread.interrupt(); } catch (e) {}
}

// ─── Heartbeat al server ──────────────────────────────────────────────────
// POST periódico a /fb-debug con estado del relay para ver en el panel admin
// si el celular está vivo (último heartbeat), sin necesidad de tocarlo.

var heartbeatThread = null;
var HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function readBatteryLevel() {
  try { return device.getBattery(); } catch (e) { return null; }
}

function sendHeartbeat() {
  try {
    var state = {
      screenOn: false,
      locked: false,
      shizukuOk: false,
      battery: null,
      wakefulness: null,
    };
    try { state.screenOn = !!(device.isScreenOn && device.isScreenOn()); } catch (e) {}
    try { state.locked = isScreenLocked(); } catch (e) {}
    try { state.shizukuOk = shizukuAvailable(); } catch (e) {}
    try { state.battery = readBatteryLevel(); } catch (e) {}
    try { state.wakefulness = readWakefulness(); } catch (e) {}
    var payload = {
      label: "heartbeat",
      url: "",
      timestamp: new Date().toISOString(),
      heartbeat: state,
    };
    var res = apiPost("/fb-debug", payload);
    if (res && res.success) {
      console.log("[native] heartbeat enviado (screen=" + state.screenOn + ", locked=" + state.locked + ", shizuku=" + state.shizukuOk + ", wf=" + (state.wakefulness || "n/a") + ", bat=" + state.battery + ")");
    }
  } catch (e) {
    // Silencioso: un heartbeat fallido no debe romper el relay
  }
}

function startHeartbeatThread() {
  try {
    heartbeatThread = threads.start(function () {
      while (true) {
        sleep(HEARTBEAT_INTERVAL_MS);
        sendHeartbeat();
      }
    });
  } catch (e) {
    console.log("[native] heartbeat no disponible: " + e.message);
  }
}

function stopHeartbeatThread() {
  try { if (heartbeatThread) heartbeatThread.interrupt(); } catch (e) {}
}

// ¿Es OTRO engine distinto del mío? En AutoJs6 los objetos de engines.all()
// NO son idénticos a engines.myEngine() aunque representen el mismo engine:
// el === devuelve false incluso para sí mismo (esto hizo que una instancia se
// forceStoppe a sí misma y muriese sin liberar el lock). El identificador
// estable en AutoJs6 es la propiedad .id (ver issue #421: engine.id) o el
// método getId(). Solo confirmar "otro" cuando difieren; si no hay id
// disponible, NO matar (más vale una zombie viva que matar el engine propio).
function engineId(eng) {
  try {
    if (!eng) return null;
    if (eng.id !== undefined && eng.id !== null) return String(eng.id);
    if (typeof eng.getId === "function") return String(eng.getId());
    if (eng.getId !== undefined && eng.getId !== null) return String(eng.getId());
    return null;
  } catch (e) {
    return null;
  }
}

function isOtherEngine(candidate, me) {
  try {
    if (candidate === me) return false;
    var ic = engineId(candidate);
    var im = engineId(me);
    if (ic && im) return ic !== im;
    return false;
  } catch (e) {
    return false;
  }
}

// Detecta si hay otra instancia de este mismo script corriendo (más robusto
// que el lock de archivo, que no frenó los duplicados).
function otherInstanceRunning() {
  try {
    var all = engines.all();
    var me = engines.myEngine();
    var count = 0;
    for (var i = 0; i < all.length; i++) {
      try {
        if (!isOtherEngine(all[i], me)) continue; // soy yo o no distinguible
        var src = String(all[i].getSource());
        if (src.indexOf("fb-native-relay") >= 0) {
          count++;
        }
      } catch (e2) {}
    }
    return count > 0;
  } catch (e) {
    return false;
  }
}

// Mata las otras instancias de este script (zombies). Se llama DESPUÉS de
// adquirir el lock: quien tiene el lock es la autoridad y limpia duplicados.
function killOtherInstances() {
  try {
    var all = engines.all();
    var me = engines.myEngine();
    var killed = 0;
    for (var i = 0; i < all.length; i++) {
      try {
        if (!isOtherEngine(all[i], me)) continue; // no me mato a mí
        var src = String(all[i].getSource());
        if (src.indexOf("fb-native-relay") >= 0) {
          console.log("[native] matando instancia zombie/duplicada " + i);
          if (typeof all[i].forceStop === "function") all[i].forceStop();
          else if (typeof all[i].stop === "function") all[i].stop();
          killed++;
        }
      } catch (e2) {}
    }
    if (killed > 0) console.log("[native] " + killed + " instancia(s) previa(s) terminada(s)");
  } catch (e) {}
}

// ─── Abrir el post en la app nativa ───────────────────────────────────────

// Convierte una URL de post de FB en un deep link NATIVO (fb://...). Sin esto,
// am start con la URL https la abre en el navegador in-app de FB (pantalla
// blanca con flecha atrás) donde no hay botón Compartir accesible. El deep
// link abre la vista real del post con su menú.
// Formato válido en FB Android: fb://post/<post_id> (la URI fb://story?... NO
// existe; ver gist "List of accepted fb:// URIs in Android Facebook").
function fbDeepLinkFor(url) {
  var u = String(url || "");
  // Post de página: /{pageId}/posts/{postId} o /{pageId}/post/{postId}.
  // El postId puede venir como {pageId}_{postId} (formato del Graph API
  // data.id); usar la parte real del post, no el prefijo de página.
  var m = u.match(/facebook\.com\/[^\/]+\/(?:posts|post)\/(\d+)(?:_(\d+))?/);
  if (m) return "fb://post/" + (m[2] || m[1]);
  // Post de grupo: /groups/{gid}/posts/{pid} → permalink del post en el grupo
  var mg = u.match(/facebook\.com\/groups\/(\d+)\/posts\/(\d+)/);
  if (mg) return "fb://group/" + mg[1] + "/permalink/" + mg[2];
  // permalink.php?story_fbid={postId}&id={pageId} → fb://post/<postId>
  var mper = u.match(/(?:story_fbid|story_id)=(\d+)/);
  if (mper) return "fb://post/" + mper[1];
  // Foto de página
  var mph = u.match(/facebook\.com\/([^\/]+)\/photos\/(\d+)/);
  if (mph) return "fb://photo/" + mph[2];
  // share/p/<code>: resolver la redirección → URL canónica → deep link
  if (u.indexOf("/share/p/") >= 0) {
    var resolved = resolveRedirect(u);
    if (resolved && resolved !== u) return fbDeepLinkFor(resolved);
  }
  return null;
}

// Sigue la redirección HTTP de un shortlink de FB y devuelve la URL final.
// (maxRedirects 0 → okhttp no sigue; leemos el request/headers finales).
function resolveRedirect(url) {
  try {
    var resp = http.get(url, { maxRedirects: 0, timeout: 15000 });
    try {
      var req = resp.request;
      var final = String(req.url ? req.url() : "");
      if (final && final !== url) return final;
    } catch (e) {}
    try {
      var h = resp.headers;
      var loc = h && (typeof h.get === "function" ? h.get("location") : (h["Location"] || h["location"]));
      if (loc) return String(loc);
    } catch (e2) {}
  } catch (e) {}
  return url;
}

function openPostInFB(target) {
  // Shizuku es OBLIGATORIO para el deep link: sin "am start" vía ADB, abrir FB
  // con app.intent/app.openUrl deja la app en el home sin navegar al post (el
  // share buscaría "Compartir" en el feed). Frenar claro en vez de fallar raro.
  if (!shizukuAvailable()) {
    throw new Error("Shizuku no disponible: no se puede navegar al post (FB quedaría en home)");
  }
  console.log("[native] abriendo post: " + target);

  // Con Shizuku, "am start" con FLAG_ACTIVITY_TURN_SCREEN_ON (0x40000000)
  // enciende la pantalla de forma fiable (privilegios ADB). En autoJs6 el flag
  // "activity_turn_screen_on" del app.intent puede no estar en el enum, así que
  // acá el fallback directo por Shizuku es más seguro para el relay 24/7.
  try {
    var esc = String(target).replace(/"/g, "%22");
    var r = shizukuCmd("am start -a android.intent.action.VIEW -d \"" + esc + "\" -p com.facebook.katana -f 0x50000000");
    if (r && r.code === 0) {
      var deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        try {
          var cur = currentPackage();
          if (cur && cur.indexOf("com.facebook") >= 0) return;
        } catch (e2) {}
        sleep(500);
      }
      return;
    }
    throw new Error("am start falló: " + (r && r.output ? r.output : r));
  } catch (e) {
    if (e && String(e.message).indexOf("Shizuku no disponible") >= 0) throw e;
    throw new Error("openPostInFB falló: " + (e && e.message ? e.message : e));
  }
}

// ─── Flujo de share ───────────────────────────────────────────────────────

// Verifica que el box de búsqueda desapareció (navegó al composer del grupo).
function searchBoxGone(timeoutMs) {
  var deadline = Date.now() + (timeoutMs || 8000);
  while (Date.now() < deadline) {
    var edit = null;
    try { edit = className("android.widget.EditText").findOne(800); } catch (e) {}
    if (!edit) return true;
    sleep(500);
  }
  return false;
}

function openPostAndShareGroup(task) {
  var url = task.target_url;
  var groupName = task.group_name || task.fb_group_id;
  var t = CONFIG.findTimeoutMs;

  console.log("[native] compartiendo en: " + groupName);

  // 1) Desbloquear PRIMERO (enciende pantalla + descarta keyguard + PIN). Si se
  //    abre el post con la pantalla bloqueada, el deep link se consume y al
  //    desbloquear queda el home/feed activo en pantalla → el share buscaría
  //    "Compartir" en cualquier post del home. Con el celular desbloqueado ya,
  //    el deep link abre la vista real del post sobre el estado desbloqueado.
  // OJO: si el wake/unlock falla (Shizuku caído, AOD en estado raro), NO seguir
  // ciego: tirar SCREEN_UNLOCK_FAIL para que el poll loop deje las tareas
  // pendientes y reintente en el próximo ciclo (en vez de marcar failed).
  var unlockedOk = false;
  try {
    unlockedOk = ensureUnlocked();
  } catch (eUnlock) {
    console.error("[native] ensureUnlocked lanzó excepción: " + eUnlock.message);
  }
  if (!unlockedOk) {
    sendDebug("screen-unlock-fail", url);
    console.error("[native] pantalla no desbloqueable → tareas quedan pendientes (reintento en próximo poll)");
    throw new Error("SCREEN_UNLOCK_FAIL: pantalla no desbloqueable");
  }
  // El desbloqueo dispara una reconexión del árbol de accesibilidad de AutoJs6;
  // el sleep que sigue puede lanzar ScriptInterruptedException y si se propaga
  // con isEngineStopped()==true (falso positivo transitorio) el script se sale
  // sin hacer nada. Tratar esa interrupción como transitoria y seguir.
  try {
    sleep(rnd(1500, 2500));
  } catch (ePostUnlock) {
    if (isInterrupted(ePostUnlock)) {
      console.log("[native] interrupción transitoria tras desbloqueo, continuando");
      sleep(rnd(1500, 2500));
    } else {
      throw ePostUnlock;
    }
  }

  // 2) Estrategias de apertura del post. La URL https canónica es la #1: FB la
  //    resuelve como app link y abre la vista NATIVA del post (probado). El
  //    deep link fb://post es fallback (no resuelve algunos posts de página y
  //    vuelve al home). Tras cada apertura se verifica que el botón Compartir
  //    exista; si no, force-stop y siguiente estrategia.
  var strategies = [];
  if (url) strategies.push(url);
  var dl = null;
  try { dl = fbDeepLinkFor(url); } catch (e) {}
  if (dl && dl !== url) strategies.push(dl);

  var shareLabels = ["Compartir", "Share", "Compartir publicación", "Compartir esta publicación", "Share post", "Share this post"];
  var moreLabels = ["Más opciones", "More options", "Ver más", "See more", "Más"];

  var ok = false;
  for (var si = 0; si < strategies.length && !ok; si++) {
    if (si > 0) {
      // FB quedó en estado incierto (home/webview) → arrancar limpio
      console.log("[native] estrategia " + (si + 1) + "/" + strategies.length + ": arrancando FB limpio");
      try {
        if (shizukuAvailable()) shizukuCmd("am force-stop com.facebook.katana");
      } catch (e9) {}
      sleep(rnd(4000, 6000));
    }

    try {
      openPostInFB(strategies[si]);
    } catch (eOpen) {
      console.error("[native] no se pudo abrir (estr " + (si + 1) + "): " + eOpen.message);
      continue;
    }
    sleep(rnd(4000, 7000));

    // Diagnóstico: qué app quedó en primer plano tras el desbloqueo. Si FB no
    // está, el share no puede arrancar y hay que ver qué pantalla quedó.
    try {
      var curPkg = currentPackage();
      console.log("[native] tras desbloqueo, app en primer plano: " + curPkg);
      if (!curPkg || curPkg.indexOf("com.facebook") < 0) {
        console.log("[native] FB NO está en primer plano. Dump del árbol:");
        var dn = dumpUi(25);
        for (var di = 0; di < dn.length; di++) {
          console.log("[native]   [" + (dn[di].t || dn[di].d || "-") + "] | b: " + (dn[di].b || "-"));
        }
        sendDebug("post-unlock-not-fb", url);
        continue;
      }
    } catch (e) {
      console.log("[native] no se pudo leer la app en primer plano: " + e.message);
    }

    // Si hay checkpoint o sesión expirada → frenar
    var cp = checkCheckpoint();
    if (cp) throw new Error("checkpoint: " + cp);

    // Botón Compartir (icono en app nativa → content-desc)
    ok = clickLabel(shareLabels, Math.round(t * 0.8), true);
    if (!ok) {
      // Fallback: menú "..." del post → "Compartir"
      if (clickLabel(moreLabels, 6000, true)) {
        sleep(rnd(1500, 2500));
        ok = clickLabel(shareLabels, 8000, false);
      }
    }
    if (!ok) console.error("[native] estrategia " + (si + 1) + " sin botón Compartir, probando siguiente...");
  }

  if (!ok) {
    sendDebug("no-share-btn", url);
    throw new Error("Compartir not found");
  }
  sleep(rnd(1500, 3000));

  // 4) En el modal del composer ya hay una fila de botones con scroll horizontal
  //    ("Grupo" entre ellos). Primero parkear la consola para que no intercepte
  //    los taps, y luego intentar el atajo DIRECTO: tocar el botón "Grupo".
  parkConsole();

  var groupLabels = ["Grupo", "En un grupo", "In a group", "Un grupo", "Compartir en un grupo", "Share to a group"];
  var searchOpened = false;
  for (var attempt = 0; attempt < 12 && !searchOpened; attempt++) {
    var target = findNode(groupLabels, 3000);
    if (target) {
      console.log("[native] tap directo 'Grupo' intento " + (attempt + 1) + " (estr " + attempt + ")");
      tapStrategy(target, attempt);
    } else {
      // Cuenta business: el botón "Grupo" está oculto en una fila con scroll
      // horizontal → deslizar el bloque para exponerlo antes de reintentar.
      scrollComposerRowOnce();
      console.log("[native] scroll horizontal de la fila de destinos (intento " + (attempt + 1) + ")");
    }
    sleep(rnd(2500, 3500));
    var edit = className("android.widget.EditText").findOne(1000);
    searchOpened = !!(edit && edit.visibleToUser());
  }

  // 5) Fallback: si el botón directo no abrió el buscador, ir por "Feed"
  //    (doble tap) → "En un grupo".
  if (!searchOpened) {
    console.log("[native] botón directo no navegó, probando ruta Feed → En un grupo");
    var destLabels = ["Feed", "Elige el destino de tu publicación", "Your Feed"];
    var destNode = findNode(destLabels, 8000);
    if (destNode && tapStrategy(destNode, 3)) {
      console.log("[native] selector de destino abierto (doble tap)");
      sleep(rnd(2000, 3000));
    } else {
      sendDebug("no-dest-selector", url);
      throw new Error("Dest selector not found");
    }

    // Expandir el sheet de destino con swipe hacia arriba
    try {
      swipe(screenWidth() / 2, screenHeight() * 0.7, screenWidth() / 2, screenHeight() * 0.25, 400);
      sleep(rnd(1500, 2500));
    } catch (e) {}

    var group2Labels = ["En un grupo", "In a group", "Un grupo", "Grupo", "Compartir en un grupo", "Share to a group"];
    for (var attempt2 = 0; attempt2 < 12 && !searchOpened; attempt2++) {
      var target2 = findNode(group2Labels, 3000);
      if (target2) {
        console.log("[native] tap 'En un grupo' intento " + (attempt2 + 1) + " (estr " + attempt2 + ")");
        tapStrategy(target2, attempt2);
      } else {
        scrollComposerRowOnce();
        console.log("[native] scroll horizontal de destinos (fallback, intento " + (attempt2 + 1) + ")");
      }
      sleep(rnd(2500, 3500));
      var edit2 = className("android.widget.EditText").findOne(1000);
      searchOpened = !!(edit2 && edit2.visibleToUser());
    }
  }

  if (!searchOpened) {
    sendDebug("no-share-to-group", url);
    throw new Error("Share to group not found");
  }
}

// Busca y publica en el grupo dentro del buscador YA abierto (reutilizado del
// grupo anterior en un batch multi-grupo). Borra el texto previo del box.
function searchGroupAndPublish(task) {
  var url = task.target_url;
  var groupName = task.group_name || task.fb_group_id;
  var message = task.message || "";
  var t = CONFIG.findTimeoutMs;

  console.log("[native] siguiente grupo: " + groupName);

  // 6) Buscar el grupo. Si el nombre de la DB viene inflado (p.ej. "grupo sigo
  //    tu huella" cuando el real es "sigo tu huella"), quitar prefijos comunes
  //    para buscar con el nombre correcto.
  var searchName = groupName;
  var prefixes = ["grupo ", "grupo  ", "group ", "grupo fb ", "pagina "];
  var trimmed = searchName;
  var changed = false;
  for (var pi = 0; pi < prefixes.length; pi++) {
    if (trimmed.toLowerCase().indexOf(prefixes[pi]) === 0) {
      trimmed = trimmed.substring(prefixes[pi].length).trim();
      changed = true;
      break;
    }
  }
  if (changed && trimmed) {
    searchName = trimmed;
    console.log("[native] nombre de grupo normalizado: '" + groupName + "' -> '" + searchName + "'");
  }

  // Buscar el row con el nombre normalizado. NO usar variantes/palabras clave:
  // tipear una palabra suelta puede devolver OTRO grupo que la contenga y
  // publicar en el grupo equivocado (más riesgoso que no encontrar el row).
  var ok = typeIntoEditText(searchName, t);
  if (!ok) {
    sendDebug("no-group-search", url);
    throw new Error("Group search input not found");
  }
  if (!waitEditTextHas(searchName, 8000)) {
    sendDebug("group-search-no-text", url);
    throw new Error("Group name not typed");
  }
  sleep(rnd(2000, 4000));

  // 7) Seleccionar el row del grupo (buscar por nombre normalizado, con
  //    variantes por si el row muestra un nombre distinto).
  var rowLabels = [searchName, groupName];
  if (searchName !== groupName) rowLabels.unshift(groupName);
  ok = clickLabel(rowLabels, t, true);
  // Verificar que realmente navegó al composer del grupo (el box desapareció).
  var rowSelected = searchBoxGone(6000);

  // Fallback posicional: el resultado del buscador aparece justo debajo del
  // box (a veces el row no expone el texto completo o difiere en mayúsculas).
  if (!ok || !rowSelected) {
    console.log("[native] row por nombre no encontrado, probando click debajo del box");
    var rowNode = clickResultBelowEditText(t);
    if (rowNode) {
      // rotar estrategias de tap para aterrizar en el row real
      for (var rs = 0; rs < 5 && !rowSelected; rs++) {
        tapStrategy(rowNode, rs);
        sleep(1200);
        rowSelected = searchBoxGone(3000);
      }
    }
  }
  if (!rowSelected) {
    sendDebug("group-row-not-found", url);
    throw new Error("Group row not found: " + searchName);
  }
  sleep(rnd(2000, 3500));

  // 8) Mensaje opcional en el composer
  if (message) {
    typeIntoEditText(message, 10000);
    sleep(rnd(1000, 2000));
  }

  // 9) Botón final (Publicar / Compartir / Listo)
  ok = clickLabel(["Publicar", "Compartir ahora", "Share Now", "Done", "Listo", "Publicar en el grupo"], t, false);
  if (!ok) {
    // último recurso: botón "Compartir" dentro del composer
    ok = clickLabel(["Compartir", "Share"], t, false);
  }
  if (!ok) {
    sendDebug("no-final-btn", url);
    throw new Error("Final share button not found");
  }

  // 10) Verificar el cartel de confirmación ("Has compartido la publicación").
  //     Es un snackbar efímero (in-app, sin botón) → pollear el árbol de
  //     accesibilidad rápido antes de que desaparezca. No bloquea la tarea:
  //     si se escapa, igual se marca completed (evitar falsos negativos).
  var confirmWords = ["compartido", "publicado", "publicación", "shared", "publicada", "has compartido", "listo"];
  var shareConfirmed = false;
  var confirmDeadline = Date.now() + 6000;
  while (Date.now() < confirmDeadline && !shareConfirmed) {
    var cnodes = dumpUi(120);
    for (var ci = 0; ci < cnodes.length && !shareConfirmed; ci++) {
      var cblob = ((cnodes[ci].t || "") + " " + (cnodes[ci].d || "")).toLowerCase();
      for (var ck = 0; ck < confirmWords.length; ck++) {
        if (cblob.indexOf(confirmWords[ck]) >= 0) { shareConfirmed = true; break; }
      }
    }
    if (!shareConfirmed) sleep(300);
  }
  if (shareConfirmed) {
    console.log("[native] cartel de confirmación detectado");
    sendDebug("share-confirmed", url);
  } else {
    console.log("[native] cartel de confirmación no detectado (se comparte igual)");
    sendDebug("share-no-confirm", url);
  }

  return true;
}



// Marca el checkbox de un grupo en la pantalla de selección múltiple de la
// cuenta business (buscador + lista con checkboxes). Escribe el nombre del
// grupo (filtra la lista), ubica el row y toca su checkbox. Devuelve true si
// se marcó (o se asume marcado); false si el grupo no aparece en la lista.
function selectGroupCheckbox(groupName, timeoutMs) {
  var t = timeoutMs || CONFIG.findTimeoutMs;
  console.log("[native] marcando grupo: " + groupName);

  // Normalizar nombre (mismo criterio que searchGroupAndPublish)
  var searchName = groupName;
  var prefixes = ["grupo ", "grupo  ", "group ", "grupo fb ", "pagina "];
  var trimmed = searchName;
  for (var pi = 0; pi < prefixes.length; pi++) {
    if (trimmed.toLowerCase().indexOf(prefixes[pi]) === 0) {
      trimmed = trimmed.substring(prefixes[pi].length).trim();
      break;
    }
  }
  if (trimmed) searchName = trimmed;

  // 1) Tipear el nombre completo → filtra la lista. NO usar variantes/palabras
  //    clave: tipear una palabra suelta puede filtrar OTRO grupo que la
  //    contenga y marcar el checkbox del grupo equivocado. Si no aparece el
  //    row, declarar el grupo como no encontrado (missing), no arriesgar.
  if (!typeIntoEditText(searchName, t)) {
    sendDebug("no-group-checkbox-input", groupName);
    throw new Error("Group checkbox input not found");
  }
  if (!waitEditTextHas(searchName, 8000)) {
    sendDebug("group-checkbox-no-text", groupName);
    throw new Error("Group checkbox name not typed");
  }
  sleep(rnd(2000, 4000));

  var row = findGroupRowBelowEditText(searchName, t);
  if (!row) {
    console.log("[native] grupo '" + searchName + "' no aparece en la lista filtrada");
    sendDebug("group-checkbox-row-missing", groupName);
    return false;
  }
  console.log("[native] row encontrado para '" + searchName + "': " + ((row.text && row.text()) || ""));

  // 3) Activar el checklist tocando el CENTRO del row (el nombre/área), con
  //    rotación de estrategias de tap hasta confirmar que quedó seleccionado.
  var confirmDeadline = Date.now() + 5000;
  var marked = false;
  var strategies = [0, 1, 4, 7, 2];
  for (var st = 0; st < strategies.length && !marked && Date.now() < confirmDeadline; st++) {
    try {
      tapStrategy(row, strategies[st]);
      console.log("[native] tap estrategia " + strategies[st] + " sobre el row '" + searchName + "'");
    } catch (e) {}
    sleep(rnd(1200, 2000));

    // Verificar si quedó marcado (nodo checkable checked=true dentro del row,
    // o un check visible como desc).
    try {
      var chk = checkable(true).find();
      var rb3 = row.bounds();
      for (var j = 0; j < chk.length; j++) {
        var c2 = chk[j];
        var c2b = c2.bounds();
        var inside = c2b.centerX() >= rb3.left && c2b.centerX() <= rb3.right &&
                     c2b.centerY() >= rb3.top && c2b.centerY() <= rb3.bottom;
        if (!inside) continue;
        try { if (c2.checked()) { marked = true; break; } } catch (e2) {}
      }
      if (marked) break;
      // Algunos árboles exponen el check como desc ("Marcado", "Seleccionado", "Check")
      if (!marked) {
        var nodes = dumpUi(60);
        for (var di = 0; di < nodes.length; di++) {
          var dblob = ((nodes[di].t || "") + " " + (nodes[di].d || "")).toLowerCase();
          if (dblob.indexOf("marcado") >= 0 || dblob.indexOf("seleccionado") >= 0 ||
              dblob.indexOf("check") >= 0) {
            marked = true;
            break;
          }
        }
      }
      // Señal fuerte: si aparece el botón "Siguiente" es porque hay ≥1 grupo
      // marcado (solo existe con selección activa).
      if (!marked) {
        var nextNode = findNode(["Siguiente", "Next", "Continuar"], 1500);
        if (nextNode) {
          console.log("[native] botón 'Siguiente' detectado tras el tap → marcado confirmado");
          marked = true;
        }
      }
    } catch (e) {}
  }

  if (marked) {
    console.log("[native] grupo '" + searchName + "' confirmado marcado");
    return true;
  }
  console.log("[native] grupo '" + searchName + "' sin estado expuesto; se asume marcado");
  return true;
}

// Cierra el sheet de confirmación y el buscador de grupos tras el ÚLTIMO grupo
// de un batch, para que el próximo share arranque desde el feed limpio. Entre
// grupos del mismo batch NO se llama: se reutiliza el buscador abierto.
function cleanupAfterBatch() {
  // Con Shizuku lo más fiable es matar FB: si queda el modal de "buscar grupo"
  // o un webview del post (pantalla blanca), el próximo arranque se encuentra
  // la app en un estado roto. Forzar cierre deja el próximo am start limpio
  // (la sesión/cookies persisten). Sin Shizuku, back() a ciegas.
  try {
    if (shizukuAvailable()) {
      var r = shizukuCmd("am force-stop com.facebook.katana");
      console.log("[native] FB cerrado tras batch" + (r && r.code === 0 ? " (OK)" : ""));
      sleep(rnd(1500, 2500));
      return;
    }
  } catch (e) {}
  sleep(rnd(1500, 3000));
  try { back(); } catch (e) {}
  sleep(rnd(1500, 2500));
  try { back(); } catch (e) {}
  sleep(rnd(1000, 2000));
}

// Apaga y bloquea la pantalla al terminar el post completo (los 7 grupos).
// Libera el wake lock de AutoJs6 y fuerza el apagado vía Shizuku (keyevent
// SLEEP). En Samsung con PIN/patrón, apagar la pantalla la bloquea solo. El
// próximo batch la despierta y desbloquea a demanda (wakeScreenIfNeeded +
// ensureUnlocked ya lo manejan).
function screenOffAndLock() {
  try {
    if (!shizukuAvailable()) {
      // Sin Shizuku no hay forma fiable de despertar la pantalla después
      // (device.wakeUp falla sin root en Samsung). NO apagar: dejamos que el
      // timeout normal de pantalla la apague sola, pero el keyguard se queda
      // sin lock forzado. Mejor quedarse encendido que quedar dormido para
      // siempre.
      console.log("[native] sin Shizuku no se apaga la pantalla (no se podría despertar luego)");
      cancelScreenAwake();
      return;
    }
    cancelScreenAwake();
    // Ocultar la consola flotante de AutoJs6: si queda visible sobre el
    // keyguard intercepta los taps al desbloquear a mano (síntoma "el touch
    // no anda"). El log sigue escribiendo igual; solo se oculta la ventana.
    try { console.hide(); } catch (eC) {}
    // Desactivar cualquier "No dormir" residual de corridas previas con
    // stayAwakeWhileCharging: true, para que el timeout normal de pantalla
    // y el apagado forzado de abajo tengan efecto.
    shizukuCmd("svc power stayon false");
    sleep(300);
    shizukuCmd("input keyevent 223"); // KEYCODE_SLEEP → apagar pantalla + lock
    sleep(800);
    var wf = readWakefulness();
    if (wf && wf !== "Asleep") {
      // Si el SLEEP no apagó (estado raro), reintentar una vez
      console.log("[native] tras SLEEP quedó " + wf + ", reintentando...");
      shizukuCmd("input keyevent 223");
      sleep(800);
    }
    console.log("[native] pantalla apagada y bloqueada");
  } catch (e) {
    console.log("[native] screenOffAndLock falló: " + e.message);
  }
}

// ─── Loop principal ───────────────────────────────────────────────────────

// Ejecuta un comando shell vía Shizuku (privilegios ADB, SIN root). AutoJs6
// expone la función global shizuku() cuando el servicio Shizuku está corriendo
// y AutoJs6 tiene el toggle habilitado. Devuelve el ShellResult o null si no
// hay Shizuku disponible. En Samsung sin root es la ÚNICA vía fiable para
// despertar la pantalla (device.wakeUp() y keyevent fallan sin root).
function shizukuCmd(cmd) {
  try {
    if (typeof shizuku !== "function") return null;
    return shizuku(cmd);
  } catch (e) {
    console.log("[native] shizuku falló: " + e.message);
    return null;
  }
}

function shizukuAvailable() {
  try {
    if (typeof shizuku !== "function") return false;
    // isOperational(): servicio corriendo Y AutoJs6 con permiso concedido.
    // typeof shizuku === "function" es true aunque falte el permiso, así que
    // usar isOperational() evita el aviso falso de "disponible".
    if (typeof shizuku.isOperational === "function") return !!shizuku.isOperational();
    if (typeof shizuku.isRunning === "function") return !!shizuku.isRunning();
    return true;
  } catch (e) { return false; }
}

// Mantiene la pantalla encendida (wake lock de AutoJs6). keepScreenOn acepta
// duración en ms, NO boolean. Se renueva periódicamente para no vencerse.
// OJO: según el issue #361 de AutoJs6, keepScreenOn solo sostiene la pantalla
// mientras AutoJs6 tiene foco; al perderlo (FB en primer plano) la pantalla
// igual se apaga. Por eso el desbloqueo a demanda vía Shizuku es lo que de
// verdad sostiene el relay 24/7.
function keepScreenAwake() {
  try {
    device.keepScreenOn(30 * 60 * 1000);
  } catch (e) {
    console.log("[native] keepScreenOn falló: " + e.message);
  }
}

function cancelScreenAwake() {
  try { device.cancelKeepingAwake(); } catch (e) {}
}

// Enciende la pantalla si está apagada. En Samsung sin root, device.wakeUp()
// suele fallar → usar Shizuku (ADB) primero y luego cascada.
// Estrategia para Samsung con AOD:
//   Asleep (apagado total) → KEYCODE_WAKEUP (224) → Dozing (AOD/reloj)
//   Dozing (AOD/reloj)     → repetir KEYCODE_WAKEUP (224) HASTA mWakefulness=Awake (lockscreen)
//   Awake (lockscreen)     → éxito
// Se usa WAKEUP (224) y no POWER (26) en todo el flujo: POWER es un toggle que
// puede volver a apagar la pantalla si se envía en el estado equivocado.
// Devolver true solo si llega a Awake (lockscreen con keypad).

function readWakefulness() {
  try {
    if (!shizukuAvailable()) return null;
    var r = shizukuCmd("dumpsys power");
    if (!r || r.code !== 0) return null;
    var out = String(r.output || "");
    var m = /mWakefulness=(\w+)/.exec(out);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

function wakeScreenIfNeeded() {
  if (shizukuAvailable()) {
    // Shizuku disponible: la fuente de verdad es mWakefulness real, NO
    // device.isScreenOn(). OJO: con AOD activo, isScreenOn() devuelve true en
    // Dozing (reloj AOD visible) pero la pantalla NO está en Awake y no hay
    // keyguard interactivo ni keypad → dismiss-keyguard/swipe/PIN no hacen nada.
    // Por eso hay que pasar Dozing → Awake con KEYCODE_WAKEUP (224) siempre.
    for (var attempt = 0; attempt < 8; attempt++) {
      var wf = readWakefulness();
      if (wf === "Awake") {
        log("[native] wake: pantalla en Awake");
        return true;
      }
      if (wf === "Asleep") {
        // Apagado total: WAKEUP (224) enciende directo (no-toggle, a diferencia
        // de POWER 26 que alterna y puede volver a apagar).
        log("[native] wake: Asleep → KEYCODE_WAKEUP (224) #" + (attempt + 1));
        shizukuCmd("input keyevent 224");
        sleep(1500);
        continue;
      }
      if (wf === "Dozing") {
        // AOD visible (reloj): repetir WAKEUP (224) hasta Awake
        log("[native] wake: Dozing → KEYCODE_WAKEUP (224) #" + (attempt + 1));
        shizukuCmd("input keyevent 224");
        sleep(1200);
        continue;
      }
      // wf === null o estado desconocido: NO confiar en isScreenOn() (con AOD
      // devuelve true en Dozing). Forzar WAKEUP para forzar paso a Awake.
      log("[native] wake: estado desconocido (" + (wf || "n/a") + "), forzo WAKEUP");
      shizukuCmd("input keyevent 224");
      sleep(1000);
    }

    // Verificación final
    var wfFinal = readWakefulness();
    if (wfFinal === "Awake") {
      log("[native] wake: verificación final Awake");
      return true;
    }
    log("[native] wake: no se alcanzó Awake (final=" + (wfFinal || "n/a") + "), recovery agresivo...");
    // Recovery agresivo: el AOD/Dozing puede quedarse en un estado raro tras un
    // sleep forzado. Dismiss del keyguard + WAKEUP repetido + MENU (desbloquea
    // keyguard sin PIN) y re-verificar.
    try {
      shizukuCmd("wm dismiss-keyguard");
      sleep(800);
    } catch (eR) {}
    for (var rk = 0; rk < 4 && readWakefulness() !== "Awake"; rk++) {
      log("[native] wake recovery: WAKEUP (224) #" + (rk + 1));
      shizukuCmd("input keyevent 224");
      sleep(1000);
    }
    if (readWakefulness() !== "Awake") {
      log("[native] wake recovery: MENU (82) para descartar keyguard");
      shizukuCmd("input keyevent 82");
      sleep(1000);
    }
    var wfR = readWakefulness();
    if (wfR === "Awake") {
      log("[native] wake: recovery alcanzó Awake");
      return true;
    }
    log("[native] wake: recovery falló (final=" + (wfR || "n/a") + ")");
    return false;
  }

  // Sin Shizuku: fallback cascada con isScreenOn() como aproximación
  try {
    if (device.isScreenOn && device.isScreenOn()) return true;
  } catch (e) {}
  try { device.wakeUpIfNeeded(); } catch (e) {}
  sleep(800);
  try { if (device.isScreenOn && device.isScreenOn()) return true; } catch (e) {}
  try { device.wakeUp(); } catch (e) {}
  sleep(800);
  try { if (device.isScreenOn && device.isScreenOn()) return true; } catch (e) {}
  try { keyCode(224); } catch (e) {}
  sleep(800);
  try { if (device.isScreenOn && device.isScreenOn()) return true; } catch (e) {}
  try { shell("input keyevent 224", true); } catch (e) {}
  sleep(800);
  try {
    if (device.isScreenOn && device.isScreenOn()) return true;
  } catch (e) {}
  return false;
}

// Desbloquea la pantalla si está bloqueada (lock screen). El relay corre 24/7
// y las tareas llegan a demanda, así que el celular puede estar con la pantalla
// apagada/bloqueada cuando hay que compartir. Secuencia:
//   1. Encender la pantalla (wakeUp)
//   2. Swipe hacia arriba para pasar el keyguard inicial
//   3. Si hay PIN configurado (CONFIG.screenPin), clickear los dígitos
//      en el keypad numérico (Samsung OneUI los expone como text/desc).
// Detecta el lock real vía KeyguardManager (Android): devuelve true aunque FB
// esté abierto encima del keyguard (caso típico del relay 24/7: el intent con
// TURN_SCREEN_ON abre FB y el keyguard queda delante). El chequeo por
// currentPackage() es poco fiable: AOD = "com.samsung.android.app.aodservice",
// FB abierto = "com.facebook.katana", y no distingue si el keyguard está encima.
function isScreenLocked() {
  try {
    var km = context.getSystemService(context.KEYGUARD_SERVICE);
    if (km) {
      try { if (km.inKeyguardRestrictedInputMode()) return true; } catch (e) {}
      try { if (km.isKeyguardLocked && km.isKeyguardLocked()) return true; } catch (e) {}
    }
  } catch (e) {}
  // Fallback: EditText de PIN visible en pantalla (keyguard de OneUI)
  try {
    var edit = className("android.widget.EditText").findOne(400);
    if (edit && edit.visibleToUser()) {
      var pkg = edit.packageName() || "";
      if (pkg.indexOf("systemui") >= 0 || pkg.indexOf("keyguard") >= 0) return true;
    }
  } catch (e) {}
  return false;
}

function ensureUnlocked() {
  if (!CONFIG.enableAutoUnlock) return false;
  try {
    // keepScreenOn además DESPIERTA la pantalla si está apagada (doc AutoJs6):
    // renovarlo primero es la forma más fiable de encender sin root en Samsung.
    keepScreenAwake();
    var woken = wakeScreenIfNeeded();
    if (!woken) {
      log("[native] no se pudo encender la pantalla");
      sendDebug("screen-wake-fail");
    }
    // Confirmar Awake real antes de dismiss-keyguard/swipe/PIN. Con AOD, si el
    // wake se quedó en Dozing, no hay keyguard interactivo y el swipe/PIN no
    // harían nada. Si no está Awake, reintentar el wake antes de seguir.
    if (shizukuAvailable()) {
      var aw = readWakefulness();
      var awDeadline = Date.now() + 10000;
      while (aw !== "Awake" && Date.now() < awDeadline) {
        log("[native] ensureUnlocked: aún " + (aw || "n/a") + ", wake de nuevo...");
        wakeScreenIfNeeded();
        sleep(rnd(800, 1500));
        aw = readWakefulness();
      }
      if (aw === "Awake") log("[native] ensureUnlocked: pantalla Awake confirmada");
      else log("[native] ensureUnlocked: no se confirmó Awake (final=" + (aw || "n/a") + ")");
    }
    sleep(rnd(1500, 2500));

    var pin = String(CONFIG.screenPin || "");

    // Con Shizuku, "wm dismiss-keyguard" descarta el keyguard directamente
    // (privilegios ADB). Sin PIN deja el celular desbloqueado al toque; con
    // PIN deja el keypad numérico listo. Es mucho más fiable que swipe a ciegas.
    if (shizukuAvailable()) {
      try {
        shizukuCmd("wm dismiss-keyguard");
        sleep(rnd(1200, 2000));
      } catch (e) {}
    }

    var unlocked = false;

    // Reintentar el ciclo swipe → keypad hasta 4 veces. Desde el AOD hacen
    // falta 2 swipes (AOD → lockscreen → keypad), y a veces el primero se hace
    // antes de que la pantalla termine de encender. Solo entrar el PIN cuando
    // el keypad numérico sea visible, si no el swipe no llegó al keypad.
    for (var pass = 0; pass < 4 && !unlocked; pass++) {
      if (pass > 0) {
        keepScreenAwake();
        sleep(rnd(800, 1500));
      }
      // Swipe hacia arriba: pasar el AOD/lockscreen inicial
      try {
        if (shizukuAvailable()) {
          // input swipe vía Shizuku (ADB) es más fiable que swipe() de
          // accessibility sobre el keyguard de Samsung.
          var sx = Math.round(screenWidth() / 2);
          var sy1 = Math.round(screenHeight() * 0.8);
          var sy2 = Math.round(screenHeight() * 0.2);
          shizukuCmd("input swipe " + sx + " " + sy1 + " " + sx + " " + sy2 + " 400");
        } else {
          swipe(screenWidth() / 2, screenHeight() * 0.8, screenWidth() / 2, screenHeight() * 0.2, 400);
        }
        sleep(rnd(1200, 2000));
      } catch (e) {}

      if (!isScreenLocked()) {
        unlocked = true;
        break;
      }

      if (pin) {
        // Con Shizuku los keyevents del PIN se inyectan directo (no dependen
        // del árbol de accesibilidad), así que no hace falta esperar a que el
        // keypad sea "visible" para el buscador de texto. Intento directo.
        var useKeyevents = shizukuAvailable();
        if (!useKeyevents) {
          // Esperar a que el keypad aparezca (que haya un dígito clicable)
          var padVisible = false;
          var padDeadline = Date.now() + 7000;
          while (Date.now() < padDeadline && !padVisible) {
            padVisible = pinKeypadVisible(pin);
            if (!padVisible) sleep(500);
          }
          if (!padVisible) {
            log("[native] intento " + (pass + 1) + ": keypad no visible aún, reintentando swipe...");
            continue;
          }
        } else {
          // Darle medio segundo al dismiss-keyguard para mostrar el keypad
          sleep(600);
        }
        log("[native] desbloqueando con PIN" + (useKeyevents ? " (keyevents)" : "") + "...");
        if (!typePin(pin)) {
          sendDebug("pin-digit-not-found");
          continue;
        }
        sleep(rnd(1200, 2000));
        // Segundo swipe por si tras el PIN pide "siguiente"/confirmar
        try {
          if (shizukuAvailable()) {
            var sx2 = Math.round(screenWidth() / 2);
            var sya = Math.round(screenHeight() * 0.7);
            var syb = Math.round(screenHeight() * 0.3);
            shizukuCmd("input swipe " + sx2 + " " + sya + " " + sx2 + " " + syb + " 300");
          } else {
            swipe(screenWidth() / 2, screenHeight() * 0.7, screenWidth() / 2, screenHeight() * 0.3, 300);
          }
          sleep(rnd(800, 1500));
        } catch (e) {}
      }

      unlocked = !isScreenLocked();
      if (!unlocked) log("[native] intento " + (pass + 1) + " de desbloqueo sin éxito, reintentando...");
    }

    if (unlocked) log("[native] pantalla desbloqueada");
    else log("[native] pantalla aún bloqueada");
    return unlocked;
  } catch (e) {
    log("[native] ensureUnlocked falló: " + e.message);
    return false;
  }
}

// true si el keypad numérico del PIN está visible. Chequea que alguno de los
// dígitos del PIN esté expuesto como text/desc en pantalla (Samsung OneUI los
// expone como texto o content-desc de cada botón).
function pinKeypadVisible(pin) {
  for (var i = 0; i < pin.length; i++) {
    var d = pin.charAt(i);
    var node = null;
    try { node = text(d).findOne(300); } catch (e) {}
    if (!node) { try { node = desc(d).findOne(300); } catch (e2) {} }
    if (node && node.visibleToUser()) return true;
  }
  return false;
}

// Clickea los dígitos del PIN en el keypad. Devuelve false si algún dígito no
// se encuentra.
function typePin(pin) {
  // Con Shizuku lo más exacto es el keyevent del dígito (KEYCODE_0..9):
  // escribe el PIN directo sin depender de encontrar/tocar el botón por texto,
  // que en Samsung puede fallar y "poner mal el PIN".
  //  KEYCODE_0=7, KEYCODE_1=8, ..., KEYCODE_9=16
  if (shizukuAvailable()) {
    var keycodes = { 0: 7, 1: 8, 2: 9, 3: 10, 4: 11, 5: 12, 6: 13, 7: 14, 8: 15, 9: 16 };
    for (var k = 0; k < pin.length; k++) {
      var kc = keycodes[pin.charAt(k)];
      if (kc === undefined) return false;
      var r = shizukuCmd("input keyevent " + kc);
      if (!r || r.code !== 0) {
        console.log("[native] keyevent del dígito " + pin.charAt(k) + " falló, cayendo a tap por texto");
        return typePinByText(pin);
      }
      sleep(rnd(500, 900));
    }
    return true;
  }
  return typePinByText(pin);
}

function typePinByText(pin) {
  for (var i = 0; i < pin.length; i++) {
    var digit = pin.charAt(i);
    var clicked = false;
    var deadline = Date.now() + 6000;
    while (Date.now() < deadline && !clicked) {
      var node = null;
      try { node = text(digit).findOne(800); } catch (e) {}
      if (!node) { try { node = desc(digit).findOne(800); } catch (e2) {} }
      if (!node) {
        // Algunos keypads usan content-desc con el número duplicado
        try { node = descContains(digit).findOne(800); } catch (e3) {}
      }
      if (node && node.visibleToUser()) {
        try { tapStrategy(node, 1); clicked = true; } catch (e4) {}
      }
      if (!clicked) sleep(400);
    }
    if (!clicked) {
      console.log("[native] dígito " + digit + " no encontrado en el keypad");
      return false;
    }
    sleep(rnd(500, 900));
  }
  return true;
}

function mainLoop() {
  console.show();
  console.log("[native] fb-native-relay iniciado");
  console.log("[native] build v2.4+ (wake Dozing/AOD arreglado + auto-relaunch sin exit-race + wf en heartbeat)");
  parkConsole();

  // Delay inicial configurable: tiempo para bloquear la pantalla a mano y
  // probar el flujo real (desbloqueo + PIN + deep link sobre pantalla apagada).
  if (CONFIG.startupDelayMs > 0) {
    console.log("[native] esperando " + CONFIG.startupDelayMs + "ms antes de arrancar (tiempo para bloquear pantalla)...");
    sleep(CONFIG.startupDelayMs);
  }

  // Shizuku es OBLIGATORIO para el relay 24/7 en Samsung sin root: es la única
  // forma de despertar la pantalla desde AOD/sueño (device.wakeUp() y keyevent
  // fallan sin root). Avisar en el arranque si no está disponible.
  // Shizuku es OBLIGATORIO para el relay 24/7: esperar un poco a que arranque
  // el servicio (tras el boot de Samsung o al darle start, tarda unos segundos
  // en quedar operational). Si tras ~20s no está, avisar fuerte y frenar: sin
  // Shizuku el desbloqueo no funciona y abrir FB sin am start deja la app en
  // el home sin navegar al post (share imposible).
  var shizukuOk = shizukuAvailable();
  var shizukuWaitStart = Date.now();
  while (!shizukuOk && Date.now() - shizukuWaitStart < 20000) {
    console.log("[native] esperando Shizuku (" + Math.round((Date.now() - shizukuWaitStart) / 1000) + "s)...");
    sleep(2000);
    shizukuOk = shizukuAvailable();
  }
  if (shizukuOk) {
    console.log("[native] Shizuku disponible: desbloqueo 24/7 OK");
    if (CONFIG.stayAwakeWhileCharging) {
      try {
        var sa = shizukuCmd("svc power stayon usb");
        console.log("[native] stay-on-while-charging activado" + (sa && sa.code === 0 ? " (OK)" : " (sin efecto)"));
      } catch (e) {
        console.log("[native] stayon falló: " + e.message);
      }
    }
  } else {
    console.warn("[native] Shizuku NO disponible tras " + Math.round((Date.now() - shizukuWaitStart) / 1000) + "s de espera: el desbloqueo 24/7 y el deep link del post NO van a funcionar. Abrir la app Shizuku (botón Start), activar el toggle en AutoJs6 (Ajustes/Inicio) y conceder ADB wireless una vez.");
  }

  // Mantener pantalla encendida mientras el relay corre
  keepScreenAwake();

  // Watchdog: monitorea el heartbeat del loop principal. Si se cuelga o muere
  // por una excepción, relanza este mismo script para no dejar el relay caído.
  // (NO cubre si Android mata el proceso completo de AutoJs6: eso se resuelve
  // con la exención de batería + la tarea de difusión del scheduler.)
  startWatchdog();

  // Heartbeat al server: para ver en el panel admin que el relay está vivo
  // (último heartbeat) sin necesidad de tocar el celular.
  startHeartbeatThread();

  // NO pedir captura de pantalla acá: en Android eso abre el diálogo
  // "compartir pantalla" (MediaProjection) que hay que tocar a mano en cada
  // inicio y bloquea el arranque automático. La captura solo se pide bajo
  // demanda dentro de sendDebug() cuando hay un fallo real.

  // El lock es el árbitro único: quien lo adquiere es la autoridad. (No usar
  // otherInstanceRunning() acá como guard: cuando el watchdog relanza, la
  // zombie sigue viva unos segundos y el guard haría salir a la instancia nueva.)
  if (!acquireLock()) {
    console.error("[native] lock ocupado, saliendo");
    exit();
  }
  killOtherInstances();

  console.log("[native] lock adquirido, arrancando loop de polling");

  try {
    runPollLoop();
  } catch (e) {
    console.error("[native] error fatal: " + e);
    console.error(e && e.stack ? e.stack : "");
    sleep(10000);
  }

  releaseLock();
  stopWatchdog();
  stopHeartbeatThread();
  cancelScreenAwake();

  // Auto-relanzamiento: si el loop terminó (cuelgue, excepción no capturada o
  // interrupción del árbol), levantar una instancia nueva para no dejar el
  // relay caído. OJO: no usar threads.start + exit() (exit() mata el thread
  // antes de que corra el relaunch); el relaunch se hace acá en el thread
  // principal tras el delay. El guard de otherInstanceRunning() evita
  // duplicados si otra instancia ya tomó el lock.
  try {
    var sp = files.join(files.cwd(), "fb-native-relay.js");
    if (files.exists(sp)) {
      console.log("[native] mainLoop terminando, auto-relanzando script en " + Math.round(CONFIG.restartDelayMs / 1000) + "s...");
      sleep(CONFIG.restartDelayMs);
      try {
        if (otherInstanceRunning()) {
          console.log("[native] auto-relanzamiento: otra instancia ya corre, omitiendo");
        } else {
          engines.execScriptFile(sp);
        }
      } catch (eR) {
        console.error("[native] auto-relanzamiento falló: " + eR.message);
      }
    }
  } catch (eRestart) {
    console.error("[native] auto-relanzamiento no disponible: " + eRestart.message);
  }
  console.log("[native] mainLoop saliendo (exit)");
  exit();
}

function isInterrupted(e) {
  // OJO: para ScriptInterruptedException el message es literalmente "null" y el
  // constructor en Rhino es un wrapper, así que "constructor.name" y "message"
  // NO matchean "Interrupted". Lo fiable es String(e): devuelve
  // "org.autojs.autojs.runtime.exception.ScriptInterruptedException: null".
  var s = String(e);
  var name = String(e && e.constructor ? e.constructor.name : e);
  var msg = String(e && e.message ? e.message : e);
  var stack = String(e && e.stack ? e.stack : "");
  return s.indexOf("Interrupted") >= 0 || name.indexOf("Interrupted") >= 0 ||
         msg.indexOf("interrupted") >= 0 || stack.indexOf("Interrupted") >= 0;
}

// ¿El engine de este script fue realmente detenido (stop manual del usuario)?
// Cuando AutoJs6 reconecta el árbol de accesibilidad (p.ej. al abrir FB en
// frío tras un force-stop), findOne/sleep lanzan ScriptInterruptedException
// PERO el engine sigue vivo. Hay que distinguirlo del stop manual, que sí
// apaga el engine.
function isEngineStopped() {
  try {
    var eng = engines.myEngine();
    if (!eng || typeof eng.isStopped !== "function") return false;
    if (!eng.isStopped()) return false;
    // Reconexión del árbol de accesibilidad puede dar un falso positivo
    // momentáneo de isStopped(). Confirmar con un segundo chequeo tras una
    // pausa: si sigue detenido, es un stop real (manual / sistema).
    sleep(1200);
    return eng.isStopped();
  } catch (e) {}
  return false;
}

function runPollLoop() {
  log("[native] runPollLoop iniciado");
  while (true) {
    markLoopHeartbeat();
    try {
      // Traer varias tareas pendientes y agruparlas por post (target_url): las
      // del mismo post se publican juntas en una pasada (marcando el checkbox
      // de cada grupo en la misma pantalla), en vez de reiniciar por grupo.
      log("[native] polling /fb/pending...");
      var data = apiGet("/fb/pending?limit=10&action=share");
      var tasks = data.tasks || [];
      log("[native] poll OK: " + tasks.length + " tarea(s)");
      if (tasks.length === 0) {
        // Sin tareas: la pantalla puede quedar APAGADA y bloqueada. El polling
        // HTTP no necesita pantalla; solo cancelar el wake lock para que el
        // timeout normal de pantalla la apague (y bloquee sola con PIN).
        cancelScreenAwake();
        console.log("[native] sin tareas pendientes, esperando " + Math.round(CONFIG.pollIntervalMs / 1000) + "s...");
        var idleDeadline = Date.now() + CONFIG.pollIntervalMs;
        while (Date.now() < idleDeadline) {
          sleep(30000);
        }
        continue;
      }

      // Hay tareas → el celular puede estar apagado/bloqueado (relay 24/7).
      // Acá solo asegurar que la pantalla quede encendida; el desbloqueo real
      // (swipe + PIN) se hace dentro de openPostAndShareGroup DESPUÉS de abrir
      // FB, cuando el keyguard es interactivo y la pantalla ya está encendida.
      keepScreenAwake();
      wakeScreenIfNeeded();

      var groups = {};
      var order = [];
      for (var i = 0; i < tasks.length; i++) {
        var key = tasks[i].target_url || ("task-" + tasks[i].id);
        if (!groups[key]) {
          groups[key] = [];
          order.push(key);
        }
        groups[key].push(tasks[i]);
      }

      for (var g = 0; g < order.length; g++) {
        var batch = groups[order[g]];
        console.log("[native] batch de " + batch.length + " grupo(s) para el post " + (batch[0].target_url || batch[0].id));

        // Flujo cuenta business: abrir el post UNA vez, marcar el checkbox de
        // cada grupo, tocar "Siguiente" y "Publicar" una sola vez para todo el
        // batch. Todos los grupos del mismo post se marcan en la misma pantalla.
        var selectedTasks = [];
        var missingTasks = [];
        var sharePublished = false;
        var maxAttempts = 3;
        var ok = false;
        for (var attempt = 1; attempt <= maxAttempts && !sharePublished; attempt++) {
          markLoopHeartbeat();
          if (attempt > 1) {
            console.log("[native] reintentando batch (intento " + attempt + ")");
            // FB quedó en estado incierto → arrancar limpio
            try {
              if (shizukuAvailable()) shizukuCmd("am force-stop com.facebook.katana");
            } catch (e9) {}
            sleep(rnd(4000, 6000));
          } else {
            console.log("[native] batch share de " + batch.length + " grupo(s)");
          }
          try {
            // 1) Abrir post + Compartir + "Grupo" (deja el buscador con
            //    EditText listo para filtrar). Solo la primera vez.
            openPostAndShareGroup(batch[0]);

            // 2) Marcar el checkbox de cada grupo (type filtra la lista).
            selectedTasks = [];
            missingTasks = [];
            for (var b = 0; b < batch.length; b++) {
              markLoopHeartbeat();
              var grp = batch[b].group_name || batch[b].fb_group_id;
              var okMark = false;
              try {
                okMark = selectGroupCheckbox(grp, CONFIG.findTimeoutMs);
              } catch (eMark) {
                console.error("[native] error marcando '" + grp + "': " + eMark.message);
              }
              if (okMark) {
                selectedTasks.push(batch[b]);
              } else {
                missingTasks.push(batch[b]);
              }
              // Delay humano entre grupos del mismo post
              var delay = rnd(CONFIG.minDelayMs, CONFIG.maxDelayMs);
              console.log("[native] esperando " + Math.round(delay / 1000) + "s entre grupos...");
              sleep(delay);
            }

            if (selectedTasks.length === 0) {
              throw new Error("no group selected");
            }

            // Tras marcar todos los grupos, limpiar el buscador: con texto
            // escrito FB no muestra el botón "Siguiente".
            clearGroupSearchText(8000);
            sleep(rnd(1000, 1500));

            // 3) Botón "Siguiente" (business) → vista final del post con Publicar
            ok = clickLabel(["Siguiente", "Next", "Continuar"], CONFIG.findTimeoutMs, false);
            if (!ok) {
              sendDebug("no-next-btn", batch[0].target_url);
              throw new Error("Next button not found");
            }
            sleep(rnd(2500, 4000));

            // 4) Botón final (Publicar / Compartir / Listo)
            ok = clickLabel(["Publicar", "Compartir ahora", "Share Now", "Done", "Listo", "Publicar en el grupo"], CONFIG.findTimeoutMs, false);
            if (!ok) {
              // último recurso: botón "Compartir" dentro del composer
              ok = clickLabel(["Compartir", "Share"], CONFIG.findTimeoutMs, false);
            }
            if (!ok) {
              sendDebug("no-final-btn", batch[0].target_url);
              throw new Error("Final share button not found");
            }

            // 5) Verificar el cartel de confirmación (efímero, no bloquea)
            var confirmWords = ["compartido", "publicado", "publicación", "shared", "publicada", "has compartido", "listo"];
            var shareConfirmed = false;
            var confirmDeadline = Date.now() + 6000;
            while (Date.now() < confirmDeadline && !shareConfirmed) {
              var cnodes = dumpUi(120);
              for (var ci = 0; ci < cnodes.length && !shareConfirmed; ci++) {
                var cblob = ((cnodes[ci].t || "") + " " + (cnodes[ci].d || "")).toLowerCase();
                for (var ck = 0; ck < confirmWords.length; ck++) {
                  if (cblob.indexOf(confirmWords[ck]) >= 0) { shareConfirmed = true; break; }
                }
              }
              if (!shareConfirmed) sleep(300);
            }
            if (shareConfirmed) {
              console.log("[native] cartel de confirmación detectado");
              sendDebug("share-confirmed", batch[0].target_url);
            } else {
              console.log("[native] cartel de confirmación no detectado (se comparte igual)");
              sendDebug("share-no-confirm", batch[0].target_url);
            }

            // 6) Marcar completadas TODAS las seleccionadas de una
            if (selectedTasks.length > 0) {
              var updates = [];
              for (var su = 0; su < selectedTasks.length; su++) updates.push({ task_id: selectedTasks[su].id });
              apiPost("/fb/completed", { task_updates: updates });
              console.log("[native] " + selectedTasks.length + " tarea(s) completada(s) en batch");
            }
            sharePublished = true;
          } catch (e) {
            console.error("[native] batch falló (intento " + attempt + "): " + e.message);
            if (isInterrupted(e)) {
              if (isEngineStopped()) {
                console.error("[native] script detenido por el usuario, saliendo");
                return;
              }
              console.error("[native] interrupción transitoria del árbol de accesibilidad, reintentando...");
              sleep(rnd(3000, 5000));
              continue; // siguiente intento del while interno
            }
            if (String(e.message).indexOf("SCREEN_UNLOCK_FAIL") >= 0) {
              // Pantalla no desbloqueable: NO marcar failed. Dejar las tareas
              // pendientes y saltar al delay entre posts para que el próximo
              // poll reintente el desbloqueo (el catch externo del loop ya
              // espera pollIntervalMs antes de volver a poll).
              console.error("[native] SCREEN_UNLOCK_FAIL: saltando al delay, tareas siguen pendientes");
              throw e;
            }
            try { apiPost("/fb/failed", { task_id: batch[0].id, error: e.message }); } catch (e2) {}
            if (String(e.message).indexOf("checkpoint") >= 0) {
              console.error("[native] checkpoint detectado → frenando relay");
              sendDebug("checkpoint-stop");
              return;
            }
            break;
          }
        }

        if (!sharePublished) {
          // Se agotaron los reintentos o falló sin checkpoint
          for (var mf = 0; mf < selectedTasks.length; mf++) {
            try { apiPost("/fb/failed", { task_id: selectedTasks[mf].id, error: "batch failed" }); } catch (e2) {}
          }
        }

        // Grupos que no se pudieron marcar → failed individual
        for (var mi = 0; mi < missingTasks.length; mi++) {
          try { apiPost("/fb/failed", { task_id: missingTasks[mi].id, error: "group not found in selection list" }); } catch (e2) {}
        }

        // Al terminar el post completo, limpiar la app (cerrar buscador) y
        // apagar+bloquear la pantalla hasta el próximo batch (despierta a
        // demanda cuando llegue una tarea).
        cleanupAfterBatch();
        screenOffAndLock();
      }

      // Delay humano entre posts distintos
      var delay2 = rnd(CONFIG.betweenPostsMinDelayMs, CONFIG.betweenPostsMaxDelayMs);
      console.log("[native] esperando " + Math.round(delay2 / 1000) + "s...");
      sleep(delay2);

    } catch (e) {
      if (isInterrupted(e)) {
        if (isEngineStopped()) {
          console.error("[native] script detenido por el usuario, saliendo");
          return;
        }
        // Interrupción transitoria del árbol de accesibilidad (p.ej. al apagar
        // la pantalla tras un batch): el engine sigue vivo, no es un stop real.
        // Reintentar en vez de salir: salir sin liberar bien el flujo era lo que
        // dejaba el relay muerto tras apagar la pantalla.
        console.error("[native] interrupción transitoria del árbol, reintentando...");
        sleep(rnd(2000, 4000));
        continue;
      }
      console.error("[native] error de loop: " + e.message);
      sleep(CONFIG.pollIntervalMs);
    }
  }
}

mainLoop();