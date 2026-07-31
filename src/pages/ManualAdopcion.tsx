import ManualLayout from '@/src/components/manual/ManualLayout';
import ManualSectionTitle from '@/src/components/manual/ManualSectionTitle';
import ManualStep from '@/src/components/manual/ManualStep';
import ManualCallout from '@/src/components/manual/ManualCallout';
import ManualCta from '@/src/components/manual/ManualCta';
import UiFrame from '@/src/components/manual/UiFrame';
import MockMyPetsCard from '@/src/components/manual/mockups/MockMyPetsCard';
import MockAdoptionModal from '@/src/components/manual/mockups/MockAdoptionModal';
import MockPendingList from '@/src/components/manual/mockups/MockPendingList';
import MockWhatsAppMsg from '@/src/components/manual/mockups/MockWhatsAppMsg';
import MockClaimPage from '@/src/components/manual/mockups/MockClaimPage';
import MockSuccessScreen from '@/src/components/manual/mockups/MockSuccessScreen';
import {
  Heart, HeartHandshake, PawPrint, Clock, MessageCircle, XCircle,
  Link2, FileText, LogIn, Info, ShieldCheck,
} from 'lucide-react';

export default function ManualAdopcion() {
  return (
    <ManualLayout
      chapterTitle="Cómo funciona la adopción"
      chapterDescription="Desde que una mascota se da en adopción hasta que confirma su nueva familia. Guía paso a paso para quien entrega y para quien recibe."
      icon={Heart}
      sections={[
        { id: 'doy-en-adopcion', label: 'Doy en adopción' },
        { id: 'voy-a-adoptar', label: 'Voy a adoptar' },
        { id: 'que-significa', label: '¿Qué significa adoptar?' },
      ]}
    >
      {/* ── PARTE A: DOY EN ADOPCIÓN ─────────────────────────────── */}
      <section>
        <ManualSectionTitle id="doy-en-adopcion" icon={HeartHandshake}>
          Doy en adopción una mascota propia
        </ManualSectionTitle>
        <div className="space-y-10 sm:space-y-14">
          <ManualStep number={1} title="Entrá a Mis mascotas" icon={PawPrint}
            visual={<UiFrame label={'En la sección "Mis mascotas" se listan todos tus compañeros.'}><MockMyPetsCard /></UiFrame>}
          >
            <p>
              Ingresá a la sección <strong>"Mis mascotas"</strong> desde el menú de la app
              (en el celular, desde el primer tab o el menú "Más").
            </p>
            <p>Ahí vas a ver el listado de las mascotas que registraste.</p>
            <ManualCta to="/mi-mascota" icon={PawPrint}>Ir a Mis mascotas</ManualCta>
          </ManualStep>

          <ManualStep number={2} title={'Tocá "Dar en adopción"'} icon={Heart}
            visual={<UiFrame label={'El botón "Dar en adopción" aparece dentro de la ficha de la mascota.'}><MockAdoptionModal /></UiFrame>}
          >
            <p>
              Elegí la mascota que vas a entregar y tocá <strong>"Dar en adopción"</strong>.
            </p>
            <p>
              Se abre una ventana donde tenés que completar los datos de la persona que se lleva la mascota:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Nombre</strong> del adoptante</li>
              <li><strong>Email</strong></li>
              <li><strong>WhatsApp</strong></li>
            </ul>
            <p className="text-xs text-gray-400">El WhatsApp debe tener el formato 549 + código de área sin 0 + teléfono.</p>
          </ManualStep>

          <ManualStep number={3} title={'La mascota queda en "Adopciones pendientes"'} icon={Clock}
            visual={<UiFrame label="Podés seguir y cancelar la adopción hasta que el adoptante confirme."><MockPendingList /></UiFrame>}
          >
            <p>
              Al confirmar la entrega, la mascota pasa a estar <strong>"En adopción"</strong> y
              aparece en tu sección <strong>"Adopciones pendientes"</strong>, dentro de Mis mascotas.
            </p>
            <p>
              Ahí vas a ver el nombre de la mascota y los datos del adoptante elegido.
            </p>
          </ManualStep>

          <ManualStep number={4} title="El adoptante recibe el link por WhatsApp y email" icon={MessageCircle}
            visual={<UiFrame label="El adoptante recibe el mismo mensaje por WhatsApp y por email."><MockWhatsAppMsg /></UiFrame>}
          >
            <p>
              La persona elegida recibe una invitación con un <strong>link personal</strong>,
              tanto por <strong>WhatsApp</strong> como por <strong>email</strong>.
            </p>
            <p>
              Ese link es único para ella: nadie más puede confirmar esa adopción.
            </p>
          </ManualStep>

          <ManualStep number={5} title="Cuando confirme, la mascota pasa a ser suya" icon={XCircle}>
            <p>
              En cuanto el adoptante abre el link y confirma, la mascota pasa a estar
              <strong> oficialmente adoptada</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deja de aparecer en tus pendientes.</li>
              <li>Aparece en el "Mis mascotas" del nuevo dueño.</li>
              <li>La chapita QR queda asociada a su cuenta.</li>
            </ul>
            <ManualCallout tone="warning" title="¿Cambió el acuerdo?" icon={Info}>
              <p>
                Mientras el adoptante no confirme, podés <strong>cancelar la adopción</strong> desde
                "Adopciones pendientes". La mascota vuelve a estar disponible y el adoptante recibe el aviso.
              </p>
            </ManualCallout>
          </ManualStep>
        </div>
      </section>

      {/* ── PARTE B: VOY A ADOPTAR ───────────────────────────────── */}
      <section>
        <ManualSectionTitle id="voy-a-adoptar" icon={Heart}>
          Voy a adoptar una mascota
        </ManualSectionTitle>
        <div className="space-y-10 sm:space-y-14">
          <ManualStep number={1} title="Abrí el link que te enviaron" icon={Link2}>
            <p>
              El dueño te elige a vos y te envía un <strong>link personal</strong> por
              <strong> WhatsApp y email</strong> (es el mismo mensaje del paso 4 de la sección anterior).
            </p>
            <p>
              Ese link es intransferible: la adopción queda reservada para vos.
            </p>
          </ManualStep>

          <ManualStep number={2} title="Revisá la invitación" icon={FileText}
            visual={<UiFrame label="La invitación muestra la mascota y qué significa adoptarla."><MockClaimPage /></UiFrame>}
          >
            <p>
              Al abrir el link vas a ver los datos de la mascota y quién te la confía,
              junto con una explicación de qué significa adoptarla.
            </p>
            <p>
              Si no querés confirmar, no tenés que hacer nada: el dueño puede cancelar
              y la mascota quedará disponible para otra persona.
            </p>
          </ManualStep>

          <ManualStep number={3} title="Ingresá con el mismo email y confirmá" icon={LogIn}
            visual={<UiFrame label={'Al confirmar, la mascota pasa a tu "Mis mascotas" con su QR.'}><MockSuccessScreen /></UiFrame>}
          >
            <p>
              Para confirmar necesitás tener una cuenta. Si todavía no la tenés,
              registrate con <strong>el mismo email con el que te invitaron</strong>.
            </p>
            <ManualCallout tone="info" title="Importante" icon={ShieldCheck}>
              <p>
                La invitación está atada a tu email. Si te registrás o ingresás con otro,
                la app te va a avisar que el link corresponde a otra cuenta.
              </p>
            </ManualCallout>
            <div className="flex flex-col sm:flex-row gap-3">
              <ManualCta to="/login" icon={LogIn}>Iniciar sesión</ManualCta>
              <ManualCta to="/register" variant="secondary">Crear cuenta</ManualCta>
            </div>
            <p>
              Después tocá <strong>"Confirmar adopción"</strong> y listo: la mascota aparece en tu
              <strong> "Mis mascotas"</strong> y la chapita QR queda asociada a tu cuenta.
            </p>
          </ManualStep>
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
