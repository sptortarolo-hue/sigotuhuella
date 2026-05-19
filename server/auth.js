import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3',
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(email, resetToken) {
  console.log('SMTP Config:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
  });
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

  return transporter.sendMail({
    from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Recuperá tu contraseña - Sigo Tu Huella',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2d3748;">¿Olvidaste tu contraseña?</h2>
        <p style="color: #4a5568; font-size: 16px;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Sigo Tu Huella</strong>.
        </p>
        <p style="color: #4a5568; font-size: 16px;">
          Si no realizaste esta solicitud, podés ignorar este correo.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #5a67d8; color: white; padding: 14px 28px; 
                    text-decoration: none; border-radius: 8px; font-weight: bold; 
                    display: inline-block;">
            Restablecer mi contraseña
          </a>
        </div>
        <p style="color: #718096; font-size: 14px;">
          Este enlace vence en <strong>1 hora</strong>.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br>
          ${resetUrl}
        </p>
      </div>
    `,
  });
}

export function generateResetToken() {
  return uuidv4().replace(/-/g, '');
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function sendWelcomeEmail(email, displayName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
  
  try {
    await transporter.sendMail({
      from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '¡Te damos la bienvenida a Sigo Tu Huella! 🐾',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="background-color: #9a3412; color: white; width: 60px; height: 60px; line-height: 60px; font-size: 30px; border-radius: 20px; display: inline-block; text-align: center; margin: 0 auto;">🐾</div>
          </div>
          <h2 style="color: #9a3412; text-align: center; font-size: 24px; margin-bottom: 10px;">¡Hola, ${displayName}!</h2>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; text-align: center;">
            Nos alegra un montón que te hayas sumado a <strong>Sigo Tu Huella</strong>, la red solidaria de vecinos para cuidar y reencontrar a nuestras mascotas en Sicardi, Garibaldi y alrededores.
          </p>
          <div style="background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <h3 style="color: #dd6b20; margin-top: 0; font-size: 18px;">💡 ¿Qué podés hacer ahora?</h3>
            <ul style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;"><strong>Reportar mascotas perdidas o encontradas:</strong> Cargá fotos, ubicación en tiempo real y datos de contacto rápido.</li>
              <li style="margin-bottom: 8px;"><strong>Ver mapa en vivo:</strong> Ubicá reportes en Sicardi y Garibaldi para ayudar en las búsquedas activas.</li>
              <li style="margin-bottom: 8px;"><strong>Colaborar y transitar:</strong> Sumate a las campañas de ayuda o postulate para dar tránsito a mascotas en adopción.</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}" 
               style="background-color: #9a3412; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 12px; font-weight: bold; 
                      display: inline-block; box-shadow: 0 4px 6px rgba(154, 52, 18, 0.15);">
              Explorar Sigo Tu Huella
            </a>
          </div>
          <p style="color: #718096; font-size: 14px; text-align: center; line-height: 1.6;">
            ¡Juntos hacemos la diferencia y devolvemos la felicidad a muchas familias!
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
          <p style="color: #a0aec0; font-size: 12px; text-align: center;">
            Este correo fue enviado automáticamente por Sigo Tu Huella. Por favor no lo respondas de forma directa.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Welcome email error:', err);
  }
}

export async function sendMemberApprovalEmail(email, displayName, memberNumber) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
  
  try {
    await transporter.sendMail({
      from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '¡Tu solicitud de socio ha sido aceptada! 🎉💳 Sigo Tu Huella',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="background-color: #10b981; color: white; width: 60px; height: 60px; line-height: 60px; font-size: 30px; border-radius: 20px; display: inline-block; text-align: center; margin: 0 auto;">🤝</div>
          </div>
          <h2 style="color: #9a3412; text-align: center; font-size: 24px; margin-bottom: 10px;">¡Felicitaciones, ${displayName}!</h2>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; text-align: center;">
            Tu solicitud ha sido revisada y aprobada. ¡Oficialmente ya sos **Socio Activo** de <strong>Sigo Tu Huella</strong>! 🐾❤️
          </p>
          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="color: #065f46; font-size: 14px; margin: 0 0 10px 0; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">TU NÚMERO DE SOCIO</p>
            <h3 style="color: #047857; margin: 0; font-size: 28px; font-family: monospace; letter-spacing: 2px;">${memberNumber}</h3>
          </div>
          <div style="background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <h4 style="color: #dd6b20; margin-top: 0; font-size: 16px;">💳 ¡Ya tenés acceso a tu Carnet Digital!</h4>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin-bottom: 0;">
              Ingresando en la sección <strong>Asociado -> Mi Carnet</strong> vas a poder ver tu tarjeta virtual de socio con tu foto, tu código QR único y tus insignias ganadas por colaborar con el refugio y las búsquedas activas.
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/dashboard" 
               style="background-color: #10b981; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 12px; font-weight: bold; 
                      display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">
              Ver mi Carnet de Socio
            </a>
          </div>
          <p style="color: #718096; font-size: 14px; text-align: center; line-height: 1.6;">
            Tu aporte voluntario nos permite seguir salvando vidas y garantizando tránsitos, vacunas y atención veterinaria para cada animalito de la zona. ¡Gracias de corazón por comprometerte con ellos!
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
          <p style="color: #a0aec0; font-size: 12px; text-align: center;">
            Este correo fue enviado automáticamente por Sigo Tu Huella. Por favor no lo respondas de forma directa.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Member approval email error:', err);
  }
}
