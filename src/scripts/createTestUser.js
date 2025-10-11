const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Conectar a MongoDB
mongoose.connect('mongodb+srv://FastXstudios:CGhZUvgtRMfi9kRv@cluster0.tbln3cx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

// Definir esquema del usuario (copia del modelo)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  photo: { type: String },
  career: { type: String },
  semester: { type: Number },
  age: { type: Number },
  contacts: {
    whatsapp: String,
    email: String,
    outlook: String,
  },
  companiesCount: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  resetPasswordAttempts: { type: Number, default: 0 },
  resetPasswordLastAttempt: { type: Date },
});

const User = mongoose.model('User', UserSchema);

async function createTestUser() {
  try {
    // Datos del usuario de prueba
    const userData = {
      username: 'testuserrecovery',
      email: 'test@example.com',
      passwordHash: await bcrypt.hash('123456', 10),
      career: 'Ingeniería en Sistemas',
      semester: 7,
      age: 22,
      contacts: {
        whatsapp: '+593987654321',
        email: 'test.personal@gmail.com',
        outlook: 'test.work@outlook.com'
      },
      role: 'user'
    };

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ 
      $or: [
        { username: userData.username },
        { email: userData.email }
      ]
    });

    if (existingUser) {
      console.log('❌ Usuario ya existe. Eliminando primero...');
      await User.deleteOne({ _id: existingUser._id });
    }

    // Crear usuario
    const user = new User(userData);
    await user.save();

    console.log('✅ Usuario de prueba creado exitosamente!');
    console.log('📧 Datos del usuario:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email principal: ${user.email}`);
    console.log(`   Email personal: ${user.contacts.email}`);
    console.log(`   Email Outlook: ${user.contacts.outlook}`);
    console.log(`   Contraseña: 123456`);
    console.log(`   ID: ${user._id}`);
    
    console.log('\n🧪 Pruebas que puedes hacer:');
    console.log('1. Solicitar reset con email principal: test@example.com');
    console.log('2. Solicitar reset con email personal: test.personal@gmail.com');
    console.log('3. Solicitar reset con email Outlook: test.work@outlook.com');
    console.log('4. Probar límite de 3 intentos por día');
    console.log('5. Probar expiración de token (5 minutos)');

  } catch (error) {
    console.error('❌ Error creando usuario:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

createTestUser();