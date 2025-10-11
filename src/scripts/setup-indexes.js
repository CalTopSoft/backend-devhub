// src/scripts/setup-indexes.js
const mongoose = require('mongoose');
require('dotenv').config();

async function setupIndexes() {
  try {
    // Conectar a MongoDB Atlas
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI no encontrado en variables de entorno');
    }

    console.log('🔗 Conectando a MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB Atlas');

    const db = mongoose.connection.db;
    
    // Verificar si la colección existe
    const collections = await db.listCollections({ name: 'projects' }).toArray();
    if (collections.length === 0) {
      console.log('⚠️  La colección "projects" no existe aún. Créala primero agregando algunos proyectos.');
      return;
    }

    // Crear índice de texto para proyectos
    try {
      const result = await db.collection('projects').createIndex({
        title: 'text',
        shortDesc: 'text',
        longDesc: 'text',
        categories: 'text'
      }, {
        weights: {
          title: 10,
          shortDesc: 5,
          categories: 3,
          longDesc: 1
        },
        name: 'project_text_search',
        default_language: 'spanish'
      });
      console.log('✅ Índice de texto creado:', result);
    } catch (error) {
      if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
        console.log('ℹ️  Índice de texto ya existe para projects');
      } else {
        throw error;
      }
    }

    // Crear otros índices útiles
    const indexes = [
      { 
        collection: 'projects', 
        index: { status: 1 }, 
        name: 'status_1',
        description: 'Índice para filtrar por estado'
      },
      { 
        collection: 'projects', 
        index: { categories: 1 }, 
        name: 'categories_1',
        description: 'Índice para filtrar por categorías'
      },
      { 
        collection: 'projects', 
        index: { platforms: 1 }, 
        name: 'platforms_1',
        description: 'Índice para filtrar por plataformas'
      },
      { 
        collection: 'projects', 
        index: { createdAt: -1 }, 
        name: 'createdAt_-1',
        description: 'Índice para ordenar por fecha de creación'
      },
      { 
        collection: 'projects', 
        index: { ratingAvg: -1, ratingCount: -1 }, 
        name: 'rating_compound',
        description: 'Índice compuesto para ordenar por popularidad'
      },
      { 
        collection: 'projects', 
        index: { slug: 1 }, 
        name: 'slug_1',
        description: 'Índice único para buscar por slug'
      },
    ];

    for (const { collection, index, name, description } of indexes) {
      try {
        const result = await db.collection(collection).createIndex(index, { name });
        console.log(`✅ ${description}: ${result}`);
      } catch (error) {
        if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
          console.log(`ℹ️  Índice ${name} ya existe para ${collection}`);
        } else {
          console.error(`❌ Error creando índice ${name}:`, error.message);
        }
      }
    }

    // Verificar índices existentes
    console.log('\n📋 Verificando índices en la colección projects:');
    const projectIndexes = await db.collection('projects').indexes();
    projectIndexes.forEach((index, i) => {
      console.log(`  ${i + 1}. ${index.name}:`);
      console.log(`     Campos: ${JSON.stringify(index.key)}`);
      if (index.weights) {
        console.log(`     Pesos: ${JSON.stringify(index.weights)}`);
      }
      if (index.default_language) {
        console.log(`     Idioma: ${index.default_language}`);
      }
      console.log('');
    });

    // Verificar que el índice de texto funciona
    console.log('🧪 Probando búsqueda de texto...');
    try {
      const testQuery = await db.collection('projects').find({
        $text: { $search: 'test' }
      }).limit(1).toArray();
      console.log('✅ Búsqueda de texto funciona correctamente');
    } catch (testError) {
      console.error('❌ Error en prueba de búsqueda de texto:', testError.message);
    }

    console.log('\n🎉 ¡Configuración de índices completada!');

  } catch (error) {
    console.error('❌ Error configurando índices:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

// Ejecutar función
if (require.main === module) {
  setupIndexes();
}

module.exports = setupIndexes;