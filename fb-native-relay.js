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
  // Delay humano entre tareas (ms) — compartir grupo a grupo como un humano
  minDelayMs: 90 * 1000,
  maxDelayMs: 180 * 1000,
  // Package de la app nativa de Facebook
  fbPackage: "com.facebook.katana",
  // Cuánto esperar cada selector (ms)
  findTimeoutMs: 15000,
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
function findNode(labels, timeoutMs) {
  var t = timeoutMs || CONFIG.findTimeoutMs;
  var candidates = [];
  for (var i = 0; i < labels.length; i++) {
    var lab = labels[i];
    candidates.push(text(lab));
    candidates.push(desc(lab));
    candidates.push(descContains(lab));
    candidates.push(textContains(lab));
  }
  for (var j = 0; j < candidates.length; j++) {
    var node = candidates[j].findOne(t);
    if (node && node.visibleToUser()) return node;
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

// Click por coordenadas en el centro del nodo. node.click() (ACTION_CLICK)
// no aterriza en los views custom de Facebook; el gesto real sí.
function clickNodeCenter(node) {
  try {
    var b = node.bounds();
    var x = Math.round(b.centerX());
    var y = Math.round(b.centerY());
    click(x, y);
    return true;
  } catch (e) {
    try { node.click(); return true; } catch (e2) {}
  }
  return false;
}

// Click "en capas": primero el nodo, luego su ancestro clickable, luego un
// press con duración (más físico) y por último ACTION_CLICK nativo.
function clickLayered(node) {
  // Estrategia 1: centro del nodo encontrado
  if (clickNodeCenter(node)) {
    sleep(600);
    return true;
  }
  // Estrategia 2: centro del ancestro clickable (el row)
  var anc = clickableAncestor(node);
  if (anc) {
    try {
      var b = anc.bounds();
      click(Math.round(b.centerX()), Math.round(b.centerY()));
      sleep(600);
      return true;
    } catch (e) {}
  }
  // Estrategia 3: press con duración (tap más parecido al dedo real)
  try {
    var bb = node.bounds();
    press(Math.round(bb.centerX()), Math.round(bb.centerY()), 100);
    sleep(600);
    return true;
  } catch (e) {}
  // Estrategia 4: ACTION_CLICK nativo
  try { node.click(); return true; } catch (e) {}
  return false;
}

// Doble tap en el centro del nodo (varios selectores de FB requieren doble tap).
function doubleTapNode(node) {
  try {
    var b = node.bounds();
    var x = Math.round(b.centerX());
    var y = Math.round(b.centerY());
    click(x, y);
    sleep(250);
    click(x, y);
    return true;
  } catch (e) {
    return false;
  }
}

// Click en un nodo por texto/desc con reintentos cortos.
function clickLabel(labels, timeoutMs, scrollIntoView) {
  var deadline = Date.now() + (timeoutMs || CONFIG.findTimeoutMs);
  while (Date.now() < deadline) {
    var node = findNode(labels, 2000);
    if (node) {
      try {
        if (scrollIntoView) node.scrollForward();
        if (clickNodeCenter(node)) return true;
      } catch (e) {}
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
      if (txt && txt.trim()) out.push({ t: txt, d: "" });
    }
    var withDesc = descMatches(/.*/).find();
    for (var j = 0; j < withDesc.length && out.length < cap; j++) {
      var m = withDesc[j];
      var d = "";
      try { d = m.desc() || ""; } catch (e) {}
      if (d && d.trim()) out.push({ t: "", d: d });
    }
  } catch (e) {
    out.push({ t: "dumpUi error: " + e.message, d: "" });
  }
  return out;
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
      console.log("  [" + (n.t || "-") + "] | desc: " + (n.d || "-"));
    }
    try {
      var img = images.captureScreen();
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

function openPostInFB(url) {
  try {
    var intent = app.intent({
      action: "android.intent.action.VIEW",
      data: url,
      packageName: CONFIG.fbPackage,
    });
    app.startActivity(intent);
  } catch (e) {
    app.openUrl(url); // fallback: deep link genérico (FB igual lo toma)
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

function shareToGroup(task) {
  var url = task.target_url;
  var groupName = task.group_name || task.fb_group_id;
  var message = task.message || "";
  var t = CONFIG.findTimeoutMs;

  console.log("[native] compartiendo en: " + groupName);

  // 1) Abrir el post en la app nativa
  openPostInFB(url);
  sleep(rnd(4000, 7000));

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

  // 4) En el modal: abrir el selector de destino. El nodo "Feed" tiene el hint
  //    "Elige el destino de tu publicación, Feed. Toca dos veces para ver más
  //    opciones." → se abre con DOBLE TAP.
  var destLabels = ["Feed", "Elige el destino de tu publicación", "Your Feed"];
  var destNode = findNode(destLabels, 8000);
  if (destNode && doubleTapNode(destNode)) {
    console.log("[native] selector de destino abierto (doble tap)");
    sleep(rnd(2000, 3000));
  } else {
    sendDebug("no-dest-selector", url);
    throw new Error("Dest selector not found");
  }

  // 5) En la ventana de destino: click en "En un grupo" con verificación de que
  //    se abrió el buscador (EditText). Si el tap no aterriza, reintentar.
  var groupLabels = ["En un grupo", "In a group", "Un grupo", "Grupo", "Compartir en un grupo", "Share to a group"];
  var searchOpened = false;
  for (var attempt = 0; attempt < 3 && !searchOpened; attempt++) {
    var target = findNode(groupLabels, 3000);
    if (target) {
      console.log("[native] tap en 'En un grupo' (intento " + (attempt + 1) + ")");
      clickLayered(target);
      sleep(rnd(2000, 3000));
    }
    var edit = className("android.widget.EditText").findOne(1000);
    searchOpened = !!(edit && edit.visibleToUser());
  }
  if (!searchOpened) {
    sendDebug("no-share-to-group", url);
    throw new Error("Share to group not found");
  }

  // 6) Buscar el grupo
  ok = typeIntoEditText(groupName, t);
  if (!ok) {
    sendDebug("no-group-search", url);
    throw new Error("Group search input not found");
  }
  if (!waitEditTextHas(groupName, 8000)) {
    sendDebug("group-search-no-text", url);
    throw new Error("Group name not typed");
  }
  sleep(rnd(2000, 4000));

  // 7) Seleccionar el row del grupo
  ok = clickLabel([groupName], t, true);
  if (!ok) {
    sendDebug("group-row-not-found", url);
    throw new Error("Group row not found: " + groupName);
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
  sleep(rnd(3000, 5000));

  return true;
}

// ─── Loop principal ───────────────────────────────────────────────────────

// Mantiene la pantalla encendida (wake lock de AutoJs6). keepScreenOn acepta
// duración en ms, NO boolean. Se renueva periódicamente para no vencerse.
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

function wakeScreenIfNeeded() {
  try {
    if (device.isScreenOn && !device.isScreenOn()) {
      device.wakeUpIfNeeded();
    }
  } catch (e) {}
}

function mainLoop() {
  console.show();
  console.log("[native] fb-native-relay iniciado");

  // Mantener pantalla encendida mientras el relay corre
  keepScreenAwake();

  // Habilitar captura de pantalla para los debug (requestScreenCapture puede fallar)
  try {
    images.requestScreenCapture(10000);
  } catch (e) {
    console.log("[native] screen capture no disponible: " + e.message);
  }

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
  cancelScreenAwake();
  exit();
}

function isInterrupted(e) {
  var name = String(e && e.constructor ? e.constructor.name : e);
  var msg = String(e && e.message ? e.message : e);
  return name.indexOf("Interrupted") >= 0 || msg.indexOf("interrupted") >= 0;
}

function runPollLoop() {
  while (true) {
    keepScreenAwake();
    wakeScreenIfNeeded();
    try {
      var data = apiGet("/fb/pending?limit=1&action=share");
      var tasks = data.tasks || [];
      if (tasks.length === 0) {
        sleep(CONFIG.pollIntervalMs);
        continue;
      }

      var task = tasks[0];
      console.log("[native] tarea " + task.id + " (share)");
      try {
        shareToGroup(task);
        apiPost("/fb/completed", { task_updates: [{ task_id: task.id }] });
        console.log("[native] tarea " + task.id + " completada");
      } catch (e) {
        console.error("[native] tarea " + task.id + " falló: " + e.message);
        if (isInterrupted(e)) {
          console.error("[native] script interrumpido, saliendo");
          try { apiPost("/fb/failed", { task_id: task.id, error: "script interrupted" }); } catch (e2) {}
          return;
        }
        try { apiPost("/fb/failed", { task_id: task.id, error: e.message }); } catch (e2) {}
        if (String(e.message).indexOf("checkpoint") >= 0) {
          console.error("[native] checkpoint detectado → frenando relay");
          sendDebug("checkpoint-stop");
          return;
        }
      }

      // Delay humano entre grupos
      var delay = rnd(CONFIG.minDelayMs, CONFIG.maxDelayMs);
      console.log("[native] esperando " + Math.round(delay / 1000) + "s...");
      sleep(delay);

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