import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const testGmailConnection = async () => {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  
  if (!appPassword) {
    console.error('❌ GMAIL_APP_PASSWORD no está configurada');
    return false;
  }

  console.log('🔍 Testing Gmail SMTP connection...');
  console.log('📧 User: byronvera113@gmail.com');
  console.log('🔑 App Password present:', !!appPassword);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'byronvera113@gmail.com',
      pass: appPassword,
    },
  });

  try {
    // Prueba 1: Verificar conexión
    console.log('\n⏳ Verificando conexión con Gmail...');
    await transporter.verify();
    console.log('✅ Conexión verificada correctamente');

    // Prueba 2: Enviar email de prueba
    console.log('\n⏳ Enviando email de prueba...');
    const testEmail = await transporter.sendMail({
      from: 'byronvera113@gmail.com',
      to: 'byronvera113@gmail.com', // Envía a ti mismo para probar
      subject: '✅ Test de conexión SMTP desde Render',
      html: `
        <h1>Test exitoso</h1>
        <p>Si ves este email, la conexión SMTP funciona correctamente.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
    });

    console.log('✅ Email enviado exitosamente');
    console.log('📨 Message ID:', testEmail.messageId);
    console.log('\n✨ Gmail SMTP está 100% funcional');
    return true;

  } catch (error) {
    console.error('\n❌ Error de conexión:');
    console.error('Código:', error.code);
    console.error('Mensaje:', error.message);
    
    if (error.code === 'ETIMEDOUT') {
      console.error('\n⚠️  Es un timeout - Render probablemente bloquea SMTP');
      return false;
    }
    
    if (error.code === 'EAUTH') {
      console.error('\n⚠️  Error de autenticación - Verifica la App Password');
      return false;
    }
    
    return false;
  }
};

// Ejecutar test
testGmailConnection().then(success => {
  process.exit(success ? 0 : 1);
});