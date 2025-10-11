// src/scripts/updateProject.js
const mongoose = require('mongoose');
require('dotenv').config();

async function updateProject() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGODB_URI no encontrado en variables de entorno');

    console.log('🔗 Conectando a MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB Atlas');

    const db = mongoose.connection.db;
    const projects = db.collection('projects');

    const result = await projects.updateOne(
      { _id: new mongoose.Types.ObjectId("68ce0b5c63318e1f10c5a165") },
      { 
        $set: {
          isOrphan: true,
          isFromInactiveCompany: true,
          originalCompanyId: new mongoose.Types.ObjectId("68ce0bb263318e1f10c5a184")
        }
      }
    );

    console.log('Proyectos actualizados:', result.modifiedCount);

  } catch (error) {
    console.error('❌ Error actualizando proyecto:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

if (require.main === module) updateProject();

module.exports = updateProject;
