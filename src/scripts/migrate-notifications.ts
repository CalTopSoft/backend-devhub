import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Conectar a MongoDB Atlas usando MONGO_URI
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('❌ MONGO_URI no definida en .env');
  process.exit(1);
}

mongoose.connect(uri)
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas');
    return mongoose.connection.db.collection('notifications').updateMany(
      { type: { $exists: false } }, // Solo documentos sin type
      {
        $set: {
          type: "general",
          priority: "medium",
          actionRequired: false
        }
      }
    );
  })
  .then((result) => {
    console.log(`🚀 Migración completada. Documentos modificados: ${result.modifiedCount}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  });
