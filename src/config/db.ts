import mongoose from 'mongoose';
import { env } from './env';

export let status = 'disconnected';

export async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI);
    status = 'connected';
    console.log('Conectado a MongoDB');
  } catch (error) {
    status = 'error';
    console.error('Error de conexión de MongoDB:', error);
  }
}