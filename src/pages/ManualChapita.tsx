import { ReactNode } from 'react';
import ManualLayout from '@/src/components/manual/ManualLayout';
import ManualSectionTitle from '@/src/components/manual/ManualSectionTitle';
import ManualStep from '@/src/components/manual/ManualStep';
import ManualCallout from '@/src/components/manual/ManualCallout';
import ManualCta from '@/src/components/manual/ManualCta';
import UiFrame from '@/src/components/manual/UiFrame';
import MockChapitaBanner from '@/src/components/manual/mockups/MockChapitaBanner';
import MockPetSelector from '@/src/components/manual/mockups/MockPetSelector';
import MockChapitaForm from '@/src/components/manual/mockups/MockChapitaForm';
import MockSolicitudExitosa from '@/src/components/manual/mockups/MockSolicitudExitosa';
import MockQrPendiente from '@/src/components/manual/mockups/MockQrPendiente';
import MockChapitaListaMsg from '@/src/components/manual/mockups/MockChapitaListaMsg';
import MockQrAsignado from '@/src/components/manual/mockups/MockQrAsignado';
import MockMascotaIdentificada from '@/src/components/manual/mockups/MockMascotaIdentificada';
import MockScanPerfilPublico from '@/src/components/manual/mockups/MockScanPerfilPublico';
import MockScanNotif from '@/src/components/manual/mockups/MockScanNotif';
import {
  QrCode, PawPrint, Heart, Camera, CheckCircle2, Clock, MessageCircle,
  MapPin, User, ShieldCheck, Smartphone, Bell, HeartHandshake, Info, Link2, ChevronRight,
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

export default function ManualChapita() {
  return (
    <ManualLayout
      chapterTitle="Cómo funciona la chapita QR"
      chapterDescription="Desde que solicitás la chapita para tu mascota hasta que alguien escanea el código y te contacta. Guía paso a paso para pedirla, retirarla y entender qué pasa después."
      icon={QrCode}
      sections={[
        { id: 'solicitud', label: 'Solicitar la chapita' },
        { id: 'cuando-llega', label: 'Cuando llega la chapita' },
        { id: 'al-escanear', label: 'Al escanear el QR' },
      ]}
    >
      {/* ── PARTE 1: SOLICITUD ─────────────────────────────────────── */}
      <section>
        <ManualSectionTitle id="solicitud" icon={QrCode}>
          Solicitar la chapita
        </ManualSectionTitle>

        <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-3xl">
          Hay <strong>dos formas de pedir la chapita QR</strong>, según si tu mascota ya está
          registrada en la app o no. Elegí la que se ajusta a tu caso:
        </p>

        <PathChooser
          items={[
            {
              href: '#con-mascota',
              icon: Heart,
              iconBg: 'bg-rose-100',
              iconColor: 'text-rose-500',
              title: 'Con mascota registrada',
              desc: 'La mascota ya está en "Mis mascotas". La elegís, tocás "Solicitar" y quedás en lista para recibir la chapita.',
            },
            {
              href: '#sin-mascota',
              icon: Camera,
              iconBg: 'bg-purple-100',
              iconColor: 'text-purple-500',
              title: 'Sin mascota registrada',
              desc: 'La mascota no está cargada en la app. La registrás al pedir la chapita, completando sus datos en el formulario.',
            },
          ]}
        />

        {/* ── CAMINO 1: MASCOTA REGISTRADA ─────────────────────────── */}
        <SubSectionTitle id="con-mascota" icon={Heart}>
          Camino 1 · La mascota ya está en "Mis mascotas"
        </SubSectionTitle>
        <div className="space-y-10 sm:space-y-14">
          <ManualStep number={1} title={'Tocá "Solicitar" en el banner del inicio'} icon={QrCode}
            visual={<UiFrame label={'En la pantalla de inicio está el banner de la chapita con el botón "Solicitar".'}><MockChapitaBanner /></UiFrame>}
          >
            <p>
              En la pantalla de inicio vas a ver el <strong>banner de la chapita identificadora</strong>.
              Tocá el botón <strong>"Solicitar"</strong> para empezar.
            </p>
            <p className="text-xs text-gray-400">
              Si el banner no aparece, también podés pedir la chapita desde la ficha de tu mascota
              en "Mis mascotas", con el botón <strong>"Solicitar identificación QR"</strong>.
            </p>
          </ManualStep>

          <ManualStep number={2} title="Elegí la mascota y tocá Solicitar" icon={PawPrint}
            visual={<UiFrame label={'Elegís qué mascota recibe la chapita y tocás "Solicitar".'}><MockPetSelector /></UiFrame>}
          >
            <p>
              La app te muestra el listado de <strong>tus mascotas que todavía no tienen chapita</strong>.
              Elegí la que quieras proteger y tocá <strong>"Solicitar"</strong>.
            </p>
            <p>
              Si la mascota no está cargada todavía, tocá <strong>"Registrar nueva mascota"</strong>
              y completá el formulario (ver Camino 2).
            </p>
            <ManualCallout tone="info" title="Importante" icon={ShieldCheck}>
              <p>
                Cada mascota tiene su propio código QR. Si tenés varias, solicitá una chapita por cada una.
              </p>
            </ManualCallout>
          </ManualStep>

          <ManualStep number={3} title="¡Solicitud enviada!" icon={CheckCircle2}
            visual={<UiFrame label="La solicitud se confirmó. Ya estás en lista para recibir la chapita."><MockSolicitudExitosa /></UiFrame>}
          >
            <p>
              Al confirmar, la app te muestra la pantalla <strong>"¡Solicitud enviada!"</strong>.
              Quedaste en <strong>lista de espera</strong> para recibir la chapita de tu mascota.
            </p>
          </ManualStep>

          <ManualStep number={4} title="La mascota queda en espera de asignación" icon={Clock}
            visual={<UiFrame label={'En la ficha de tu mascota, la identificación QR queda "pendiente".'}><MockQrPendiente /></UiFrame>}
          >
            <p>
              En la ficha de la mascota vas a ver el aviso
              <strong> "Solicitud de QR enviada. El admin te lo asignará pronto"</strong>.
            </p>
            <p>
              No tenés que hacer nada más: cuando el equipo te asigne el código, te lo vamos a notificar
              y la chapita quedará lista para retirar.
            </p>
            <ManualCta to="/mi-mascota" icon={PawPrint}>Ir a Mis mascotas</ManualCta>
          </ManualStep>
        </div>

        {/* ── CAMINO 2: MASCOTA NO REGISTRADA ──────────────────────── */}
        <div className="mt-16 sm:mt-20">
          <SubSectionTitle id="sin-mascota" icon={Camera}>
            Camino 2 · La mascota no está registrada
          </SubSectionTitle>
          <div className="space-y-10 sm:space-y-14">
            <ManualStep number={1} title={'Entrá a "Pedir chappita identificatoria"'} icon={QrCode}
              visual={<UiFrame label={'El banner te lleva a la solicitud. También podés entrar desde el botón "Solicitar".'}><MockChapitaBanner /></UiFrame>}
            >
              <p>
                Si la mascota <strong>no está cargada en la app</strong>, no hace falta registrarla antes:
                tocá <strong>"Solicitar"</strong> en el banner y entrá directo a la solicitud.
              </p>
              <p>
                Desde el banner también se abre un <strong>resumen de la chapita</strong> con el botón
                <strong> "Pedir chappita identificatoria"</strong> que te lleva a la misma pantalla.
              </p>
            </ManualStep>

            <ManualStep number={2} title="Completá los datos de tu mascota" icon={Camera}
              visual={<UiFrame label="Foto, nombre, especie y clasificación: la mascota queda registrada al pedir la chapita."><MockChapitaForm /></UiFrame>}
            >
              <p>
                Completá el formulario con la información de tu mascota:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Una <strong>foto</strong> clara (opcional, la podés agregar después).</li>
                <li><strong>Nombre</strong> y <strong>especie</strong>.</li>
                <li><strong>Clasificación</strong>: propia, tránsito, adopción o comunitaria.</li>
                <li>Raza, color, sexo, salud y un <strong>teléfono de emergencia</strong>.</li>
              </ul>
            </ManualStep>

            <ManualStep number={3} title="Completá tus datos y enviá la solicitud" icon={User}>
              <p>
                En la parte inferior del formulario van <strong>tus datos de contacto</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Nombre</strong>, <strong>email</strong> y <strong>WhatsApp</strong>.</li>
                <li>Si todavía no tenés cuenta, la creás <strong>en el momento</strong> con tu email y una contraseña.</li>
                <li>Si ya tenés cuenta, los datos aparecen completos automáticamente.</li>
              </ul>
              <ManualCallout tone="info" title="¿Es una mascota en adopción?" icon={Info}>
                <p>
                  Si la clasificás como <strong>"Adopción"</strong> y ya se va con el adoptante, la app te
                  pregunta por los <strong>datos del adoptante</strong>. En ese caso la chapita QR queda
                  asociada a él y recibe un link para confirmar la adopción.
                </p>
              </ManualCallout>
              <p className="text-xs text-gray-400">
                Si tu email todavía no está verificado, primero vas a ver la pantalla "¡Casi listo!"
                con el enlace para confirmar tu cuenta. Después de verificarlo, la solicitud queda completa.
              </p>
            </ManualStep>

            <ManualStep number={4} title="¡Solicitud enviada!" icon={CheckCircle2}
              visual={<UiFrame label="La mascota quedó registrada y en lista para su chapita."><MockSolicitudExitosa /></UiFrame>}
            >
              <p>
                Listo: la mascota quedó <strong>registrada en tu cuenta</strong> y en
                <strong> lista de espera</strong> para su chapita. Te notificaremos cuando esté asignada.
              </p>
              <ManualCta to="/solicitar-chapita" icon={QrCode}>Solicitar una chapita</ManualCta>
            </ManualStep>
          </div>
        </div>
      </section>

      {/* ── PARTE 2: CUANDO LLEGA LA CHAPITA ───────────────────────── */}
      <section>
        <ManualSectionTitle id="cuando-llega" icon={QrCode}>
          Cuando llega la chapita
        </ManualSectionTitle>

        <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-3xl">
          Cuando el equipo te asigna el código, <strong>te avisamos al instante</strong> y la chapita
          queda lista para retirar. Esto es lo que vas a ver y hacer:
        </p>

        <div className="space-y-10 sm:space-y-14 mt-8">
          <ManualStep number={1} title={'Recibís el aviso "Tu chapita QR está lista"'} icon={MessageCircle}
            visual={<UiFrame label="Te llega por WhatsApp (y por email) el aviso con el número y el lugar de retiro."><MockChapitaListaMsg /></UiFrame>}
          >
            <p>
              Cuando te asignan el código recibís el aviso
              <strong> "¡Tu chapita QR está lista!"</strong> por WhatsApp o email. Incluye:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>El <strong>número de chapita</strong> asignado a tu mascota.</li>
              <li>El <strong>lugar de retiro</strong> y los horarios.</li>
              <li>El <strong>link al perfil público</strong> de tu mascota.</li>
            </ul>
          </ManualStep>

          <ManualStep number={2} title="El QR aparece en la ficha de tu mascota" icon={QrCode}
            visual={<UiFrame label={'En "Identificación QR" ves el código, el número y podés copiar el link del perfil público.'}><MockQrAsignado /></UiFrame>}
          >
            <p>
              En <strong>"Mis mascotas"</strong> → ficha de tu mascota, la sección
              <strong> "Identificación QR"</strong> ahora muestra:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>El <strong>código QR</strong> con el número de tu chapita.</li>
              <li>El botón <strong>"Copiar link"</strong> del perfil público.</li>
            </ul>
            <ManualCallout tone="info" title="Controlá qué se ve al escanear" icon={ShieldCheck}>
              <p>
                Desde <strong>"Editar perfil público"</strong> elegís qué datos muestra el QR:
                nombre de contacto, teléfono, bio, salud y comportamiento. Vos decidís qué se ve.
              </p>
            </ManualCallout>
          </ManualStep>

          <ManualStep number={3} title="Tu mascota queda marcada como identificada" icon={ShieldCheck}
            visual={<UiFrame label={'En "Mis mascotas" la tarjeta de Rocky muestra el sello "Identificado" y su número.'}><MockMascotaIdentificada /></UiFrame>}
          >
            <p>
              La tarjeta de tu mascota en <strong>"Mis mascotas"</strong> ahora muestra el sello
              <strong> "Identificado"</strong> junto a su nombre, confirmando que ya tiene su chapita.
            </p>
          </ManualStep>

          <ManualStep number={4} title="Retirá la chapita y colocala en su collar" icon={MapPin}>
            <p>
              La chapita se retira en <strong>Forrajería Lina</strong> (659 entre 18 y 18bis),
              de martes a viernes de 10 a 18:30 y sábados de 10 a 13:30.
            </p>
            <p>
              Una vez retirada, colocala en el collar de tu mascota y ya queda protegida:
              cualquiera que la encuentre podrá escanear el código y contactarte al instante.
            </p>
            <ManualCallout tone="success" title="Chapita asignada" icon={CheckCircle2}>
              <p>
                Cuando la chapita ya está asignada, no hace falta volver a solicitarla: el código queda
                asociado a tu mascota para siempre, y podés reutilizarlo aunque cambies de teléfono o de cuenta.
              </p>
            </ManualCallout>
            <ManualCta to="/mi-mascota" icon={PawPrint}>Ver mis mascotas</ManualCta>
          </ManualStep>
        </div>
      </section>

      {/* ── PARTE 3: AL ESCANEAR EL QR ─────────────────────────────── */}
      <section>
        <ManualSectionTitle id="al-escanear" icon={Smartphone}>
          Al escanear el QR
        </ManualSectionTitle>

        <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-3xl">
          Cuando tu mascota tiene la chapita puesta, <strong>cualquier escaneo te llega a vos</strong>.
          Así es el ciclo completo de principio a fin:
        </p>

        <div className="space-y-10 sm:space-y-14 mt-8">
          <ManualStep number={1} title="Quien la encuentra escanea y ve el perfil" icon={Smartphone}
            visual={<UiFrame label="Al escanear el QR se abre el perfil público de la mascota con el contacto del dueño."><MockScanPerfilPublico /></UiFrame>}
          >
            <p>
              Cualquier persona que encuentre a tu mascota puede <strong>escanear el código</strong>
              con la cámara del celular (no necesita la app instalada).
            </p>
            <p>
              Se abre el <strong>perfil público</strong> de tu mascota: fotos, nombre, señas particulares
              y el botón para <strong>contactarte o avisarte que la encontró</strong>.
            </p>
          </ManualStep>

          <ManualStep number={2} title="Te llega el aviso del escaneo al instante" icon={Bell}
            visual={<UiFrame label="Cada vez que escanean el QR, te avisamos por WhatsApp, email o notificación."><MockScanNotif /></UiFrame>}
          >
            <p>
              Cada escaneo te genera un aviso:
              <strong> "📍 Escanearon el QR de tu mascota"</strong>, con la ubicación aproximada
              si la persona lo permitió.
            </p>
            <p>
              Así sabés que el perfil está funcionando y que alguien lo está mirando, incluso si nadie te llama.
            </p>
          </ManualStep>

          <ManualStep number={3} title="Si la encontraron, te contactan al toque" icon={HeartHandshake}>
            <p>
              Desde el perfil público, quien encontró a tu mascota puede tocar
              <strong> "¡Encontré a Rocky!"</strong> y dejar su nombre, teléfono y ubicación.
            </p>
            <p>
              Te llega el aviso <strong>"¡Encontraron a Rocky!"</strong> con esos datos para que puedas
              coordinar el reencuentro lo antes posible.
            </p>
            <ManualCallout tone="success" title="La chapita te protege todo el día" icon={Link2}>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span><strong>Localización rápida</strong> — si se pierde, quien la encuentra sabe cómo contactarte.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span><strong>Avisos en vivo</strong> — cada escaneo y cada hallazgo te llegan al instante.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span><strong>Sin collar ni chapita metálica</strong> — el QR va en una chappita liviana y resistente.</span>
                </li>
              </ul>
            </ManualCallout>
            <ManualCta to="/solicitar-chapita" icon={QrCode}>Solicitar mi chapita</ManualCta>
          </ManualStep>
        </div>
      </section>
    </ManualLayout>
  );
}
