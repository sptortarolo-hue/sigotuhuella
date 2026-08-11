import { Helmet } from 'react-helmet-async';
import { UserX, Trash2, Mail, Info, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const CONTACT_EMAIL = 'info@sigotuhuella.com.ar';

function Step({ icon: Icon, children }: { icon: any; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-brand-accent">
      <div className="w-10 h-10 sm:w-11 sm:h-11 bg-brand-secondary/10 rounded-2xl flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-secondary" />
      </div>
      <div className="text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

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

export default function EliminarCuenta() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Helmet>
        <title>Eliminación de cuenta | Sigo Tu Huella</title>
        <meta name="description" content="Cómo eliminar tu cuenta en Sigo Tu Huella. Pasos para dar de baja tu cuenta y qué datos se borran o se conservan." />
      </Helmet>

      <header className="mb-10">
        <div className="w-14 h-14 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mb-4">
          <UserX className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-3">Eliminación de cuenta</h1>
        <p className="text-gray-500">Última actualización: agosto de 2026</p>
      </header>

      <div className="space-y-12">
        <SectionCard id="como" title="Cómo eliminar tu cuenta">
          <P>
            Podés eliminar tu cuenta y todos tus datos personales directamente desde la aplicación, sin necesidad de contactarnos. El proceso es inmediato y no requiere confirmación adicional.
          </P>
          <div className="space-y-3">
            <Step icon={Trash2}>
              <strong>1. Abrí la aplicación</strong> e iniciá sesión con tu cuenta.
            </Step>
            <Step icon={ShieldCheck}>
              <strong>2. Entrá a tu Perfil</strong> tocando el ícono de usuario (menú inferior o lateral según el dispositivo).
            </Step>
            <Step icon={UserX}>
              <strong>3. Tocá "Eliminar cuenta"</strong> y confirmá. Tu cuenta y tus datos personales se borran de inmediato.
            </Step>
          </div>
        </SectionCard>

        <SectionCard id="alternativa" title="¿No podés entrar a tu cuenta?">
          <div className="p-5 bg-white rounded-2xl border border-brand-accent flex items-center gap-3">
            <Mail className="w-8 h-8 text-brand-primary shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Pedí la baja por email</p>
              <p className="text-sm text-gray-500 break-all">
                Escribinos a <strong>{CONTACT_EMAIL}</strong> con el asunto "Baja de cuenta" e indicá el email de tu cuenta.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard id="datos" title="Qué se elimina">
          <P>Al eliminar tu cuenta se borran de forma permanente:</P>
          <ul className="list-disc pl-5 mb-3">
            <Li>Tu cuenta y tus datos personales (nombre, email, teléfono y contraseña).</Li>
            <Li>Las mascotas registradas en "Mis mascotas" y su historial (fotos, eventos, publicaciones del feed).</Li>
            <Li>Tus votos en concursos, invitaciones y asignaciones de adopción.</Li>
            <Li>Tus tokens de notificaciones push, suscripciones, comentarios y puntos.</Li>
          </ul>
        </SectionCard>

        <SectionCard id="conserva" title="Qué se conserva">
          <div className="p-5 bg-white rounded-2xl border border-brand-accent flex items-start gap-3">
            <Info className="w-8 h-8 text-brand-secondary shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Mascotas públicas anonimizadas</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Las mascotas perdidas o en adopción que publicaste quedan en el aviso público para que la comunidad pueda seguir ayudándolas, pero se <strong>anonimizan</strong>: se quitan tu nombre, tu teléfono de contacto y tus redes sociales. No es posible asociarlas a vos.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard id="contacto" title="Contacto">
          <P>
            Si tenés dudas sobre la eliminación de tu cuenta o sobre el tratamiento de tus datos, escribinos a{' '}
            <Mail className="inline w-4 h-4 -mt-0.5" /> <strong>{CONTACT_EMAIL}</strong>.
          </P>
        </SectionCard>
      </div>
    </div>
  );
}
