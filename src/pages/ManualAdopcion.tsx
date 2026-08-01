import { ReactNode } from 'react';
import ManualLayout from '@/src/components/manual/ManualLayout';
import ManualSectionTitle from '@/src/components/manual/ManualSectionTitle';
import ManualStep from '@/src/components/manual/ManualStep';
import ManualCallout from '@/src/components/manual/ManualCallout';
import ManualCta from '@/src/components/manual/ManualCta';
import UiFrame from '@/src/components/manual/UiFrame';
import MockMyPetsCard from '@/src/components/manual/mockups/MockMyPetsCard';
import MockRegisterPet from '@/src/components/manual/mockups/MockRegisterPet';
import MockAdoptionModal from '@/src/components/manual/mockups/MockAdoptionModal';
import MockPendingList from '@/src/components/manual/mockups/MockPendingList';
import MockWhatsAppMsg from '@/src/components/manual/mockups/MockWhatsAppMsg';
import MockClaimPage from '@/src/components/manual/mockups/MockClaimPage';
import MockSuccessScreen from '@/src/components/manual/mockups/MockSuccessScreen';
import MockHomeButtons from '@/src/components/manual/mockups/MockHomeButtons';
import MockAdoptionPublish from '@/src/components/manual/mockups/MockAdoptionPublish';
import MockAdoptionGallery from '@/src/components/manual/mockups/MockAdoptionGallery';
import MockPetDetailContact from '@/src/components/manual/mockups/MockPetDetailContact';
import {
  Heart, HeartHandshake, PawPrint, Clock, MessageCircle, XCircle,
  Link2, LogIn, Info, ShieldCheck, Search, Camera, MapPin, ChevronRight,
} from 'lucide-react';

function SubSectionTitle({ id, icon: Icon, children }: { id: string; icon: any; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 flex items-center gap-3 mb-8 sm:mb-10">
      <div className="w-9 h-9 sm:w-11 sm:h-11 bg-brand-secondary/10 rounded-2xl flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-secondary" />
      </div>
      <h3 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary">{children}</h3>
    </div>
  );
}

function PathChooser({
  items,
}: {
  items: { href: string; icon: any; iconBg: string; iconColor: string; title: string; desc: string }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 my-8 sm:my-10">
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          className="group bg-white rounded-[2rem] border-2 border-brand-accent hover:border-brand-primary p-5 sm:p-6 transition-all hover:shadow-lg hover:-translate-y-0.5"
        >
          <div className={`w-12 h-12 ${it.iconBg} rounded-2xl flex items-center justify-center mb-3`}>
            <it.icon className={`w-6 h-6 ${it.iconColor}`} />
          </div>
          <h3 className="text-lg font-bold text-brand-primary mb-1">{it.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{it.desc}</p>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-primary mt-3 group-hover:translate-x-1 transition-transform">
            Ver pasos <ChevronRight className="w-4 h-4" />
          </span>
        </a>
      ))}
    </div>
  );
}

export default function ManualAdopcion() {
  return (
    <ManualLayout
      chapterTitle="Cómo funciona la adopción"
      chapterDescription="Desde que cargás una mascota para darla en adopción hasta que confirma su nueva familia. Guía paso a paso para quien entrega y para quien recibe."
      icon={Heart}
      sections={[
        { id: 'doy-en-adopcion', label: 'Doy en adopción' },
        { id: 'quiero-adoptar', label: 'Quiero adoptar' },
        { id: 'que-significa', label: '¿Qué significa adoptar?' },
      ]}
    >
      {/* ── PARTE A: DOY EN ADOPCIÓN ─────────────────────────────── */}
      <section>
        <ManualSectionTitle id="doy-en-adopcion" icon={HeartHandshake}>
          Doy en adopción una mascota
        </ManualSectionTitle>

        <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-3xl">
          Hay <strong>dos formas de dar una mascota en adopción</strong>, según si ya está
          registrada en la app o no. Elegí la que se ajusta a tu caso:
        </p>

        <PathChooser
          items={[
            {
              href: '#con-registro',
              icon: Heart,
              iconBg: 'bg-rose-100',
              iconColor: 'text-rose-500',
              title: 'Con mascota registrada',
              desc: 'La mascota ya está en "Mis mascotas". Elegís quién la adopta y la app gestiona el traspaso con un link de confirmación.',
            },
            {
              href: '#sin-registro',
              icon: Camera,
              iconBg: 'bg-purple-100',
              iconColor: 'text-purple-500',
              title: 'Sin mascota registrada',
              desc: 'La mascota no está cargada en la app. Publicás un aviso y los interesados te contactan por WhatsApp.',
            },
          ]}
        />

        {/* ── CAMINO 1: CON MASCOTA REGISTRADA ─────────────────── */}
        <SubSectionTitle id="con-registro" icon={Heart}>
          Camino 1 · La mascota ya está en "Mis mascotas"
        </SubSectionTitle>
        <div className="space-y-10 sm:space-y-14">
          <ManualStep number={1} title={'Registrá tu mascota con la clasificación "Adopción"'} icon={PawPrint}
            visual={<UiFrame label={'En "Clasificación" elegí "Adopción · Busca un hogar": esa mascota queda marcada para adopción.'}><MockRegisterPet /></UiFrame>}
          >
            <p>
              El paso inicial es <strong>cargar la mascota</strong> en la sección <strong>"Mis mascotas"</strong>:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Ingresá a <strong>"Mis mascotas"</strong> y tocá <strong>"Registrar mascota"</strong>.</li>
              <li>Completá sus datos (nombre, especie, raza, color, etc.).</li>
              <li>En el campo <strong>"Clasificación"</strong> elegí <strong>"Adopción · Busca un hogar"</strong>.</li>
            </ol>
            <ManualCallout tone="info" title="Importante" icon={ShieldCheck}>
              <p>
                Solo las mascotas registradas con la clasificación <strong>"Adopción"</strong> tienen el botón
                <strong> "Dar en adopción"</strong> que te permite transferirla a un adoptante elegido.
              </p>
            </ManualCallout>
            <ManualCta to="/mi-mascota" icon={PawPrint}>Ir a Mis mascotas</ManualCta>
          </ManualStep>

          <ManualStep number={2} title={'Tocá "Dar en adopción"'} icon={Heart}
            visual={<UiFrame label={'El botón "Dar en adopción" aparece en la ficha de las mascotas de clasificación Adopción.'}><MockMyPetsCard /></UiFrame>}
          >
            <p>
              Una vez registrada con la clasificación <strong>"Adopción"</strong>, la mascota aparece en tu
              listado con el botón <strong>"Dar en adopción"</strong>.
            </p>
            <p>
              Tocá ese botón para empezar la entrega a la persona que elegiste.
            </p>
          </ManualStep>

          <ManualStep number={3} title="Completá los datos del adoptante" icon={Heart}
            visual={<UiFrame label="Se abre una ventana para cargar los datos de la persona que se lleva la mascota."><MockAdoptionModal /></UiFrame>}
          >
            <p>
              Se abre una ventana donde tenés que completar los datos de la persona que se lleva la mascota:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Nombre</strong> del adoptante</li>
              <li><strong>WhatsApp</strong></li>
            </ul>
            <p className="text-xs text-gray-400">El WhatsApp debe tener el formato 549 + código de área sin 0 + teléfono.</p>
          </ManualStep>

          <ManualStep number={4} title={'La mascota queda en "Adopciones pendientes"'} icon={Clock}
            visual={<UiFrame label="Podés seguir, confirmar o cancelar la adopción desde acá."><MockPendingList /></UiFrame>}
          >
            <p>
              Al confirmar la entrega, la mascota pasa a estar <strong>"En adopción"</strong> y
              aparece en tu sección <strong>"Adopciones pendientes"</strong>, dentro de Mis mascotas.
            </p>
            <p>
              Ahí vas a ver el nombre de la mascota, los datos del adoptante elegido y dos acciones:
              <strong> confirmar la adopción</strong> o <strong>cancelarla</strong>.
            </p>
          </ManualStep>

          <ManualStep number={5} title="El adoptante recibe el link por WhatsApp" icon={MessageCircle}
            visual={<UiFrame label="El adoptante recibe el link por WhatsApp con todos los detalles."><MockWhatsAppMsg /></UiFrame>}
          >
            <p>
              La persona elegida recibe una invitación con un <strong>link personal</strong>
              por <strong>WhatsApp</strong>.
            </p>
            <p>
              Ese link es único para ella: nadie más puede confirmar esa adopción.
            </p>
          </ManualStep>

          <ManualStep number={6} title="Cuando se confirma, la mascota pasa a ser suya" icon={XCircle}>
            <p>
              La adopción se puede confirmar de dos maneras: <strong>el adoptante</strong> abre el
              link y confirma, o <strong>vos confirmás</strong> directamente desde
              "Adopciones pendientes". En cualquiera de los dos casos, la mascota pasa a estar
              <strong> oficialmente adoptada</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deja de aparecer en tus pendientes y deja de ser tu responsabilidad.</li>
              <li>Aparece en el "Mis mascotas" del nuevo dueño (si tiene cuenta).</li>
              <li>La chapita QR queda asociada a los datos del nuevo dueño.</li>
            </ul>
            <ManualCallout tone="info" title="Confirmar vos la adopción" icon={Info}>
              <p>
                Si el adoptante todavía no se registró, podés confirmar la adopción igual desde
                "Adopciones pendientes". La mascota queda oficialmente adoptada y, al escanear
                su QR, aparecerán los datos del nuevo dueño.
              </p>
            </ManualCallout>
            <ManualCallout tone="warning" title="¿Cambió el acuerdo?" icon={Info}>
              <p>
                Mientras la adopción no esté confirmada, podés <strong>cancelarla</strong> desde
                "Adopciones pendientes". La mascota vuelve a estar disponible y el adoptante recibe el aviso.
              </p>
            </ManualCallout>
          </ManualStep>
        </div>

        {/* ── CAMINO 2: SIN MASCOTA REGISTRADA ─────────────────── */}
        <div className="mt-16 sm:mt-20">
          <SubSectionTitle id="sin-registro" icon={Camera}>
            Camino 2 · La mascota no está registrada
          </SubSectionTitle>
          <div className="space-y-10 sm:space-y-14">
            <ManualStep number={1} title={'Tocá "Dar en adopción" desde el inicio'} icon={HeartHandshake}
              visual={<UiFrame label="En la pantalla de inicio está el acceso directo para publicar una mascota en adopción."><MockHomeButtons /></UiFrame>}
            >
              <p>
                Si la mascota no está cargada en la app, no hace falta registrarla antes:
                tocá el botón <strong>"Dar en adopción"</strong> de la pantalla de inicio.
              </p>
              <p>
                Es la forma más rápida de avisar que estás buscándole un hogar.
              </p>
            </ManualStep>

            <ManualStep number={2} title="Completá el aviso con los datos de la mascota" icon={Camera}
              visual={<UiFrame label="Completás foto, datos y tu WhatsApp de contacto para publicar el aviso."><MockAdoptionPublish /></UiFrame>}
            >
              <p>
                Completá el aviso con la información de la mascota:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Al menos <strong>una foto clara</strong> de la mascota.</li>
                <li>Nombre (si lo tiene), especie y sexo.</li>
                <li>Descripción, ubicación y <strong>tu WhatsApp de contacto</strong>.</li>
              </ul>
            </ManualStep>

            <ManualStep number={3} title="Queda publicada en la sección de adopción" icon={Search}
              visual={<UiFrame label={'El aviso aparece en la sección "En adopción" junto a las demás mascotas.'}><MockAdoptionGallery /></UiFrame>}
            >
              <p>
                Al publicar, el aviso aparece en la sección <strong>"En adopción"</strong>
                (el destino del botón <strong>"Quiero adoptar"</strong>) para que todos lo vean.
              </p>
            </ManualStep>

            <ManualStep number={4} title="Los interesados te contactan por WhatsApp" icon={MessageCircle}
              visual={<UiFrame label={'La ficha pública muestra tu WhatsApp con el botón "Contactar".'}><MockPetDetailContact /></UiFrame>}
            >
              <p>
                Cuando alguien quiera adoptarla, abre la ficha y toca
                <strong> "Contactar por WhatsApp"</strong>: ahí aparece el contacto que cargaste.
              </p>
              <p>
                Coordinás vos la entrega directamente con la persona interesada.
              </p>
              <ManualCallout tone="info" title="Un aviso, no un traspaso gestionado" icon={Info}>
                <p>
                  Este camino es un <strong>aviso de difusión</strong>: la app no gestiona el traspaso
                  ni genera un link de confirmación. Si preferís elegir vos al adoptante y que la mascota
                  pase oficialmente con su QR a otra cuenta, usá el <a href="#con-registro" className="font-bold underline">Camino 1 (mascota registrada)</a>.
                </p>
              </ManualCallout>
              <ManualCta to="/reportar?status=for_adoption_simple" icon={Camera}>Publicar una mascota en adopción</ManualCta>
            </ManualStep>
          </div>
        </div>
      </section>

      {/* ── PARTE B: QUIERO ADOPTAR ────────────────────────────── */}
      <section>
        <ManualSectionTitle id="quiero-adoptar" icon={Heart}>
          Quiero adoptar una mascota
        </ManualSectionTitle>

        <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-3xl">
          En todos los casos vas a <strong>ponerte en contacto con quien entrega la mascota</strong>.
          La diferencia está en si la mascota tiene un <strong>perfil en la app</strong> o no:
          con perfil, la adopción se gestiona desde la app (invitación, confirmación y QR);
          sin perfil, es un aviso de difusión que se coordina por WhatsApp.
        </p>

        <PathChooser
          items={[
            {
              href: '#con-perfil',
              icon: ShieldCheck,
              iconBg: 'bg-pink-100',
              iconColor: 'text-pink-600',
              title: 'La mascota tiene perfil en la app',
              desc: 'Contactás al responsable y, si te elige, te llega una invitación con un link. La confirmás y la mascota, con su QR, pasa a tu cuenta.',
            },
            {
              href: '#sin-perfil',
              icon: Search,
              iconBg: 'bg-orange-100',
              iconColor: 'text-orange-600',
              title: 'La mascota no tiene perfil',
              desc: 'Es un aviso de difusión en la galería. Contactás por WhatsApp al responsable y coordinás vos la entrega.',
            },
          ]}
        />

        {/* ── CAMINO 1: LA MASCOTA TIENE PERFIL EN LA APP ───────── */}
        <SubSectionTitle id="con-perfil" icon={ShieldCheck}>
          Camino 1 · La mascota tiene perfil en la app
        </SubSectionTitle>
        <div className="space-y-10 sm:space-y-14">
          <ManualStep number={1} title={'Tocá "Quiero adoptar" desde el inicio'} icon={HeartHandshake}
            visual={<UiFrame label={'En la pantalla de inicio tocás "Quiero adoptar" para ver las mascotas en adopción.'}><MockHomeButtons /></UiFrame>}
          >
            <p>
              En la pantalla de inicio tocá el botón <strong>"Quiero adoptar"</strong>:
              te lleva a la sección con todas las mascotas que buscan hogar.
            </p>
          </ManualStep>

          <ManualStep number={2} title="Buscá una mascota con perfil" icon={Search}
            visual={<UiFrame label={'Las tarjetas con perfil muestran el badge "En Adopción" y la etiqueta "Perfil en la app".'}><MockAdoptionGallery /></UiFrame>}
          >
            <p>
              Recorré las tarjetas. Las mascotas que <strong>tienen perfil en la app</strong> se
              distinguen por la etiqueta <strong>"Perfil en la app"</strong> sobre la foto y el
              estado <strong>"En Adopción"</strong>.
            </p>
          </ManualStep>

          <ManualStep number={3} title='Tocá "Contactar por WhatsApp"' icon={MessageCircle}
            visual={<UiFrame label="La ficha tiene un botón verde para escribirle al responsable directamente."><MockPetDetailContact /></UiFrame>}
          >
            <p>
              Si te interesa, tocá <strong>"Contactar por WhatsApp"</strong> para hablar con la
              persona que la está dando en adopción. En la ficha también se aclara que la mascota
              tiene su perfil en la app y que la adopción se gestiona desde ahí.
            </p>
          </ManualStep>

          <ManualStep number={4} title="Te llega la invitación para confirmar" icon={Link2}
            visual={<UiFrame label="La invitación muestra la mascota y qué significa adoptarla."><MockClaimPage /></UiFrame>}
          >
            <p>
              Si el responsable <strong>te elige</strong>, la app te envía una
              <strong> invitación con un link personal</strong> por WhatsApp. Ese link es único
              para vos: nadie más puede confirmar esa adopción.
            </p>
          </ManualStep>

          <ManualStep number={5} title="Confirmá y la mascota pasa a tu cuenta" icon={LogIn}
            visual={<UiFrame label={'Al confirmar, la mascota pasa a tu "Mis mascotas" con su QR.'}><MockSuccessScreen /></UiFrame>}
          >
            <p>
              Abrís el link, revisás los datos de la mascota y tocás
              <strong> "Confirmar adopción"</strong>. Para confirmar necesitás tener una cuenta.
            </p>
            <ManualCallout tone="info" title="Importante" icon={ShieldCheck}>
              <p>
                La invitación está atada a tu email. Si te registrás o ingresás con otro, la app te
                va a avisar que el link corresponde a otra cuenta.
              </p>
            </ManualCallout>
            <div className="flex flex-col sm:flex-row gap-3">
              <ManualCta to="/login" icon={LogIn}>Iniciar sesión</ManualCta>
              <ManualCta to="/register" variant="secondary">Crear cuenta</ManualCta>
            </div>
            <p>
              Y listo: la mascota aparece en tu <strong>"Mis mascotas"</strong> y la chapita QR
              queda asociada a tu cuenta.
            </p>
          </ManualStep>
        </div>

        {/* ── CAMINO 2: LA MASCOTA NO TIENE PERFIL ──────────────── */}
        <div className="mt-16 sm:mt-20">
          <SubSectionTitle id="sin-perfil" icon={Search}>
            Camino 2 · La mascota no tiene perfil en la app
          </SubSectionTitle>
          <div className="space-y-10 sm:space-y-14">
            <ManualStep number={1} title={'Tocá "Quiero adoptar" desde el inicio'} icon={HeartHandshake}
              visual={<UiFrame label={'En la pantalla de inicio tocás "Quiero adoptar" para ver las mascotas en adopción.'}><MockHomeButtons /></UiFrame>}
            >
              <p>
                En la pantalla de inicio tocá el botón <strong>"Quiero adoptar"</strong>:
                te lleva a la sección con todas las mascotas que buscan hogar.
              </p>
            </ManualStep>

            <ManualStep number={2} title="Buscá una adopción de difusión" icon={Search}
              visual={<UiFrame label={'Las publicaciones sin perfil se identifican con el estado "En adopción (solo difusión)".'}><MockAdoptionGallery /></UiFrame>}
            >
              <p>
                Las mascotas <strong>sin perfil</strong> se publican en
                <strong> "en adopción (solo difusión)"</strong> en la misma galería. Mirá la ficha
                para conocer la historia y los datos de la mascota.
              </p>
            </ManualStep>

            <ManualStep number={3} title='Tocá "Contactar por WhatsApp"' icon={MessageCircle}
              visual={<UiFrame label="La ficha del aviso tiene un botón verde para escribirle al responsable directamente."><MockPetDetailContact /></UiFrame>}
            >
              <p>
                Tocá <strong>"Contactar por WhatsApp"</strong>: se abre un chat con el número de
                contacto que cargó la persona que publicó el aviso.
              </p>
            </ManualStep>

            <ManualStep number={4} title="Coordiná vos la entrega" icon={MapPin}>
              <p>
                La entrega se coordina <strong>directamente con el responsable</strong> del aviso:
                van a acordar cómo y cuándo conocerse. La app solo difunde el aviso, no gestiona
                el traspaso.
              </p>
              <ManualCallout tone="info" title="¿Querés que la adopción se gestione?" icon={Info}>
                <p>
                  Si preferís que la adopción quede registrada con confirmación y QR, comentale al
                  responsable que puede usar el <a href="#con-perfil" className="font-bold underline">Camino 1 (mascota con perfil)</a>.
                </p>
              </ManualCallout>
              <ManualCta to="/adopcion" icon={Heart}>Ver mascotas en adopción</ManualCta>
            </ManualStep>
          </div>
        </div>
      </section>

      {/* ── QUÉ SIGNIFICA ADOPTAR ────────────────────────────────── */}
      <section className="max-w-3xl mx-auto">
        <ManualSectionTitle id="que-significa" icon={Heart}>
          ¿Qué significa adoptar en Sigo Tu Huella?
        </ManualSectionTitle>
        <ManualCallout tone="info" icon={ShieldCheck}>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>La mascota pasa a ser oficialmente tuya</strong> — aparece en tu sección "Mis mascotas".</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>La chapita QR se asocia a tu cuenta</strong> — al escanearla verán tus datos de contacto.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span><strong>Podés gestionar su perfil completo</strong> — fotos, salud, vacunas y recordatorios.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong>El dueño anterior ya no puede modificar</strong> los datos de la mascota.</span>
            </li>
          </ul>
        </ManualCallout>
      </section>
    </ManualLayout>
  );
}
