/**
 * fb-native-relay.js  —  Relay nativo de Facebook para AutoJs6
 *
 * Replica/comparte un post (action='share') en grupos vía la app NATIVA de
 * Facebook usando el accessibility service de AutoJs6. Corre 100% on-device,
 * sin ADB ni PC. Pollea la misma cola del VPS que usa fb-relay.js.
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
  // Delay humano entre tareas (ms) — compartir grupo a grupo como un humano
  minDelayMs: 90 * 1000,
  maxDelayMs: 180 * 1000,
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
  // desarrollador). Ideal para un relay 24/7 que vive enchufado: así la
  // pantalla nunca se apaga y no hace falta despertarla. Requiere Shizuku.
  stayAwakeWhileCharging: true,
  // Patrón del PIN: dónde buscar cada dígito en el keypad del lock screen.
  // Samsung OneUI suele exponer los números como text()/desc(). Con pinPattern
  // vacío se busca el dígito como texto; si no aparece, usar sendDebug para
  // inspeccionar y ajustar.
  pinDigitsLabels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
};

var API_BASE = CONFIG.apiBase;
var TOKEN = CONFIG.token;

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

// Click en un nodo por texto/desc con reintentos cortos.
function clickLabel(labels, timeoutMs, scrollIntoView) {
  var deadline = Date.now() + (timeoutMs || CONFIG.findTimeoutMs);
  var logged = false;
  while (Date.now() < deadline) {
    var node = findNode(labels, 2000);
    if (node) {
      try {
        if (scrollIntoView) node.scrollForward();
        if (tapStrategy(node, 0)) return true;
      } catch (e) {}
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

// Thread heartbeat: renueva el timestamp del lock mientras la instancia vive.
// Así una instancia viva nunca parece stale, y una muerta libera el lock
// apenas pasa el stale (5 min) en vez de bloquear 30 min.
var heartbeatThread = null;
function startHeartbeat() {
  try {
    heartbeatThread = threads.start(function () {
      while (true) {
        try {
          var lockFile = getLockPath();
          files.write(lockFile, String(Date.now()));
        } catch (e) {}
        sleep(60 * 1000);
      }
    });
  } catch (e) {
    console.log("[native] heartbeat no disponible: " + e.message);
  }
}

function stopHeartbeat() {
  try { if (heartbeatThread) heartbeatThread.interrupt(); } catch (e) {}
}

// Watchdog del loop principal: si el loop no actualiza el heartbeat por más de
// WATCHDOG_STALE_MS, se relanza este mismo script con engines.execScriptFile
// para que el relay nunca quede caído tras un cuelgue/excepción interna.
var watchdogThread = null;
var WATCHDOG_STALE_MS = 10 * 60 * 1000; // 10 min sin heartbeat del loop
var lastLoopHeartbeat = Date.now();

function markLoopHeartbeat() {
  lastLoopHeartbeat = Date.now();
}

function startWatchdog() {
  try {
    watchdogThread = threads.start(function () {
      while (true) {
        sleep(60 * 1000);
        var stale = Date.now() - lastLoopHeartbeat;
        if (stale > WATCHDOG_STALE_MS) {
          console.error("[native] watchdog: loop sin heartbeat " + Math.round(stale / 1000) + "s, relanzando script");
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
          break;
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

// Detecta si hay otra instancia de este mismo script corriendo (más robusto
// que el lock de archivo, que no frenó los duplicados).
function otherInstanceRunning() {
  try {
    var all = engines.all();
    var me = engines.myEngine();
    var mineSource = "";
    try { mineSource = String(me && me.getSource ? me.getSource() : ""); } catch (e) {}
    var count = 0;
    for (var i = 0; i < all.length; i++) {
      try {
        var src = String(all[i].getSource());
        if (src.indexOf("fb-native-relay") >= 0) {
          if (mineSource && src === mineSource) continue; // soy yo
          count++;
        }
      } catch (e2) {}
    }
    return count > 0;
  } catch (e) {
    return false;
  }
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
  // Post de página: /{pageId}/posts/{postId} o /{pageId}/post/{postId}
  var m = u.match(/facebook\.com\/([^\/]+)\/(?:posts|post)\/(\d+)/);
  if (m) return "fb://post/" + m[2];
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

function openPostInFB(url) {
  // Shizuku es OBLIGATORIO para el deep link: sin "am start" vía ADB, abrir FB
  // con app.intent/app.openUrl deja la app en el home sin navegar al post (el
  // share buscaría "Compartir" en el feed). Frenar claro en vez de fallar raro.
  if (!shizukuAvailable()) {
    throw new Error("Shizuku no disponible: no se puede navegar al post (FB quedaría en home)");
  }

  // Deep link nativo primero: abre la vista real del post (no el webview).
  var dl = null;
  try { dl = fbDeepLinkFor(url); } catch (e) {}
  var target = dl || url;
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
  }
  try {
    var intent = app.intent({
      action: "android.intent.action.VIEW",
      data: target,
      packageName: CONFIG.fbPackage,
      flags: ["activity_new_task", "activity_turn_screen_on"],
    });
    app.startActivity(intent);
  } catch (e) {
    app.openUrl(target); // fallback: deep link genérico (FB igual lo toma)
  }
  // Esperar a que la app de FB quede en primer plano
  var deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      var cur = currentPackage();
      if (cur && cur.indexOf("com.facebook") >= 0) return;
    } catch (e2) {}
    sleep(500);
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
  ensureUnlocked();
  sleep(rnd(1500, 2500));
  openPostInFB(url);
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
    }
  } catch (e) {
    console.log("[native] no se pudo leer la app en primer plano: " + e.message);
  }

  // 2) Si hay checkpoint o sesión expirada → frenar
  var cp = checkCheckpoint();
  if (cp) throw new Error("checkpoint: " + cp);

  // 3) Botón Compartir (icono en app nativa → content-desc)
  var shareLabels = ["Compartir", "Share", "Compartir publicación", "Compartir esta publicación", "Share post", "Share this post"];
  var ok = clickLabel(shareLabels, t, true);
  if (!ok) {
    // Fallback: menú "..." del post → "Compartir"
    var moreLabels = ["Más opciones", "More options", "Ver más", "See more", "Más"];
    if (clickLabel(moreLabels, 8000, true)) {
      sleep(rnd(1500, 2500));
      ok = clickLabel(shareLabels, 10000, false);
    }
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
  for (var attempt = 0; attempt < 9 && !searchOpened; attempt++) {
    var target = findNode(groupLabels, 3000);
    if (target) {
      console.log("[native] tap directo 'Grupo' intento " + (attempt + 1) + " (estr " + attempt + ")");
      tapStrategy(target, attempt);
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
    for (var attempt2 = 0; attempt2 < 9 && !searchOpened; attempt2++) {
      var target2 = findNode(group2Labels, 3000);
      if (target2) {
        console.log("[native] tap 'En un grupo' intento " + (attempt2 + 1) + " (estr " + attempt2 + ")");
        tapStrategy(target2, attempt2);
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

  // Fallback posicional: el resultado del buscador aparece justo debajo del box
  // (a veces el row no expone el texto completo o difiere en mayúsculas).
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
// suele fallar → usar Shizuku (ADB) primero y luego cascada:
//   Shizuku input keyevent 224 (KEYCODE_WAKEUP) → wakeUpIfNeeded → wakeUp →
//   keyCode(224) → shell root.
// Devolver true si al final la pantalla quedó encendida.
function wakeScreenIfNeeded() {
  try {
    if (device.isScreenOn && device.isScreenOn()) return true;
  } catch (e) {}

  // Shizuku: KEYCODE_WAKEUP (224) enciende la pantalla con privilegios ADB,
  // funciona en Samsung sin root. Algunos dispositivos con AOD necesitan el
  // POWER (26) para salir del modo reloj.
  try {
    if (shizukuAvailable()) {
      shizukuCmd("input keyevent 224");
      sleep(1200);
      if (device.isScreenOn && device.isScreenOn()) return true;
      shizukuCmd("input keyevent 26");
      sleep(1200);
      if (device.isScreenOn && device.isScreenOn()) return true;
    }
  } catch (e) {}

  // AOD de Samsung: isScreenOn devuelve false aunque esté mostrando el reloj.
  // Si el paquete visible es AOD/keyguard/systemui, la pantalla está visible
  // → no gastar intentos de wake ni mandar el falso "screen-wake-fail".
  try {
    var cur = currentPackage() || "";
    if (cur.indexOf("aodservice") >= 0 || cur.indexOf("keyguard") >= 0 || cur.indexOf("systemui") >= 0) return true;
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
    if (device.isScreenOn && device.isScreenOn()) {
      return true;
    }
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
      console.log("[native] no se pudo encender la pantalla");
      sendDebug("screen-wake-fail");
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
            console.log("[native] intento " + (pass + 1) + ": keypad no visible aún, reintentando swipe...");
            continue;
          }
        } else {
          // Darle medio segundo al dismiss-keyguard para mostrar el keypad
          sleep(600);
        }
        console.log("[native] desbloqueando con PIN" + (useKeyevents ? " (keyevents)" : "") + "...");
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
      if (!unlocked) console.log("[native] intento " + (pass + 1) + " de desbloqueo sin éxito, reintentando...");
    }

    if (unlocked) console.log("[native] pantalla desbloqueada");
    else console.log("[native] pantalla aún bloqueada");
    return unlocked;
  } catch (e) {
    console.log("[native] ensureUnlocked falló: " + e.message);
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

  // NO pedir captura de pantalla acá: en Android eso abre el diálogo
  // "compartir pantalla" (MediaProjection) que hay que tocar a mano en cada
  // inicio y bloquea el arranque automático. La captura solo se pide bajo
  // demanda dentro de sendDebug() cuando hay un fallo real.

  if (otherInstanceRunning()) {
    console.error("[native] otra instancia corriendo, saliendo");
    exit();
  }

  if (!acquireLock()) {
    console.error("[native] lock ocupado, saliendo");
    exit();
  }

  startHeartbeat();

  try {
    runPollLoop();
  } catch (e) {
    console.error("[native] error fatal: " + e);
    console.error(e && e.stack ? e.stack : "");
    sleep(10000);
  }

  releaseLock();
  stopHeartbeat();
  stopWatchdog();
  cancelScreenAwake();
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
    if (eng && typeof eng.isStopped === "function") return eng.isStopped();
  } catch (e) {}
  return false;
}

function runPollLoop() {
  while (true) {
    keepScreenAwake();
    markLoopHeartbeat();
    wakeScreenIfNeeded();
    try {
      // Traer varias tareas pendientes y agruparlas por post (target_url): las
      // del mismo post se comparten en batch reutilizando el buscador (borra el
      // texto, escribe el próximo grupo y continúa), en vez de reiniciar todo.
      var data = apiGet("/fb/pending?limit=10&action=share");
      var tasks = data.tasks || [];
      if (tasks.length === 0) {
        // Sin tareas: dormir por tramos renovando el wake lock y reintentando
        // el wake, así la pantalla queda encendida/despierta cuando llegue una
        // publicación (a demanda, cualquier hora).
        var idleDeadline = Date.now() + CONFIG.pollIntervalMs;
        while (Date.now() < idleDeadline) {
          keepScreenAwake();
          wakeScreenIfNeeded();
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

        for (var b = 0; b < batch.length; b++) {
          var task = batch[b];
          var taskDone = false;
          var maxAttempts = 3;
          for (var attempt = 1; attempt <= maxAttempts && !taskDone; attempt++) {
            if (attempt > 1) {
              console.log("[native] reintentando tarea " + task.id + " (intento " + attempt + ")");
              // FB quedó en estado incierto tras la interrupción → arrancar limpio
              try {
                if (shizukuAvailable()) shizukuCmd("am force-stop com.facebook.katana");
              } catch (e9) {}
              sleep(rnd(4000, 6000));
            } else {
              console.log("[native] tarea " + task.id + " (share)");
            }
            try {
              if (b === 0) {
                openPostAndShareGroup(task);
                searchGroupAndPublish(task);
              } else {
                searchGroupAndPublish(task);
              }
              apiPost("/fb/completed", { task_updates: [{ task_id: task.id }] });
              console.log("[native] tarea " + task.id + " completada");
              taskDone = true;
            } catch (e) {
              console.error("[native] tarea " + task.id + " falló (intento " + attempt + "): " + e.message);
              if (isInterrupted(e)) {
                // Distinguir: stop manual del usuario (engine muerto) vs
                // interrupción transitoria del árbol de accesibilidad (engine vivo).
                if (isEngineStopped()) {
                  console.error("[native] script detenido por el usuario, saliendo");
                  try { apiPost("/fb/failed", { task_id: task.id, error: "script interrupted" }); } catch (e2) {}
                  return;
                }
                console.error("[native] interrupción transitoria del árbol de accesibilidad, reintentando...");
                sleep(rnd(3000, 5000));
                continue; // siguiente intento del while interno
              }
              try { apiPost("/fb/failed", { task_id: task.id, error: e.message }); } catch (e2) {}
              if (String(e.message).indexOf("checkpoint") >= 0) {
                console.error("[native] checkpoint detectado → frenando relay");
                sendDebug("checkpoint-stop");
                return;
              }
              // Si falló un grupo, no seguir con el resto del mismo post
              taskDone = true; // marcar terminada para salir del while interno
              break;
            }
          }

          if (!taskDone) {
            // Se agotaron los reintentos por interrupción transitoria
            console.error("[native] tarea " + task.id + " sin éxito tras " + maxAttempts + " intentos");
            try { apiPost("/fb/failed", { task_id: task.id, error: "transient interrupted after retries" }); } catch (e2) {}
            break;
          }

          // Delay humano entre grupos del mismo post
          var delay = rnd(CONFIG.minDelayMs, CONFIG.maxDelayMs);
          console.log("[native] esperando " + Math.round(delay / 1000) + "s entre grupos...");
          sleep(delay);
        }

        // Al terminar el post completo, limpiar la app (cerrar buscador).
        cleanupAfterBatch();
      }

      // Delay humano entre posts distintos
      var delay2 = rnd(CONFIG.minDelayMs, CONFIG.maxDelayMs);
      console.log("[native] esperando " + Math.round(delay2 / 1000) + "s...");
      sleep(delay2);

    } catch (e) {
      if (isInterrupted(e)) {
        console.error("[native] script interrumpido, saliendo");
        return;
      }
      console.error("[native] error de loop: " + e.message);
      sleep(CONFIG.pollIntervalMs);
    }
  }
}

mainLoop();