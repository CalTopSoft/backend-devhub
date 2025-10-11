import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

// Configurar Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

console.log('[DEBUG] Cloudinary configured with cloud:', env.CLOUDINARY_CLOUD_NAME);

export { cloudinary };