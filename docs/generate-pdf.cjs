const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Sigo tu huella — Integración de Agrupaciones Aliadas</title>
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

    /* BENEFIT GRID */
    .benefit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
    .benefit-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 6px 8px; }
    .benefit-card h4 { color: #E91E63; font-size: 8.5pt; margin-bottom: 2px; }
    .benefit-card p { font-size: 7.5pt; color: #666; margin: 0; text-align: left; }

    /* STEPS */
    .step-list { counter-reset: step; list-style: none; margin-left: 0; padding-left: 0; }
    .step-list li { counter-increment: step; padding: 5px 5px 5px 35px; position: relative; margin: 4px 0; background: #fafafa; border-radius: 6px; border: 1px solid #eee; }
    .step-list li::before { content: counter(step); position: absolute; left: 8px; top: 5px; width: 20px; height: 20px; background: #E91E63; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 8pt; }

    /* TAGS */
    .tag { display: inline-block; background: #E91E63; color: white; padding: 1px 6px; border-radius: 8px; font-size: 7pt; font-weight: 600; }
    .tag.green { background: #4CAF50; }
    .tag.orange { background: #FF9800; }

    /* FLOW */
    .flow-diagram { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; margin: 8px 0; text-align: center; font-family: 'Consolas', monospace; font-size: 8pt; line-height: 1.5; }

    /* FAQ */
    .faq-item { margin: 6px 0; padding: 6px 10px; background: #fafafa; border-radius: 6px; border-left: 3px solid #FF9800; font-size: 9pt; }
    .faq-item strong { color: #E91E63; }

    .page-break { page-break-before: always; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 2px solid #eee; text-align: center; font-size: 7.5pt; color: #999; }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="cover">
    <div class="cover-logo"><span>&#128062;</span></div>
    <h1>Sigo tu huella</h1>
    <h2>Plan de Integraci&oacute;n de<br>Agrupaciones Aliadas</h2>
    <p style="font-size: 11pt; color: #777; max-width: 460px; margin: 0 auto;">
      Cada mascota perdida tiene una familia que la busca.<br>
      Nosotros ayudamos a que se encuentren.
    </p>
    <div class="cover-meta">
      <p><strong>Versi&oacute;n:</strong> 1.0 &mdash; Agosto 2026</p>
      <p><strong>Plataforma:</strong> sigotuhuella.com.ar</p>
      <p><strong>Documento:</strong> Confidencial &mdash; Para agrupaciones aliadas</p>
    </div>
  </div>

  <!-- 1. QUE ES -->
  <h1>1. &iquest;Qu&eacute; es Sigo tu huella?</h1>
  <p>Sigo tu huella es una plataforma digital <strong>sin fines de lucro</strong> para la b&uacute;squeda y reencuentro de mascotas perdidas en Sicardi, Garibaldi, Correas y Arana. Centraliza reportes de mascotas perdidas, avistamientos, tr&aacute;nsito y adopciones en una &uacute;nica plataforma, conectando a familias, voluntarios y rescatistas.</p>

  <div class="highlight-box">
    <strong>Nuestra misi&oacute;n:</strong> Reducir el tiempo de reencuentro entre mascotas y familias mediante tecnolog&iacute;a, organizaci&oacute;n comunitaria y trabajo en red.
  </div>

  <h2>1.1 &iquest;Qu&eacute; problemas resuelve?</h2>
  <table>
    <tr><th>Problema actual</th><th>Soluci&oacute;n Sigo tu huella</th></tr>
    <tr><td>Informaci&oacute;n dispersa en 20+ grupos de WhatsApp y Facebook</td><td>Una sola plataforma centralizada</td></tr>
    <tr><td>No se puede buscar por zona geogr&aacute;fica</td><td>Mapa interactivo con geolocalizaci&oacute;n</td></tr>
    <tr><td>Los posts se pierden en el feed de redes sociales</td><td>Sistema de casos con seguimiento</td></tr>
    <tr><td>Sin estad&iacute;sticas ni m&eacute;tricas</td><td>Dashboard con analytics en tiempo real</td></tr>
    <tr><td>Voluntarios desorganizados</td><td>Sistema de tr&aacute;nsito, adopci&oacute;n y coordinaci&oacute;n</td></tr>
  </table>

  <!-- 2. QUE OFRECEMOS -->
  <h1>2. &iquest;Qu&eacute; ofrecemos a una agrupaci&oacute;n aliada?</h1>
  <p>Al sumarse a la red Sigo tu huella, su agrupaci&oacute;n obtiene acceso a un ecosistema completo de herramientas tecnol&oacute;gicas que potencian su trabajo en la comunidad.</p>

  <h2>2.1 Herramientas incluidas</h2>
  <div class="benefit-grid">
    <div class="benefit-card"><h4>&#128247; Publicaci&oacute;n de Mascotas</h4><p>Report&aacute; mascotas perdidas, encontradas o en adopci&oacute;n con fotos, ubicaci&oacute;n y descripci&oacute;n detallada.</p></div>
    <div class="benefit-card"><h4>&#128506; Mapa Interactivo</h4><p>Visualiz&aacute; todas las mascotas de tu zona en un mapa con geolocalizaci&oacute;n en tiempo real.</p></div>
    <div class="benefit-card"><h4>&#128241; Redes Sociales Autom&aacute;ticas</h4><p>Publicaci&oacute;n autom&aacute;tica en Instagram y Facebook de cada mascota reportada.</p></div>
    <div class="benefit-card"><h4>&#128172; Bot de WhatsApp</h4><p>Los vecinos pueden reportar mascotas directamente por WhatsApp las 24 horas.</p></div>
    <div class="benefit-card"><h4>&#127915; Generador de Carteles</h4><p>Cre&aacute; flyers profesionales listos para compartir en Instagram Stories y redes.</p></div>
    <div class="benefit-card"><h4>&#128200; Panel de Analytics</h4><p>M&eacute;tricas de publicaciones, alcance, reencuentros y rendimiento de tu agrupaci&oacute;n.</p></div>
    <div class="benefit-card"><h4>&#128101; Sistema de Voluntarios</h4><p>Gestion&aacute; tu equipo de voluntarios, roles, tr&aacute;nsito y disponibilidad.</p></div>
  </div>

  <h2>2.2 Soporte y capacitaci&oacute;n</h2>
  <ul>
    <li><strong>Training inicial:</strong> Capacitaci&oacute;n completa para el equipo de la agrupaci&oacute;n (virtual o presencial)</li>
    <li><strong>Manual de uso:</strong> Documentaci&oacute;n detallada de todas las funcionalidades</li>
    <li><strong>Soporte t&eacute;cnico:</strong> Canal directo de comunicaci&oacute;n con el equipo de Sigo tu huella</li>
    <li><strong>Reuniones de coordinaci&oacute;n:</strong> Reuniones mensuales para alinear esfuerzos</li>
    <li><strong>Actualizaciones:</strong> Mejoras continuas de la plataforma</li>
  </ul>

  <!-- 3. INTEGRACION -->
  <h1>3. &iquest;C&oacute;mo funciona la integraci&oacute;n?</h1>

  <h2>3.1 Estructura del sistema</h2>
  <div class="flow-diagram">
    <strong>Sigo tu huella Central</strong> (plataforma tecnol&oacute;gica + servidor)<br>
    |<br>
    +-- <strong>Agrupaci&oacute;n A</strong> (Sigo Tu Huella &mdash; actual) -&gt; Admin central ve todo<br>
    +-- <strong>Agrupaci&oacute;n B</strong> (nueva) -&gt; Ve solo sus mascotas y voluntarios<br>
    +-- <strong>Agrupaci&oacute;n C</strong> (futura) -&gt; Ve solo sus mascotas y voluntarios<br>
    +-- ...<br><br>
    <em>Todas comparten la misma infraestructura, pero cada una opera de forma independiente.</em>
  </div>

  <h2>3.2 &iquest;Qu&eacute; se comparte y qu&eacute; no?</h2>
  <table>
    <tr><th>Recurso</th><th>&iquest;Se comparte?</th><th>Detalle</th></tr>
    <tr><td>Base de datos</td><td><span class="tag green">SI</span></td><td>Misma DB, datos filtrados por agrupaci&oacute;n</td></tr>
    <tr><td>Panel de administraci&oacute;n</td><td><span class="tag">NO</span></td><td>Cada agrupaci&oacute;n ve solo sus datos</td></tr>
    <tr><td>Cuenta de Instagram</td><td><span class="tag">NO</span></td><td>Cada agrupaci&oacute;n usa la suya propia</td></tr>
    <tr><td>Cuenta de Facebook</td><td><span class="tag">NO</span></td><td>Cada agrupaci&oacute;n usa la suya propia</td></tr>
    <tr><td>WhatsApp</td><td><span class="tag green">SI</span></td><td>N&uacute;mero compartido al inicio, bot filtra por zona</td></tr>
    <tr><td>Servidor</td><td><span class="tag green">SI</span></td><td>Misma infraestructura, costos compartidos</td></tr>
    <tr><td>Voluntarios</td><td><span class="tag">NO</span></td><td>Cada agrupaci&oacute;n gestiona los suyos</td></tr>
    <tr><td>Cruce de datos</td><td><span class="tag orange">PARCIAL</span></td><td>Si una mascota se pierde entre zonas, se notifica a ambas</td></tr>
  </table>

  <h2>3.3 Flujo de trabajo diario</h2>
  <ol class="step-list">
    <li><strong>Un vecino reporta</strong> una mascota perdida por WhatsApp, web o app m&oacute;vil</li>
    <li><strong>El sistema detecta</strong> autom&aacute;ticamente la zona y asigna a la agrupaci&oacute;n correcta</li>
    <li><strong>Se publica</strong> en Instagram y Facebook de la agrupaci&oacute;n con el cartel generado</li>
    <li><strong>Los voluntarios reciben</strong> notificaci&oacute;n push y pueden actuar</li>
    <li><strong>Se da seguimiento</strong> hasta el reencuentro o la adopci&oacute;n</li>
    <li><strong>Se registra</strong> el resultado como estad&iacute;stica de la agrupaci&oacute;n</li>
  </ol>

  <!-- 4. REQUISITOS -->
  <h1>4. &iquest;Qu&eacute; necesita la agrupaci&oacute;n para sumarse?</h1>

  <h2>4.1 Requisitos m&iacute;nimos</h2>
  <table>
    <tr><th>Requisito</th><th>&iquest;Qui&eacute;n lo provee?</th><th>Costo</th></tr>
    <tr><td>Cuenta de Instagram Business</td><td>La agrupaci&oacute;n</td><td>Gratuito</td></tr>
    <tr><td>P&aacute;gina de Facebook vinculada</td><td>La agrupaci&oacute;n</td><td>Gratuito</td></tr>
    <tr><td>Equipo m&iacute;nimo de 3-5 voluntarios</td><td>La agrupaci&oacute;n</td><td>Sin costo</td></tr>
    <tr><td>Coordinador designado</td><td>La agrupaci&oacute;n</td><td>Sin costo</td></tr>
    <tr><td>Capacitaci&oacute;n</td><td>Sigo tu huella</td><td>Sin costo</td></tr>
  </table>

  <h2>4.2 Proceso de incorporaci&oacute;n</h2>
  <ol class="step-list">
    <li>Contacto y reuni&oacute;n informativa</li>
    <li>Configuraci&oacute;n t&eacute;cnica de la agrupaci&oacute;n y redes sociales</li>
    <li>Capacitaci&oacute;n del equipo</li>
    <li>Lanzamiento piloto con primeros casos reales</li>
    <li>Operaci&oacute;n plena y coordinaci&oacute;n continua</li>
  </ol>

  <h2>4.3 Configuraci&oacute;n de redes sociales</h2>
  <p>Para que la publicaci&oacute;n autom&aacute;tica funcione, cada agrupaci&oacute;n necesita:</p>
  <ul>
    <li><strong>Instagram Business</strong> (no personal) vinculada a una P&aacute;gina de Facebook</li>
    <li><strong>Facebook Page</strong> con el nombre de la agrupaci&oacute;n</li>
    <li>Sigo tu huella solicita acceso de publicaci&oacute;n v&iacute;a la API de Meta (proceso seguro y est&aacute;ndar)</li>
    <li>La agrupaci&oacute;n mantiene el control total de sus credenciales</li>
  </ul>

  <!-- 5. BENEFICIOS -->
  <h1>5. Beneficios para la comunidad</h1>

  <div class="benefit-grid">
    <div class="benefit-card"><h4>&#128293; Mayor alcance</h4><p>Las b&uacute;squedas llegan a m&aacute;s personas. M&aacute;s ojos en la calle = m&aacute;s posibilidades de encontrar.</p></div>
    <div class="benefit-card"><h4>&#9201; Respuesta m&aacute;s r&aacute;pida</h4><p>M&aacute;s voluntarios organizados = menos tiempo perdido en coordinar por WhatsApp.</p></div>
    <div class="benefit-card"><h4>&#128269; Sin duplicaci&oacute;n</h4><p>Una sola plataforma, no 20 grupos donde se publica lo mismo y se pierde informaci&oacute;n.</p></div>
    <div class="benefit-card"><h4>&#128202; Datos centralizados</h4><p>Estad&iacute;sticas reales para mejorar el trabajo y demostrar impacto a donantes y aliados.</p></div>
    <div class="benefit-card"><h4>&#128736; Profesionalizaci&oacute;n</h4><p>Herramientas tecnol&oacute;gicas que no existen en redes sociales: geolocalizaci&oacute;n, casu&iacute;stica, seguimiento centralizado.</p></div>
    <div class="benefit-card"><h4>&#127760; Cruce regional</h4><p>Si una mascota se pierde entre dos zonas o provincias, el sistema conecta ambas agrupaciones.</p></div>
  </div>

  <!-- 6. FAQ -->
  <h1>6. Preguntas frecuentes</h1>

  <div class="faq-item"><strong>&iquest;La agrupaci&oacute;n pierde su identidad?</strong><br>No. Cada agrupaci&oacute;n tiene su propia cuenta de Instagram y Facebook, con el estilo visual de Sigo tu huella y ambos logos integrados. La marca local es de la agrupaci&oacute;n.</div>

  <div class="faq-item"><strong>&iquest;Qui&eacute;n ve los datos de las mascotas?</strong><br>Los usuarios de la agrupaci&oacute;n ven solo sus mascotas. El admin central de Sigo tu huella ve todas (para soporte y coordinaci&oacute;n). Los datos no se comparten entre agrupaciones.</div>

  <div class="faq-item"><strong>&iquest;Se puede compartir informaci&oacute;n entre agrupaciones?</strong><br>S&iacute;, si una mascota perdida en una zona aparece en otra, el sistema notifica autom&aacute;ticamente a ambas agrupaciones. Esto es clave para mascotas que se pierden en rutas o zonas tur&iacute;sticas.</div>

  <div class="faq-item"><strong>&iquest;Cu&aacute;nto cuesta?</strong><br>La plataforma se mantiene con donaciones y aportes voluntarios. Los costos de infraestructura (servidor, dominio) se comparten entre las agrupaciones. El monto exacto se define seg&uacute;n el uso.</div>

  <div class="faq-item"><strong>&iquest;Qu&eacute; pasa si la agrupaci&oacute;n quiere darse de baja?</strong><br>No hay contratos ni permanencia m&iacute;nima. Si la agrupaci&oacute;n deja de funcionar, sus datos se archivan y se pueden reactivar en el futuro.</div>

  <!-- 7. CONTACTO -->
  <h1>7. Contacto</h1>
  <table>
    <tr><th>Canal</th><th>Detalle</th></tr>
    <tr><td>Plataforma web</td><td>sigotuhuella.com.ar</td></tr>
    <tr><td>Instagram</td><td>@sigotuhuella.sicardi</td></tr>
    <tr><td>WhatsApp</td><td>2212025190</td></tr>
    <tr><td>Email</td><td>info@sigotuhuella.com.ar</td></tr>
  </table>

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

  let finalHtml = html
    .replace('<div class="cover-logo"><span>&#128062;</span></div>', `<div class="cover-logo"><img src="${logoBase64}" alt="Logo"></div>`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'Plan-Integracion-Agrupaciones-v2.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' }
  });

  await browser.close();
  console.log('PDF generado:', outputPath);
})();
