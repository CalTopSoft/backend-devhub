// src/scripts/seed-platforms.js
const mongoose = require('mongoose');
require('dotenv').config();

// Definir el esquema mínimo para Platform (solo lo necesario para insertar)
const platformSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  icon: { type: String, default: '📱' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

const Platform = mongoose.model('Platform', platformSchema, 'platforms');

async function seedPlatforms() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI no encontrado en variables de entorno');
    }

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    // Datos iniciales de plataformas
    const initialPlatforms = [
      { name: 'Android', code: 'android', description: 'Sistema operativo móvil de Google', icon: '🤖', order: 1 },
      { name: 'iOS', code: 'ios', description: 'Sistema operativo móvil de Apple', icon: '📱', order: 2 },
      { name: 'Windows', code: 'windows', description: 'Sistema operativo de Microsoft', icon: '🪟', order: 3 },
      { name: 'Linux', code: 'linux', description: 'Sistema operativo de código abierto', icon: '🐧', order: 4 },
      { name: 'macOS', code: 'macos', description: 'Sistema operativo de Apple para computadoras', icon: '🍎', order: 5 },
      { name: 'Web', code: 'web', description: 'Aplicación web accesible desde navegador', icon: '🌐', order: 6 }
    ];

    console.log('🌱 Insertando plataformas iniciales...');

    for (const plat of initialPlatforms) {
      // Usar findOneAndUpdate con upsert para evitar duplicados
      const result = await Platform.findOneAndUpdate(
        { name: plat.name },
        { ...plat, isActive: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`✅ ${result.name} - ${result.isActive ? 'activo' : 'inactivo'}`);
    }

    console.log('\n🎉 ¡Plataformas iniciales creadas exitosamente!');
    console.log('💡 Ahora tu endpoint /api/platforms devolverá los nombres correctamente.');

  } catch (error) {
    console.error('❌ Error al insertar plataformas:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
  seedPlatforms();
}

module.exports = seedPlatforms;