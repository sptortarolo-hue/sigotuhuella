const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Sigo Tu Huella - Presentación</title>
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

    /* BOXES */
    .highlight-box { background: linear-gradient(135deg, #fce4ec, #fff3e0); border-left: 4px solid #E91E63; padding: 8px 12px; margin: 8px 0; border-radius: 0 6px 6px 0; }
    .highlight-box strong { color: #E91E63; }

    /* BENEFIT GRID */
    .benefit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
    .benefit-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 6px 8px; }
    .benefit-card h4 { color: #E91E63; font-size: 8.5pt; margin-bottom: 2px; }
    .benefit-card p { font-size: 7.5pt; color: #666; margin: 0; text-align: left; }

    /* ICON LIST */
    .icon-list { list-style: none; margin-left: 0; padding-left: 0; }
    .icon-list li { padding: 4px 0 4px 24px; position: relative; margin: 3px 0; background: #fafafa; border-radius: 6px; border: 1px solid #eee; font-size: 9pt; }
    .icon-list li::before { content: "\\2713"; position: absolute; left: 8px; top: 4px; width: 16px; height: 16px; background: #E91E63; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 7pt; }

    /* DATA GRID */
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
    .data-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 8px 10px; }
    .data-card h4 { color: #E91E63; font-size: 9pt; margin-bottom: 3px; }
    .data-card p { font-size: 8pt; color: #666; margin: 0; text-align: left; }

    .footer { margin-top: 16px; padding-top: 8px; border-top: 2px solid #eee; text-align: center; font-size: 7.5pt; color: #999; }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="cover">
    <div class="cover-logo"><img src="LOGO_PLACEHOLDER" alt="Logo"></div>
    <h1>Sigo Tu Huella</h1>
    <h2>Red de vecinos para el reporte<br>y rescate de mascotas</h2>
  </div>

  <!-- QUE ES -->
  <h1>&iquest;Qu&eacute; es Sigo Tu Huella?</h1>
  <p>Sigo Tu Huella es una red de vecinos que se autoorganiza para ayudar a mascotas en situaci&oacute;n de vulnerabilidad en Villa Garibaldi, Parque Sicardi e Ignacio Correas (La Plata, Argentina).</p>
  <p>La plataforma permite reportar mascotas perdidas o encontradas, dar en adopci&oacute;n, difundir en redes sociales y coordinar rescates de forma r&aacute;pida y sencilla.</p>

  <!-- PARA QUE SIRVE -->
  <h1>&iquest;Para qu&eacute; sirve?</h1>
  <ul class="icon-list">
    <li>Reportar una mascota perdida que viste en la calle</li>
    <li>Reportar una mascota que encontraste y la ten&eacute;s con vos</li>
    <li>Publicar tu mascota perdida con fotos y todos sus datos</li>
    <li>Dar una mascota en adopci&oacute;n</li>
    <li>Difundir en WhatsApp, Instagram y Facebook con flyers listos</li>
    <li>Colaborar con donaciones para ayudar a la comunidad</li>
    <li>Descargar carteler&iacute;a con c&oacute;digo QR para imprimir y pegar en la v&iacute;a p&uacute;blica</li>
  </ul>

  <!-- QUIENES -->
  <h1>&iquest;Qui&eacute;nes pueden usarla?</h1>
  <p>Cualquier persona puede usar la plataforma, sin necesidad de registrarse. Crear una cuenta es opcional y permite acceder a funciones adicionales.</p>

  <h2>Sin registrarme puedo...</h2>
  <ul class="icon-list">
    <li>Ver todas las mascotas perdidas y en adopci&oacute;n publicadas en la zona</li>
    <li>Hacer un reporte r&aacute;pido: avistaje, tenencia o atenci&oacute;n necesaria</li>
    <li>Reportar la p&eacute;rdida de mi mascota con fotos y datos completos</li>
    <li>Leer la gu&iacute;a de qu&eacute; hacer si se pierde una mascota</li>
    <li>Descargar carteler&iacute;a con QR para imprimir</li>
    <li>Leer novedades e historias de reencuentros y adopciones</li>
    <li>Verificar la tarjeta de asociado de cualquier miembro</li>
  </ul>

  <h2>Si me registro, adem&aacute;s puedo...</h2>
  <ul class="icon-list">
    <li>Reportar mascotas con todos los datos (fotos, ubicaci&oacute;n en mapa, se&ntilde;as)</li>
    <li>Llevar un historial m&eacute;dico de mis mascotas (visitas al vet, medicaci&oacute;n, gastos)</li>
    <li>Tener mi tarjeta de asociado digital con medallas por ayudar</li>
    <li>Postularme como voluntario de la red</li>
    <li>Ver un dashboard con mi actividad y resumen</li>
  </ul>

  <!-- ADMIN -->
  <h1>&iquest;Qu&eacute; hacen los administradores?</h1>
  <p>Los administradores son los encargados del grupo. Gestionan todos los reportes, publican novedades, administran las cuentas para donaciones, eval&uacute;an solicitudes de voluntarios, otorgan medallas y generan videos para difundir en redes sociales.</p>

  <!-- DIFUSION -->
  <h1>&iquest;C&oacute;mo se difunden las mascotas?</h1>
  <p>La plataforma genera autom&aacute;ticamente flyers listos para compartir en redes sociales. No necesitas dise&ntilde;o gr&aacute;fico ni edici&oacute;n.</p>
  <ul class="icon-list">
    <li>Flyer para WhatsApp: formato historia (9:16) o imagen para chat (1:1)</li>
    <li>Flyer para Instagram: historia (9:16) o publicaci&oacute;n (4:5)</li>
    <li>Flyer para Facebook: historia (9:16) o publicaci&oacute;n (1:1)</li>
    <li>Carteler&iacute;a A4 con c&oacute;digo QR para pegar en la calle</li>
    <li>Difusi&oacute;n directa a WhatsApp con un solo clic</li>
    <li>Los flyers incluyen la foto, el nombre, la ubicaci&oacute;n y el estado de la mascota</li>
  </ul>

  <!-- DATOS -->
  <h1>Datos importantes</h1>
  <div class="data-grid">
    <div class="data-card"><h4>App web</h4><p>No requiere instalaci&oacute;n. Funciona en el navegador del celular o la computadora.</p></div>
    <div class="data-card"><h4>Gratuito</h4><p>Todas las funciones son gratuitas para los vecinos.</p></div>
    <div class="data-card"><h4>Colaboraci&oacute;n</h4><p>Hay cuentas bancarias y Mercado Pago para quienes quieran aportar.</p></div>
    <div class="data-card"><h4>Privacidad</h4><p>Los datos de contacto solo son visibles para los administradores.</p></div>
  </div>

  <div class="footer">
    <p><strong>Sigo Tu Huella</strong> &mdash; sigotuhuella.com.ar</p>
    <p>Sumate a la red &bull; Report&aacute; &bull; Ayudanos a difundir</p>
  </div>

</body>
</html>`;

(async () => {
  const logoBuffer = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'));
  const logoBase64 = 'data:image/x-icon;base64,' + logoBuffer.toString('base64');

  const finalHtml = html.replace('LOGO_PLACEHOLDER', logoBase64);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'Sigo-Tu-Huella-Presentacion.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }
  });

  await browser.close();
  console.log('PDF generado:', outputPath);
})();
