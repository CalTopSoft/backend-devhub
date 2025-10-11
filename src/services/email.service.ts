import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { INotification } from '../models/Notification';

// Configuración del transporter de Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'byronvera113@gmail.com',
    pass: env.GMAIL_APP_PASSWORD,
  },
});

interface ResetPasswordEmailOptions {
  to: string;
  username: string;
  resetToken: string;
  origin?: string; // ← NUEVO: para detectar de dónde viene
}

interface NotificationEmailOptions {
  to: string;
  username: string;
  notification: INotification;
  project?: any;
}

export async function sendResetPasswordEmail({ 
  to, 
  username, 
  resetToken, 
  origin 
}: ResetPasswordEmailOptions) {
  // Determinar qué URL usar basado en el origin
  let resetUrl: string;
  
  if (origin === env.ADMIN_ORIGIN || origin === env.EXTRA_ORIGIN) {
    // Si viene del admin, usar la página del admin
    resetUrl = `${env.ADMIN_ORIGIN}/reset-password.html?token=${resetToken}`;
  } else {
    // Si viene de la plataforma principal, usar hash routing
    resetUrl = `${env.FRONTEND_ORIGIN}/#/reset-password?token=${resetToken}`;
  }
  
  console.log(`[EMAIL] Enviando reset password a: ${to}`);
  console.log(`[EMAIL] Origin detectado: ${origin}`);
  console.log(`[EMAIL] URL generada: ${resetUrl}`);
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperación de Contraseña</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            .header h1 {
                font-size: 28px;
                margin-bottom: 10px;
                font-weight: 700;
            }
            .header p {
                font-size: 16px;
                opacity: 0.9;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
                color: #4f46e5;
                font-weight: 600;
            }
            .message {
                font-size: 16px;
                margin-bottom: 30px;
                line-height: 1.8;
                color: #374151;
            }
            .button-container {
                text-align: center;
                margin: 40px 0;
            }
            .reset-button {
                display: inline-block;
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                color: white;
                text-decoration: none;
                padding: 16px 32px;
                border-radius: 50px;
                font-weight: 600;
                font-size: 16px;
                transition: all 0.3s ease;
                box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
            }
            .reset-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 35px rgba(99, 102, 241, 0.4);
            }
            .warning {
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 8px;
            }
            .warning-icon {
                color: #f59e0b;
                font-weight: bold;
                margin-right: 8px;
            }
            .footer {
                background: #f8fafc;
                padding: 30px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer p {
                font-size: 14px;
                color: #6b7280;
                margin-bottom: 10px;
            }
            .security-info {
                background: #f0f9ff;
                border: 1px solid #0ea5e9;
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
            }
            .security-info h3 {
                color: #0369a1;
                margin-bottom: 10px;
                font-size: 16px;
            }
            .security-info ul {
                color: #0c4a6e;
                font-size: 14px;
                margin-left: 20px;
            }
            .security-info li {
                margin-bottom: 5px;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 0 10px;
                    border-radius: 15px;
                }
                .header, .content, .footer {
                    padding: 25px 20px;
                }
                .header h1 {
                    font-size: 24px;
                }
                .reset-button {
                    padding: 14px 24px;
                    font-size: 14px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Recuperación de Contraseña</h1>
                <p>Tu solicitud de cambio de contraseña</p>
            </div>
            
            <div class="content">
                <div class="greeting">
                    Hola ${username}!
                </div>
                
                <div class="message">
                    Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. 
                    Si fuiste tú quien realizó esta solicitud, puedes crear una nueva contraseña 
                    haciendo clic en el botón de abajo.
                </div>
                
                <div class="button-container">
                    <a href="${resetUrl}" class="reset-button">
                        Restablecer mi contraseña
                    </a>
                </div>
                
                <div class="warning">
                    <span class="warning-icon">⚠️</span>
                    <strong>Este enlace expirará en 5 minutos</strong> por motivos de seguridad.
                </div>
                
                <div class="security-info">
                    <h3>Información de Seguridad</h3>
                    <ul>
                        <li>Este enlace solo puede usarse una vez</li>
                        <li>Si no solicitaste este cambio, ignora este correo</li>
                        <li>Solo tienes 3 intentos por día para solicitar recuperación</li>
                        <li>Tu contraseña actual permanece segura hasta que la cambies</li>
                    </ul>
                </div>
                
                <div class="message">
                    Si tienes problemas con el botón, también puedes copiar y pegar este enlace 
                    en tu navegador:
                    <br><br>
                    <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
                </div>
            </div>
            
            <div class="footer">
                <p><strong>¿No solicitaste este cambio?</strong></p>
                <p>Si no fuiste tú, puedes ignorar este correo de forma segura. Tu contraseña no será modificada.</p>
                <p style="margin-top: 20px; color: #9ca3af;">
                    Este es un correo automático, por favor no respondas a este mensaje.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: {
      name: 'Sistema de Recuperación',
      address: 'byronvera113@gmail.com'
    },
    to,
    subject: 'Recupera tu contraseña - Acción requerida',
    html: htmlContent,
    text: `
      ¡Hola ${username}!
      
      Hemos recibido una solicitud para restablecer tu contraseña.
      
      Para crear una nueva contraseña, visita este enlace:
      ${resetUrl}
      
      Este enlace expirará en 5 minutos por motivos de seguridad.
      
      Si no solicitaste este cambio, puedes ignorar este correo de forma segura.
      
      Saludos,
      El equipo de soporte
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de recuperación enviado a: ${to}`);
    return true;
  } catch (error) {
    console.error('Error enviando email:', error);
    throw new Error('Error al enviar el correo de recuperación');
  }
}

// Resto del código de sendNotificationEmail se mantiene igual...
export async function sendNotificationEmail({ to, username, notification, project }: NotificationEmailOptions) {
  const dashboardUrl = `${env.FRONTEND_ORIGIN}/dashboard`;
  const projectUrl = project ? `${env.FRONTEND_ORIGIN}/projects/${project.slug}` : null;
  
  // Configurar colores y contenido basado en el tipo y prioridad
  const getNotificationStyle = () => {
    switch (notification.type) {
      case 'project_status':
        if (notification.data?.newStatus === 'published') {
          return {
            color: '#059669',
            bgColor: '#ecfdf5',
            borderColor: '#10b981',
            icon: '✅',
            emoji: '🎉'
          };
        } else if (notification.data?.newStatus === 'rejected') {
          return {
            color: '#dc2626',
            bgColor: '#fef2f2',
            borderColor: '#ef4444',
            icon: '❌',
            emoji: '⚠️'
          };
        }
        return {
          color: '#2563eb',
          bgColor: '#eff6ff',
          borderColor: '#3b82f6',
          icon: '🔄',
          emoji: '📋'
        };
      case 'project_feedback':
        return {
          color: '#7c3aed',
          bgColor: '#faf5ff',
          borderColor: '#8b5cf6',
          icon: '💬',
          emoji: '📝'
        };
      case 'project_warning':
        return {
          color: '#ea580c',
          bgColor: '#fff7ed',
          borderColor: '#f97316',
          icon: '⚠️',
          emoji: '🚨'
        };
      case 'project_deleted':
        return {
          color: '#be123c',
          bgColor: '#fdf2f8',
          borderColor: '#e11d48',
          icon: '🗑️',
          emoji: '❌'
        };
      default:
        return {
          color: '#374151',
          bgColor: '#f9fafb',
          borderColor: '#6b7280',
          icon: 'ℹ️',
          emoji: '📢'
        };
    }
  };

  const style = getNotificationStyle();
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${notification.title}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                background: linear-gradient(135deg, ${style.color}20 0%, ${style.color}10 100%);
                padding: 20px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, ${style.color} 0%, ${style.borderColor} 100%);
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            .header h1 {
                font-size: 28px;
                margin-bottom: 10px;
                font-weight: 700;
            }
            .header .icon {
                font-size: 48px;
                margin-bottom: 15px;
                display: block;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
                color: ${style.color};
                font-weight: 600;
            }
            .message {
                font-size: 16px;
                margin-bottom: 30px;
                line-height: 1.8;
                color: #374151;
                white-space: pre-line;
            }
            .project-info {
                background: ${style.bgColor};
                border-left: 4px solid ${style.borderColor};
                padding: 20px;
                margin: 20px 0;
                border-radius: 8px;
            }
            .project-info h3 {
                color: ${style.color};
                margin-bottom: 10px;
                font-size: 16px;
            }
            .reasons-list {
                background: #f9fafb;
                border-radius: 8px;
                padding: 15px;
                margin: 15px 0;
            }
            .reasons-list h4 {
                color: #374151;
                margin-bottom: 10px;
                font-size: 14px;
                font-weight: 600;
            }
            .reasons-list ul {
                margin-left: 15px;
                color: #6b7280;
            }
            .reasons-list li {
                margin-bottom: 5px;
                font-size: 14px;
            }
            .button-container {
                text-align: center;
                margin: 30px 0;
            }
            .action-button {
                display: inline-block;
                background: linear-gradient(135deg, ${style.color} 0%, ${style.borderColor} 100%);
                color: white;
                text-decoration: none;
                padding: 16px 32px;
                border-radius: 50px;
                font-weight: 600;
                font-size: 16px;
                transition: all 0.3s ease;
                box-shadow: 0 10px 25px ${style.color}30;
            }
            .action-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 35px ${style.color}40;
            }
            .footer {
                background: #f8fafc;
                padding: 30px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer p {
                font-size: 14px;
                color: #6b7280;
                margin-bottom: 10px;
            }
            .admin-signature {
                background: #f0f9ff;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                text-align: center;
            }
            .admin-signature p {
                color: #0369a1;
                font-size: 14px;
                margin: 5px 0;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 0 10px;
                    border-radius: 15px;
                }
                .header, .content, .footer {
                    padding: 25px 20px;
                }
                .header h1 {
                    font-size: 24px;
                }
                .action-button {
                    padding: 14px 24px;
                    font-size: 14px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <span class="icon">${style.emoji}</span>
                <h1>${notification.title}</h1>
            </div>
            
            <div class="content">
                <div class="greeting">
                    Hola ${username},
                </div>
                
                <div class="message">${notification.message}</div>
                
                ${project ? `
                <div class="project-info">
                    <h3>${style.icon} Información del Proyecto</h3>
                    <p><strong>Proyecto:</strong> ${project.title}</p>
                    ${notification.data?.oldStatus ? `<p><strong>Estado anterior:</strong> ${notification.data.oldStatus}</p>` : ''}
                    ${notification.data?.newStatus ? `<p><strong>Estado actual:</strong> ${notification.data.newStatus}</p>` : ''}
                </div>
                ` : ''}
                
                ${notification.data?.reasons && notification.data.reasons.length > 0 ? `
                <div class="reasons-list">
                    <h4>Detalles específicos:</h4>
                    <ul>
                        ${notification.data.reasons.map(reason => `<li>${reason}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${notification.data?.customMessage ? `
                <div class="project-info">
                    <h3>Mensaje adicional del administrador:</h3>
                    <p>${notification.data.customMessage}</p>
                </div>
                ` : ''}
                
                <div class="button-container">
                    <a href="${dashboardUrl}" class="action-button">
                        Ver en Dashboard
                    </a>
                </div>
                
                ${projectUrl && project.status === 'published' ? `
                <div class="button-container">
                    <a href="${projectUrl}" class="action-button" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                        Ver Proyecto Publicado
                    </a>
                </div>
                ` : ''}
                
                ${notification.data?.adminName ? `
                <div class="admin-signature">
                    <p>Administrador: <strong>${notification.data.adminName}</strong></p>
                    <p>Fecha: ${new Date(notification.createdAt).toLocaleDateString('es-ES')}</p>
                </div>
                ` : ''}
            </div>
            
            <div class="footer">
                <p>Este correo fue enviado automáticamente desde el sistema de notificaciones.</p>
                <p>Para más detalles, visita tu dashboard o responde a este correo si necesitas ayuda.</p>
                <p style="margin-top: 20px; color: #9ca3af;">
                    Sistema de Gestión de Proyectos - Uni Store
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  const textContent = `
    ${notification.title}
    
    Hola ${username},
    
    ${notification.message}
    
    ${project ? `
    Proyecto: ${project.title}
    ${notification.data?.oldStatus ? `Estado anterior: ${notification.data.oldStatus}` : ''}
    ${notification.data?.newStatus ? `Estado actual: ${notification.data.newStatus}` : ''}
    ` : ''}
    
    ${notification.data?.reasons && notification.data.reasons.length > 0 ? `
    Detalles específicos:
    ${notification.data.reasons.map(reason => `• ${reason}`).join('\n')}
    ` : ''}
    
    ${notification.data?.customMessage ? `
    Mensaje adicional del administrador:
    ${notification.data.customMessage}
    ` : ''}
    
    Para más información, visita tu dashboard: ${dashboardUrl}
    
    ${notification.data?.adminName ? `
    Administrador: ${notification.data.adminName}
    Fecha: ${new Date(notification.createdAt).toLocaleDateString('es-ES')}
    ` : ''}
    
    ---
    Este correo fue enviado automáticamente desde el sistema de notificaciones.
    Sistema de Gestión de Proyectos - Uni Store
  `;

  const mailOptions = {
    from: {
      name: 'Sistema de Notificaciones - Uni Store',
      address: 'byronvera113@gmail.com'
    },
    to,
    subject: `${style.icon} ${notification.title}`,
    html: htmlContent,
    text: textContent
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de notificación enviado a: ${to}`);
    return true;
  } catch (error) {
    console.error('Error enviando email de notificación:', error);
    throw new Error('Error al enviar el correo de notificación');
  }
}