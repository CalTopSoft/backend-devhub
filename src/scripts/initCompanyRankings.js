// src/scripts/initCompanyRankings.js
const mongoose = require('mongoose');
require('dotenv').config();
const { computeCompanyRankings } = require('../services/ranking.service');

async function initCompanyRankings() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGODB_URI no encontrado en variables de entorno');

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(mongoUri, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true 
    });
    console.log('✅ Conectado a MongoDB');

    // Ejecutar la función que calcula los rankings
    await computeCompanyRankings();
    console.log('🏆 Rankings de empresas inicializados correctamente');

  } catch (error) {
    console.error('❌ Error inicializando rankings:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

// Ejecuta la función si corremos este script directamente
if (require.main === module) initCompanyRankings();

module.exports = initCompanyRankings;
