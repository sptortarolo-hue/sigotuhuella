import { Helmet } from 'react-helmet-async';
import { FileText, ShieldCheck, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

const CONTACT_EMAIL = 'info@sigotuhuella.com.ar';

function SectionCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary mb-3">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-gray-600 leading-relaxed mb-3">{children}</p>;
}

function Li({ children }: { children: ReactNode }) {
  return <li className="text-gray-600 leading-relaxed mb-2">{children}</li>;
}

export default function Legales() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Helmet>
        <title>Términos y Condiciones · Política de Privacidad | Sigo Tu Huella</title>
        <meta name="description" content="Términos y condiciones de uso y política de privacidad de Sigo Tu Huella, conforme a la Ley 25.326 de Protección de Datos Personales." />
      </Helmet>

      <header className="mb-10">
        <div className="w-14 h-14 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mb-4">
          <FileText className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-3">Términos y Condiciones y Política de Privacidad</h1>
        <p className="text-gray-500">Última actualización: agosto de 2026</p>
      </header>

      <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12 p-5 sm:p-6 bg-white rounded-2xl border border-brand-accent">
        <a href="#terminos" className="text-sm font-semibold text-brand-primary hover:underline">1. Términos y Condiciones de Uso</a>
        <a href="#privacidad" className="text-sm font-semibold text-brand-primary hover:underline">2. Política de Privacidad</a>
        <a href="#derechos" className="text-sm font-semibold text-brand-primary hover:underline">3. Tus derechos sobre tus datos</a>
        <a href="#contacto" className="text-sm font-semibold text-brand-primary hover:underline">4. Contacto</a>
      </nav>

      <div className="space-y-12">
        <SectionCard id="terminos" title="1. Términos y Condiciones de Uso">
          <P>
            <strong>Sigo Tu Huella</strong> ("la plataforma") es una red vecinal de ayuda para mascotas: personas que reportan mascotas perdidas o encontradas, avistajes, mascotas que necesitan atención y publicaciones de adopción. Estos Términos regulan el uso del sitio web, la aplicación y el asistente de WhatsApp.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-2">1.1. Aceptación de los términos</h3>
          <P>
            Al crear una cuenta, publicar un aviso, enviar un reporte o utilizar el asistente de WhatsApp, entregás tus datos voluntariamente con la finalidad de difundir y gestionar el aviso. Quienes publican los datos (teléfono, ubicación, fotos) son los propios titulares, y al hacerlo consienten expresamente su publicación de conformidad con la Ley 25.326. Queda vedado usar la plataforma en forma contraria a la ley, la buena fe o los derechos de terceros.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">1.2. Contenido del usuario</h3>
          <P>Al publicar un aviso declaras que:</P>
          <ul className="list-disc pl-5 mb-3">
            <Li>Contás con derecho a publicar la información y fotos que subís, y que no violan derechos de terceros.</Li>
            <Li>La información es veraz y exacta al momento de la publicación.</Li>
            <Li>Sabés que el contacto y la ubicación que cargás serán visibles en el aviso para que cualquier persona pueda ayudarte a encontrar o recuperar la mascota.</Li>
          </ul>

          <h3 className="text-lg font-bold text-gray-800 mb-3">1.3. Difusión del aviso</h3>
          <P>
            Los avisos se pueden difundir a través de nuestros grupos de WhatsApp, redes sociales y canales de la comunidad con el fin de ampliar las posibilidades de recuperar/colocar la mascota. El dueño del aviso decide en cada reporte si la difusión está habilitada y si quiere mostrar su teléfono y su ubicación exacta en el mapa público.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">1.4. Responsabilidad</h3>
          <P>
            La plataforma es un medio de publicación y comunicación entre vecinos. No garantizamos resultados (por ejemplo, que una mascota sea encontrada) ni respondemos por los datos que los propios usuarios publican ni por el comportamiento de los usuarios entre sí. No se permite el uso para fines ilegales, fraude, maltrato o estafa.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">1.5. Modificación</h3>
          <P>
            Podemos actualizar estos Términos y la Política de Privacidad cuando sea necesario. La versión vigente siempre estará publicada en esta página.
          </P>
        </SectionCard>

        <SectionCard id="privacidad" title="2. Política de Privacidad">
          <P>
            Esta Política se rige por la <strong>Ley 25.326 de Protección de Datos Personales</strong> y su Decreto reglamentario 1558/2001, y describe qué tratamiento de datos hacemos en Sigo Tu Huella.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.1. Responsable del tratamiento</h3>
          <div className="p-4 sm:p-5 bg-white rounded-2xl border border-brand-accent mb-4 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-brand-primary shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Sigo Tu Huella</p>
              <p className="text-sm text-gray-500 break-words">Contacto de privacidad: {CONTACT_EMAIL}</p>
            </div>
          </div>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.2. Datos que recopilamos y para qué</h3>
          <ul className="list-disc pl-5 mb-3">
            <Li><strong>Al registrarte:</strong> nombre, email y, opcionalmente, WhatsApp/teléfono. Se usan para crear y gestionar tu cuenta y enviarte avisos de tus propias publicaciones.</Li>
            <Li><strong>Al publicar un reporte:</strong> datos que vos elegís cargar (descripción, fotos, teléfono de contacto, ubicación/coordenadas). Se publican como parte del aviso para poder encontrar a la mascota.</Li>
            <Li><strong>Coordenadas y dirección:</strong> la precisión con que se muestra la ubicación en el mapa es la que vos decidís en el reporte.</Li>
            <Li><strong>Información técnica:</strong> IP y datos del navegador al visitar fichas y escanear códigos QR, con fines de funcionamiento, seguridad y estadísticas.</Li>
          </ul>

          <P>
            <strong>Base de legitimación:</strong> el tratamiento se apoya en el consentimiento otorgado por el acto voluntario de entregarnos tus datos para la finalidad de difundir y gestionar un aviso, y en la relación del servicio (Ley 25.326, arts. 5 y 6). No tratamos datos para finalidades ajenas sin que nos lo autorices.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.3. Publicación de los datos (lo importante)</h3>
          <P>
            Los reportes son públicos por diseño, porque su objetivo es que la comunidad ayude. Eso significa que <strong>el teléfono de contacto y la ubicación de un aviso son visibles para cualquier visitante</strong>. Vos decidís en el momento del reporte:
          </P>
          <ul className="list-disc pl-5 mb-3">
            <Li>Si mostrás tu teléfono en el aviso o lo mantenés oculto.</Li>
            <Li>Si publicás la ubicación exacta en el mapa o preferís que no se muestre el punto exacto.</Li>
            <Li>Si autorizás que el aviso se difunda en grupos y redes para ampliar su alcance.</Li>
          </ul>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.4. Destinatarios y terceros</h3>
          <P>Tratamos tus datos en nombre de Sigo Tu Huella y compartimos solo lo necesario con:</P>
          <ul className="list-disc pl-5 mb-3">
            <Li><strong>Socios de la red, vecinos y comunidad:</strong> los datos que vos difundís en el aviso (público).</Li>
            <Li><strong>Proveedores de servicios:</strong> hosting del servidor (VPS), WhatsApp Business de Meta (asistente y difusión), MercadoPago (pagos de rifas y donaciones), Google (inicio de sesión con Google y analítica).</Li>
          </ul>
          <P>
            Estos proveedores pueden procesar datos fuera de Argentina y se encargan al amparo de las disposiciones de la Ley 25.326 y de los contratos de encargo correspondientes.
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.5. Conservación y seguridad</h3>
          <P>
            Conservamos tus datos mientras tus avisos o cuenta permanezcan activos y, luego, por el tiempo necesario para cumplir obligaciones legales y técnicas. Aplicamos medidas técnicas y organizativas razonables para proteger la información (acceso confidencial, cifrado de contraseñas, respaldos periódicos).
          </P>

          <h3 className="text-lg font-bold text-gray-800 mb-3">2.6. Notificaciones</h3>
          <P>
            Los avisos de tus propias publicaciones (confirmación, avisos de tu reporte) se te envían por correo electrónico, que es el canal permanente del servicio. Los mensajes por WhatsApp son opcionales y solo se envían si lo habilitás.
          </P>
        </SectionCard>

        <SectionCard id="derechos" title="3. Tus derechos (Ley 25.326)">
          <P>
            La Ley 25.326 te reconoce los derechos de <strong>acceso, rectificación, actualización y supresión</strong> de tus datos personales (derechos ARCO). Podés:
          </P>
          <ul className="list-disc pl-5 mb-3">
            <Li>Solicitar qué datos tenemos sobre vos y para qué se usan.</Li>
            <Li>Corregir datos inexactos (por ejemplo, cambiar tu teléfono o email).</Li>
            <Li>Solicitar la baja de tu cuenta, de tus publicaciones o la supresión de tus datos.</Li>
            <Li>Retirar el consentimiento para la difusión de un aviso.</Li>
          </ul>
          <P>
            Para ejercer estos derechos escribinos a <Mail className="inline w-4 h-4 -mt-0.5" /> <strong>{CONTACT_EMAIL}</strong> indicando tu solicitud. También podés acudir ante el organismo de control: <strong>Agencia de Acceso a la Información Pública</strong> (AAIP), www.argentina.gob.ar/aaip.
          </P>
        </SectionCard>

        <SectionCard id="contacto" title="4. Contacto">
          <div className="p-5 bg-white rounded-2xl border border-brand-accent flex items-center gap-3">
            <Mail className="w-8 h-8 text-brand-primary shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Consultas de privacidad y datos personales</p>
              <p className="text-sm text-gray-500 break-all">{CONTACT_EMAIL}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}