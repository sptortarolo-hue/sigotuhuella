const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Sigo tu huella — Ciclo de vida de una publicaci&oacute;n</title>
  <style>
    @page { margin: 12mm 12mm; size: A4; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.4; font-size: 10pt; }

    /* PORTADA */
    .cover { page-break-after: always; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 90vh; text-align: center; padding: 30px; }
    .cover-logo { width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; box-shadow: 0 8px 24px rgba(233,30,99,0.3); overflow: hidden; }
    .cover-logo img { width: 100px; height: 100px; object-fit: contain; }
    .cover h1 { font-size: 28pt; color: #E91E63; margin-bottom: 6px; font-weight: 700; }
    .cover h2 { font-size: 14pt; color: #666; font-weight: 400; margin-bottom: 20px; }
    .cover-meta { margin-top: 30px; font-size: 9pt; color: #999; }
    .cover-meta p { margin: 3px 0; }

    /* HEADINGS */
    h1 { font-size: 14pt; color: #E91E63; margin: 14px 0 6px 0; border-bottom: 2px solid #E91E63; padding-bottom: 4px; }
    h2 { font-size: 11pt; color: #FF5722; margin: 10px 0 4px 0; }
    h3 { font-size: 10pt; color: #555; margin: 8px 0 3px 0; }
    p { margin: 3px 0; text-align: justify; }
    ul, ol { margin: 3px 0 3px 18px; }
    li { margin: 2px 0; }

    /* TABLES */
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 8.5pt; }
    th { background: #E91E63; color: white; padding: 5px 8px; text-align: left; font-weight: 600; }
    td { padding: 4px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #fafafa; }

    /* BOXES */
    .highlight-box { background: linear-gradient(135deg, #fce4ec, #fff3e0); border-left: 4px solid #E91E63; padding: 8px 12px; margin: 8px 0; border-radius: 0 6px 6px 0; }
    .highlight-box strong { color: #E91E63; }

    /* FLOW DIAGRAM */
    .flow-diagram { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; margin: 8px 0; font-family: 'Consolas', monospace; font-size: 8pt; line-height: 1.5; }
    .flow-diagram .node { display: inline-block; background: white; border: 2px solid #E91E63; border-radius: 6px; padding: 4px 8px; margin: 3px 0; font-family: 'Segoe UI', sans-serif; font-weight: 600; }
    .flow-diagram .node.green { border-color: #4CAF50; color: #4CAF50; }
    .flow-diagram .node.orange { border-color: #FF9800; color: #FF9800; }
    .flow-diagram .node.red { border-color: #f44336; color: #f44336; }
    .flow-diagram .arrow { color: #999; margin: 0 4px; }
    .flow-diagram .branch { margin-left: 20px; border-left: 2px solid #e0e0e0; padding-left: 10px; margin-top: 4px; }

    /* STEPS */
    .step-list { counter-reset: step; list-style: none; margin-left: 0; padding-left: 0; }
    .step-list li { counter-increment: step; padding: 5px 5px 5px 35px; position: relative; margin: 4px 0; background: #fafafa; border-radius: 6px; border: 1px solid #eee; }
    .step-list li::before { content: counter(step); position: absolute; left: 8px; top: 5px; width: 20px; height: 20px; background: #E91E63; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 8pt; }

    /* TAGS */
    .tag { display: inline-block; background: #E91E63; color: white; padding: 1px 6px; border-radius: 8px; font-size: 7pt; font-weight: 600; }
    .tag.green { background: #4CAF50; }
    .tag.orange { background: #FF9800; }
    .tag.blue { background: #2196F3; }
    .tag.red { background: #f44336; }
    .tag.gray { background: #9E9E9E; }

    /* FAQ */
    .faq-item { margin: 6px 0; padding: 6px 10px; background: #fafafa; border-radius: 6px; border-left: 3px solid #FF9800; font-size: 9pt; }
    .faq-item strong { color: #E91E63; }

    /* STATE DIAGRAM */
    .state-diagram { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 12px; margin: 8px 0; }
    .state-row { display: flex; align-items: center; margin: 4px 0; font-size: 8.5pt; }
    .state-box { display: inline-block; background: white; border: 2px solid #E91E63; border-radius: 6px; padding: 4px 10px; font-weight: 600; font-size: 8pt; text-align: center; }
    .state-box.start { background: #E91E63; color: white; border-radius: 20px; }
    .state-box.end { background: #4CAF50; color: white; border-radius: 20px; }
    .state-box.warning { border-color: #FF9800; color: #FF9800; }
    .state-box.danger { border-color: #f44336; color: #f44336; }
    .state-arrow { margin: 0 6px; color: #999; font-size: 10pt; }
    .state-label { font-size: 7pt; color: #888; font-style: italic; margin: 0 4px; }

    /* CODE */
    code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 8.5pt; color: #E91E63; }

    .page-break { page-break-before: always; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 2px solid #eee; text-align: center; font-size: 7.5pt; color: #999; }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="cover">
    <div class="cover-logo"><span>&#128062;</span></div>
    <h1>Sigo tu huella</h1>
    <h2>Ciclo de vida completo<br>de una publicaci&oacute;n</h2>
    <p style="font-size: 11pt; color: #777; max-width: 460px; margin: 0 auto;">
      Desde el reporte hasta la resuci&oacute;n: c&oacute;mo nace, se difunde,<br>
      se mantiene y se resuelve cada caso.
    </p>
    <div class="cover-meta">
      <p><strong>Versi&oacute;n:</strong> 1.0 &mdash; Agosto 2026</p>
      <p><strong>Plataforma:</strong> sigotuhuella.com.ar</p>
      <p><strong>Documento:</strong> Referencia interna &mdash; Equipo STH</p>
    </div>
  </div>

  <!-- INTRO -->
  <h1>Introducci&oacute;n</h1>
  <p>Este documento describe el recorrido completo de una publicaci&oacute;n en Sigo Tu Huella: desde que se reporta una mascota, pasando por su difusi&oacute;n con voluntarios y mantenimiento, hasta su resoluci&oacute;n o vencimiento.</p>

  <div class="highlight-box">
    <strong>Idea central:</strong> Cada mascota perdida genera un &ldquo;caso&rdquo; con un ciclo de vida de <strong>45 d&iacute;as activos + 30 d&iacute;as de gracia</strong>, manejado por voluntarios y un job autom&aacute;tico de recordatorios.
  </div>

  <!-- 1. FLUJO COMPLETO -->
  <h1>1. Flujo completo</h1>

  <h2>Or&iacute;genes de publicaci&oacute;n</h2>
  <div class="flow-diagram">
    <div>
      <span class="node">App p&uacute;blica /reportar</span>
      <span class="node">Mi Portal (due&ntilde;o)</span>
      <span class="node">Bot WhatsApp</span>
      <span class="node">Chapita QR</span>
    </div>
    <div class="branch">
      <span class="arrow">&darr;</span> Creaci&oacute;n de mascota + barrios + caso STH#####<br>
    </div>

    <div style="margin-top: 8px;">
      <span class="node orange">Scraper FB/IG</span>
      <span class="state-label">(NO crea mascota)</span>
    </div>
    <div class="branch">
      <span class="arrow">&darr;</span> Matching contra casos vigentes<br>
      <span style="margin-left: 16px;">
        <span class="arrow">&rarr;</span> <span class="node green">Coincidencia</span> &rarr; Seguimiento<br>
        <span class="arrow">&rarr;</span> <span class="node">Sin match</span> &rarr; Novedad para revisi&oacute;n
      </span>
    </div>

    <div style="margin-top: 10px; border-top: 1px solid #e0e0e0; padding-top: 8px;">
      <strong style="color: #E91E63;">Despu&eacute;s de la creaci&oacute;n:</strong><br>
      <span class="node">Estado inicial</span>
      <div class="branch" style="margin-top: 4px;">
        <span class="arrow">&darr;</span> <code>lost</code> / <code>transitada</code> &rarr; <span class="node red">Caso LOST</span><br>
        <span class="arrow">&darr;</span> <code>found</code> / <code>retained</code> / <code>accidented</code> / <code>needs_attention</code> &rarr; <span class="node orange">Caso FOUND</span><br>
        <span class="arrow">&darr;</span> <code>sighted</code> &rarr; <span class="node">Sin caso &middot; caduca 14 d&iacute;as</span><br>
        <span class="arrow">&darr;</span> <code>for_adoption*</code> &rarr; <span class="node gray">Ciclo propio (fuera)</span>
      </div>
      <div style="margin-top: 6px;">
        <span class="arrow">&darr;</span> <span class="node green">Difusi&oacute;n inicial</span>
        <span class="state-label">(Push + muro + Cola de Difusi&oacute;n)</span><br>
        <span class="arrow">&darr;</span> <span class="node" style="background: #E91E63; color: white;">CASO ACTIVO</span>
        <span class="state-label">active_until = +45 d&iacute;as</span>
      </div>
    </div>
  </div>

  <!-- 2. M&Aacute;QUINA DE ESTADOS -->
  <h1 class="page-break">2. M&aacute;quina de estados del caso</h1>

  <div class="state-diagram">
    <div class="state-row">
      <span class="state-box start">[*]</span>
      <span class="state-arrow">&rarr;</span>
      <span class="state-box">Activo</span>
      <span class="state-label">= publicaci&oacute;n + difusi&oacute;n inicial</span>
    </div>

    <div style="margin-left: 24px; margin-top: 4px; font-size: 8pt; color: #666;">
      <div style="margin: 2px 0;">
        <span class="state-box" style="border-color: #2196F3;">Activo</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box" style="border-color: #2196F3;">Activo</span>
        <span class="state-label">= avistajes / timeline / shares / repost cada 5 d&iacute;as</span>
      </div>

      <div style="margin: 4px 0;">
        <span class="state-box">Activo</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box warning">Por Vencer</span>
        <span class="state-label">= D-7 y D-1 recordatorio al reportante</span>
      </div>

      <div style="margin: 2px 0; margin-left: 16px;">
        <span class="state-box warning">Por Vencer</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box">Activo</span>
        <span class="state-label">= renueva (+45 d&iacute;as), vuelve al tope</span>
      </div>

      <div style="margin: 2px 0; margin-left: 16px;">
        <span class="state-box warning">Por Vencer</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box danger">Vencido</span>
        <span class="state-label">= pasa active_until</span>
      </div>

      <div style="margin: 4px 0;">
        <span class="state-box danger">Vencido</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box danger">Vencido</span>
        <span class="state-label">= visible con banner, pausado en cola</span>
      </div>

      <div style="margin: 2px 0; margin-left: 16px;">
        <span class="state-box danger">Vencido</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box">Activo</span>
        <span class="state-label">= renueva (= relist), vuelve al tope</span>
      </div>

      <div style="margin: 2px 0; margin-left: 16px;">
        <span class="state-box danger">Vencido</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box" style="border-color: #9E9E9E; color: #9E9E9E;">Archivado</span>
        <span class="state-label">= +30 d&iacute;as sin renovar (job diario)</span>
      </div>

      <div style="margin: 4px 0;">
        <span class="state-box" style="border-color: #9E9E9E; color: #9E9E9E;">Archivado</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box">Activo</span>
        <span class="state-label">= reactivar desde Mi Portal (+45 d&iacute;as fresh)</span>
      </div>

      <div style="margin-top: 6px; border-top: 1px solid #e0e0e0; padding-top: 6px;">
        <span class="state-box">Activo</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box end">Resuelto</span>
        <span class="state-label">= reunited &middot; push a colaboradores</span>
      </div>
      <div style="margin: 2px 0;">
        <span class="state-box">Activo</span>
        <span class="state-arrow">&rarr;</span>
        <span class="state-box end">Adoptado</span>
        <span class="state-label">= adopted &middot; cierre con texto generado</span>
      </div>
    </div>
  </div>

  <!-- 3. OR&Iacute;GENES -->
  <h1>3. Or&iacute;genes de publicaci&oacute;n</h1>
  <table>
    <tr><th>Origen</th><th>Endpoint / c&oacute;digo</th><th>Qu&eacute; dispara</th></tr>
    <tr><td>App p&uacute;blica (<code>/reportar</code>)</td><td><code>POST /api/pets</code></td><td>Mascota + barrios elegidos + caso</td></tr>
    <tr><td>Mi Portal (due&ntilde;o)</td><td><code>POST /api/my-pets/:id/report-lost</code></td><td>Caso sobre mascota registrada; extrae barrios de <code>location</code> con <code>extractNeighborhoods()</code></td></tr>
    <tr><td>Bot WhatsApp</td><td><code>server/services/whatsappBot.js</code></td><td>Mascota + caso + <code>extractNeighborhoods()</code></td></tr>
    <tr><td>Chapita QR</td><td><code>server/routes/requestChapita.js</code></td><td>Reporte sobre mascota ya registrada</td></tr>
    <tr><td>Scraper FB/IG</td><td>webhook <code>/api/facebook/webhook</code></td><td>Guarda en <code>facebook_posts</code>; el matching (<code>geminiMatching.js</code>) lo cruza <strong>solo contra casos vigentes</strong></td></tr>
  </table>

  <!-- 4. ESTADOS -->
  <h1>4. Estados y qu&eacute; le aplica a cada uno</h1>
  <table>
    <tr><th>Estado</th><th>&iquest;Genera caso?</th><th>Ciclo 45+30d</th><th>Prioridad en cola</th><th>Notas</th></tr>
    <tr><td><code>lost</code></td><td>S&iacute; (tipo <em>lost</em>)</td><td>S&iacute;</td><td>Normal</td><td>Caso central</td></tr>
    <tr><td><code>transitada</code></td><td>S&iacute; (tipo <em>lost</em>)</td><td>S&iacute;</td><td>Normal</td><td>Buscar due&ntilde;o sigue siendo la meta</td></tr>
    <tr><td><code>found</code></td><td>S&iacute; (tipo <em>found</em>)</td><td>S&iacute;</td><td>Normal</td><td>Decae r&aacute;pido igual que perdida</td></tr>
    <tr><td><code>retained</code></td><td>S&iacute; (tipo <em>found</em>)</td><td>S&iacute;</td><td>Normal</td><td>Alguien la custodia temporalmente</td></tr>
    <tr><td><code>needs_attention</code></td><td>S&iacute; (tipo <em>found</em>)</td><td>S&iacute;</td><td><span class="tag red">Tope</span></td><td>Requiere acci&oacute;n urgente</td></tr>
    <tr><td><code>accidented</code></td><td>S&iacute; (tipo <em>found</em>)</td><td>S&iacute;</td><td><span class="tag red">Tope</span></td><td>Urgencia m&aacute;xima mientras activa</td></tr>
    <tr><td><code>sighted</code></td><td>No</td><td>Vigencia propia <strong>14 d&iacute;as</strong></td><td>&mdash;</td><td>Se&ntilde;al ef&iacute;mera; filtro por fecha en queries</td></tr>
    <tr><td><code>for_adoption</code> / <code>for_adoption_simple</code></td><td>No</td><td>Fuera</td><td>&mdash;</td><td>Ciclo propio de adopciones</td></tr>
    <tr><td><code>adopted</code> / <code>reunited</code></td><td>Cierra el caso</td><td>Terminal</td><td>&mdash;</td><td>Quedan como historial</td></tr>
    <tr><td><em>(nuevo)</em> caso <code>archived</code></td><td>&mdash;</td><td>Terminal-reactivable</td><td>&mdash;</td><td>Solo visible para el due&ntilde;o; reactivable</td></tr>
  </table>

  <!-- 5. EL CICLO FASE POR FASE -->
  <h1 class="page-break">5. El ciclo fase por fase</h1>

  <h2>Creaci&oacute;n</h2>
  <ul>
    <li>Se inserta la mascota y se genera el n&uacute;mero de caso secuencial <code>STH#####</code>.</li>
    <li>Los barrios se toman de la selecci&oacute;n del usuario o se extraen del texto libre con <code>extractNeighborhoods()</code> (<code>server/services/geocoding.js</code>).</li>
    <li><code>createPetCase()</code> crea la fila en <code>pet_cases</code> con <code>active_until = NOW() + 45 d&iacute;as</code>.</li>
  </ul>

  <h2>Difusi&oacute;n inicial (100% voluntario-c&eacute;ntrica)</h2>
  <ul>
    <li>Push/in-app a voluntarios suscriptos a agrupaciones cuyos barrios cubren la zona (<strong>matching tolerante</strong> a acentos/may&uacute;sculas).</li>
    <li>La mascota aparece en el dashboard de voluntarios y en la <strong>Cola de Difusi&oacute;n</strong>, bucket &ldquo;Nuevos&rdquo;.</li>
    <li>Es visible en el muro p&uacute;blico y ficha.</li>
  </ul>

  <h2>Seguimiento</h2>
  <ul>
    <li>Avistajes (<code>case_sightings</code>), timeline de eventos (<code>case_events</code>), seguidores (<code>case_followers</code>).</li>
    <li>Cada share manual de un voluntario registra <code>share_logs</code> + evento <code>social_shared</code>, lo que alimenta los buckets de la cola.</li>
    <li>El scraper cruza novedades nuevas contra casos abiertos <strong>vigentes</strong> (vencidos/archivados quedan excluidos).</li>
  </ul>

  <h2>Mantenimiento: Cola de Difusi&oacute;n</h2>
  <p>Endpoint <code>GET /api/volunteers/diffusion-queue</code>. Devuelve 4 buckets calculados por voluntario:</p>
  <table>
    <tr><th>Bucket</th><th>Criterio</th></tr>
    <tr><td><span class="tag blue">Nuevos</span></td><td>Nunca compartida por ese voluntario</td></tr>
    <tr><td><span class="tag orange">Repostear</span></td><td>&Uacute;ltimo share propio hace m&aacute;s de 5 d&iacute;as</td></tr>
    <tr><td><span class="tag green">Al d&iacute;a</span></td><td>&Uacute;ltimo share hace &le; 5 d&iacute;as</td></tr>
    <tr><td><span class="tag gray">Pausados</span></td><td>Caso activo pero vencido (esperando renovaci&oacute;n del reportante)</td></tr>
  </table>
  <ul>
    <li>Solo entran los 6 estados con caso; orden interno: <code>accidented</code>/<code>needs_attention</code> primero, luego m&aacute;s recientes.</li>
    <li>Filtro por barrios suscriptos del voluntario (match tolerante).</li>
  </ul>

  <h2>Recordatorios y vencimiento (job diario)</h2>
  <p><code>runLifecycleCycle()</code> en <code>server/services/lifecycleJob.js</code> corre cada 24 h:</p>
  <table>
    <tr><th>Momento</th><th>Acci&oacute;n</th></tr>
    <tr><td>D-7 (ventana 6&ndash;8 d&iacute;as restantes)</td><td>Push + notificaci&oacute;n in-app al reportante</td></tr>
    <tr><td>D-1 (ventana 0&ndash;2 d&iacute;as)</td><td>Push + in-app</td></tr>
    <tr><td>Vencida +3 d&iacute;as</td><td>&Uacute;ltimo aviso</td></tr>
    <tr><td>Vencida +30 d&iacute;as</td><td>Auto-archive del caso (evento <code>case_archived</code>)</td></tr>
  </table>
  <p>Cada milestone se env&iacute;a <strong>una sola vez</strong> (dedupe por <code>notifications.data-&gt;&gt;'case_id'</code> + <code>milestone</code>).</p>

  <div class="highlight-box">
    <strong>Mientras est&aacute; vencido:</strong> La publicaci&oacute;n <strong>sigue visible</strong> en muro/ficha con badge &ldquo;Publicaci&oacute;n vencida&rdquo;. En la cola de voluntarios pasa al bucket <strong>Pausados</strong>.
  </div>

  <h2>Renovaci&oacute;n = relist</h2>
  <ul>
    <li><code>POST /api/cases/:id/renew</code> &rarr; <code>renewCase()</code>: extiende <code>active_until</code> +45 d&iacute;as y registra <code>case_renewed</code>.</li>
    <li>El caso vuelve al tope de la cola de difusi&oacute;n.</li>
    <li>Si el caso estaba <code>archived</code>, la renovaci&oacute;n lo <strong>reactiva</strong>: status &rarr; <code>active</code> con vigencia fresca y evento <code>case_reactivated</code>.</li>
  </ul>

  <h2>Archivado</h2>
  <ul>
    <li>Estado nuevo de <code>pet_cases.status</code>: <code>archived</code>.</li>
    <li>Fuera de muro, cola, matching y notificaciones; visible solo para el due&ntilde;o (banner en PetDetail).</li>
    <li>Reactivable desde PetDetail/Mi Portal (&ldquo;Reactivar publicaci&oacute;n&rdquo;) o autom&aacute;ticamente si cambia el estado de la mascota (<code>syncCaseStatus</code> re-abre con +45 d&iacute;as).</li>
  </ul>

  <h2>Resoluci&oacute;n</h2>
  <ul>
    <li><code>reunited</code>: cierra el caso (evento <code>case_closed</code> reason <code>reunited</code>), push &ldquo;&iexcl;Volvi&oacute; a casa!&rdquo; a colaboradores y seguidores, celebraci&oacute;n en redes.</li>
    <li><code>adopted</code>: cierre con texto generado (<code>generateAdoptionClosureText</code>), queda como historial/success story.</li>
  </ul>

  <!-- 6. MATRIZ DE NOTIFICACIONES -->
  <h1>6. Matriz de notificaciones</h1>
  <table>
    <tr><th>Evento</th><th>Due&ntilde;o/Reportante</th><th>Voluntarios zona</th><th>Colaboradores/seguidores</th></tr>
    <tr><td>Nueva mascota en tu barrio</td><td>&mdash;</td><td>Push + in-app</td><td>&mdash;</td></tr>
    <tr><td>Avistaje nuevo</td><td>In-app</td><td>&mdash;</td><td>In-app</td></tr>
    <tr><td>D-7 / D-1 por vencer</td><td>Push + in-app</td><td>&mdash;</td><td>&mdash;</td></tr>
    <tr><td>Vencida (+3 d&iacute;as, &uacute;ltimo aviso)</td><td>Push + in-app</td><td>&mdash;</td><td>&mdash;</td></tr>
    <tr><td>Renov&oacute;</td><td>Confirmaci&oacute;n</td><td>Caso vuelve arriba en cola</td><td>&mdash;</td></tr>
    <tr><td>&iexcl;Volvi&oacute; a casa! / Adoptada</td><td>Push</td><td>&mdash;</td><td>Push celebraci&oacute;n</td></tr>
  </table>

  <!-- 7. VISIBILIDAD POR ACTOR -->
  <h1>7. Matriz de visibilidad por actor &times; estado</h1>
  <table>
    <tr><th>Estado</th><th>P&uacute;blico (muro/ficha)</th><th>Voluntarios (cola/dashboard)</th><th>Due&ntilde;o</th><th>Admin</th></tr>
    <tr><td>Activo vigente</td><td>&#10004;</td><td>&#10004; seg&uacute;n bucket</td><td>&#10004;</td><td>&#10004;</td></tr>
    <tr><td>Activo vencido</td><td>&#10004; con badge/banner</td><td>&#9208; bucket Pausados</td><td>&#10004; + avisos</td><td>&#10004;</td></tr>
    <tr><td>Archived</td><td>&#10008; fuera del listado*</td><td>&#10008;</td><td>&#10004; banner + reactivar</td><td>&#10004;</td></tr>
    <tr><td>Closed (reunited/adopted)</td><td>Historial</td><td>&#10008;</td><td>&#10004;</td><td>&#10004;</td></tr>
  </table>
  <p style="font-size: 8pt; color: #888;">* La ficha directa puede seguir accesible por URL, pero sale de todos los listados y mecanismos de difusi&oacute;n.</p>

  <!-- 8. REGLAS TRANSVERSALES -->
  <h1>8. Reglas transversales</h1>
  <ol>
    <li><strong>Ciclo uniforme:</strong> los 6 estados con caso comparten exactamente el mismo tratamiento (45 d&iacute;as + recordatorios + 30 d&iacute;as de gracia). La &uacute;nica diferencia es la prioridad en la cola.</li>
    <li><strong>Avistajes ef&iacute;meros:</strong> <code>sighted</code> no tiene caso ni renovaci&oacute;n; deja de listarse a los 14 d&iacute;as de creado (filtro en queries).</li>
    <li><strong>Adopciones fuera:</strong> <code>for_adoption</code> / <code>for_adoption_simple</code> tienen su propio ciclo (assignments/rifas) y nunca entran a este sistema.</li>
    <li><strong>Matching tolerante de barrios:</strong> todas las comparaciones mascota &harr; agrupaci&oacute;n &harr; suscripci&oacute;n usan normalizaci&oacute;n lowercase + trim + sin acentos (<code>neighborhoodUtils.js</code>, misma l&oacute;gica en JS y SQL).</li>
    <li><strong>Matching del scraper solo contra casos vigentes:</strong> una novedad de FB/IG nunca sugiere matches contra casos vencidos o archivados.</li>
    <li><strong>Sin difusi&oacute;n autom&aacute;tica externa:</strong> la re-difusi&oacute;n depende exclusivamente de voluntarios; renovar = volver arriba en la cola.</li>
  </ol>

  <!-- 9. REFERENCIA T&Eacute;CNICA -->
  <h1 class="page-break">9. Referencia t&eacute;cnica</h1>
  <table>
    <tr><th>Pieza</th><th>Ubicaci&oacute;n</th></tr>
    <tr><td>Constantes 45/30 d&iacute;as</td><td><code>CASE_ACTIVE_DAYS</code> / <code>ARCHIVE_AFTER_DAYS</code> en <code>server/services/caseService.js</code></td></tr>
    <tr><td>Mapeo estado &rarr; caso</td><td><code>petCaseMapping()</code> en <code>caseService.js</code></td></tr>
    <tr><td>Sync al cambiar status</td><td><code>syncCaseStatus()</code> en <code>caseService.js</code></td></tr>
    <tr><td>Renovaci&oacute;n/reactivaci&oacute;n</td><td><code>renewCase()</code> + ruta <code>POST /api/cases/:id/renew</code></td></tr>
    <tr><td>C&aacute;lculo on-read de vigencia</td><td><code>computeExpiry()</code> / <code>withExpiry()</code> en <code>caseService.js</code></td></tr>
    <tr><td>Job diario (recordatorios + auto-archive)</td><td><code>runLifecycleCycle()</code> en <code>server/services/lifecycleJob.js</code></td></tr>
    <tr><td>Cola de difusi&oacute;n</td><td><code>GET /api/volunteers/diffusion-queue</code> en <code>server/routes/volunteers.js</code></td></tr>
    <tr><td>Vigencia en action-center</td><td><code>GET /api/volunteers/pet-action-center/:petId</code></td></tr>
    <tr><td>Vigencia en ficha p&uacute;blica</td><td><code>GET /api/pets/:id</code> + banner en <code>src/pages/PetDetail.tsx</code></td></tr>
    <tr><td>Chip en muro</td><td><code>case_vigencia</code> por fila en <code>GET /api/pets</code> + <code>src/components/PetCard.tsx</code></td></tr>
    <tr><td>Avisos al due&ntilde;o</td><td><code>lost_case_vigencia</code> en <code>GET /api/my-pets</code> + banner en <code>src/pages/MiPortal.tsx</code></td></tr>
    <tr><td>Matching tolerante</td><td><code>normalizeNb()</code> / <code>nbNormSql()</code> / <code>nbOverlapSql()</code> en <code>neighborhoodUtils.js</code></td></tr>
    <tr><td>Tablas clave</td><td><code>pets</code>, <code>pet_cases</code>, <code>share_logs</code>, <code>case_events</code>, <code>notifications</code>, <code>volunteer_subscriptions</code>, <code>agrupaciones</code></td></tr>
    <tr><td>Backfill de barrios</td><td><code>POST /api/pets/admin/backfill-neighborhoods</code> &middot; script <code>server/scripts/backfillNeighborhoods.js</code></td></tr>
  </table>

  <!-- 10. GLOSARIO -->
  <h1>10. Glosario</h1>

  <div class="faq-item"><strong>Caso (STH#####)</strong><br>Unidad de trabajo detr&aacute;s de cada mascota perdida/rescatada; tiene tipo (<em>lost</em>/<em>found</em>), estado (<em>active</em>/<em>archived</em>/<em>closed</em>) y vigencia (<code>active_until</code>).</div>

  <div class="faq-item"><strong>Tr&aacute;nsito (<code>transitada</code>)</strong><br>Hogares temporarios que custodian a la mascota mientras se busca al due&ntilde;o; recurso limitado, por eso el caso sigue siendo de b&uacute;squeda.</div>

  <div class="faq-item"><strong>Retenida (<code>retained</code>)</strong><br>Particular que custodia temporalmente a la mascota rescatada.</div>

  <div class="faq-item"><strong>Avistaje (<code>sighted</code>)</strong><br>Se&ntilde;al de avistamiento ef&iacute;mera, sin caso propio; caduca sola a los 14 d&iacute;as.</div>

  <div class="faq-item"><strong>Cola de difusi&oacute;n</strong><br>Lista priorizada por voluntario con las mascotas de su zona que necesitan shares, agrupadas en Nuevos / Repostear / Al d&iacute;a / Pausados.</div>

  <div class="faq-item"><strong>Renovar (relist)</strong><br>Extender la vigencia 45 d&iacute;as; devuelve el caso al tope de la cola. Si estaba archivado, lo reactiva.</div>

  <div class="faq-item"><strong>Archivado</strong><br>Estado terminal-reactivable de un caso vencido hace m&aacute;s de 30 d&iacute;as sin renovaci&oacute;n.</div>

  <div class="footer">
    <p><strong>Sigo tu huella</strong> &mdash; Plataforma de b&uacute;squeda y reencuentro de mascotas perdidas</p>
    <p>&copy; 2026 Sigo tu huella. Todos los derechos reservados.</p>
    <p style="margin-top: 8px; font-style: italic;">&ldquo;Cada mascota perdida tiene una familia que la busca. Nosotros ayudamos a que se encuentren.&rdquo;</p>
  </div>

</body>
</html>`;

(async () => {
  const logoBuffer = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'));
  const logoBase64 = 'data:image/x-icon;base64,' + logoBuffer.toString('base64');

  const finalHtml = html
    .replace('<div class="cover-logo"><span>&#128062;</span></div>', `<div class="cover-logo"><img src="${logoBase64}" alt="Logo"></div>`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'Ciclo-de-Vida-publicacion.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' }
  });

  await browser.close();
  console.log('PDF generado:', outputPath);
})();
