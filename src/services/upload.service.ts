// src/services/upload.service.ts
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

// Configurar Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  fileId: string;
  url: string;
  secureUrl: string;
  publicId: string;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = 'softstore'
): Promise<UploadResult> {
  try {
    console.log('[DEBUG] Cloudinary upload attempt:', { 
      fileName, 
      bufferSize: buffer.length, 
      mimeType,
      folder
    });

    const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';

    // ✅ USAR PROMESA EN LUGAR DE CALLBACK (más limpio)
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          public_id: fileName.split('.')[0],
          resource_type: resourceType,
          quality: 'auto:good',
          overwrite: false,
        },
        (error, result) => {
          if (error) {
            console.error('[ERROR Cloudinary]:', error);
            reject(new Error('Error al subir a Cloudinary: ' + error.message));
          } else if (!result) {
            // ✅ AGREGADO: Verificar que result no sea undefined/null
            console.error('[ERROR Cloudinary]: Result is null');
            reject(new Error('Upload failed: No result returned'));
          } else {
            console.log('[DEBUG] Cloudinary upload successful:', {
              public_id: result.public_id,
              secure_url: result.secure_url,
              bytes: result.bytes
            });
            resolve({
              fileId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              publicId: result.public_id
            });
          }
        }
      );
      uploadStream.end(buffer);
    });

  } catch (error: any) {
    console.error('[ERROR uploadToCloudinary]:', error);
    throw new Error('Error al subir archivo a Cloudinary: ' + (error.message || 'Error desconocido'));
  }
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    console.log('[DEBUG] Deleting from Cloudinary:', publicId);
    
    // Determinar el tipo de recurso por el public_id
    let resourceType: 'image' | 'video' | 'raw' = 'image';
    
    if (publicId.includes('video_') || publicId.includes('app_')) {
      resourceType = 'raw'; // Apps y archivos generales
    } else if (publicId.includes('movie_') || publicId.includes('clip_')) {
      resourceType = 'video';
    }
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    
    console.log('[DEBUG] Cloudinary delete result:', result);
    
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Delete failed: ${result.result}`);
    }
    
  } catch (error: any) {
    console.error('[ERROR deleteFromCloudinary]:', error.message);
    throw new Error('Error al eliminar archivo de Cloudinary: ' + error.message);
  }
}

export async function fileExistsInCloudinary(publicId: string): Promise<boolean> {
  try {
    console.log('[DEBUG] Checking if file exists in Cloudinary:', publicId);
    
    // Intentar obtener información del recurso
    const result = await cloudinary.api.resource(publicId);
    console.log('[DEBUG] File exists in Cloudinary:', result.public_id);
    return true;
    
  } catch (error: any) {
    console.log('[DEBUG] File does not exist in Cloudinary:', error.message);
    return false;
  }
}

// 🔥 FUNCIÓN CORREGIDA: Mover archivo a otra carpeta en Cloudinary
export async function moveCloudinaryFiles(
  publicId: string,
  newFolder: string
): Promise<string> {
  try {
    console.log('[DEBUG] Moving file in Cloudinary:', { from: publicId, to: newFolder });
    
    // Determinar tipo de recurso basándose en la carpeta
    const isImage = publicId.includes('/icons/') || publicId.includes('/images/');
    const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';

    console.log('[DEBUG] Detected resource type:', resourceType, 'for', publicId);
    
    // Extraer solo el nombre del archivo (sin carpetas)
    const fileNameWithExt = publicId.split('/').pop()!;
    const newPublicId = `${newFolder}/${fileNameWithExt}`;
    
    // ✅ PASO 1: Obtener la URL segura del archivo original
    const originalResource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
    if (!originalResource || !originalResource.secure_url) {
      throw new Error(`Could not get secure URL for ${publicId}`);
    }
    const originalUrl = originalResource.secure_url;
    
    // ✅ PASO 2: Subir el archivo a la nueva ubicación usando su URL
    const uploadResult = await cloudinary.uploader.upload(originalUrl, {
      public_id: fileNameWithExt.split('.')[0], // Sin extensión
      folder: newFolder,
      resource_type: resourceType,
      overwrite: false,
      invalidate: true
    });
    
    // ✅ PASO 3: Eliminar el archivo de la ubicación original
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
    
    console.log('[DEBUG] File moved successfully:', uploadResult.public_id);
    return uploadResult.public_id;
    
  } catch (error: any) {
    console.error('[ERROR moveCloudinaryFiles]:', error.message);
    console.error('[ERROR] Full error:', error);
    throw new Error(`Failed to move file: ${error.message || 'Unknown error'}`);
  }
}

// Función para generar URLs optimizadas (redimensionar, etc.)
export function getOptimizedImageUrl(publicId: string, options: {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
  crop?: string;
} = {}): string {
  const { 
    width = 800, 
    height = 600, 
    quality = 'auto:good', 
    format = 'auto',
    crop = 'fill'
  } = options;
  
  return cloudinary.url(publicId, {
    width,
    height,
    crop,
    quality,
    format,
    fetch_format: 'auto',
    secure: true
  });
}

// Función para subir iconos de proyectos
export async function uploadProjectIcon(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  return uploadToCloudinary(buffer, fileName, mimeType, 'softstore/icons');
}

// Función para subir imágenes de proyectos
export async function uploadProjectImage(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  return uploadToCloudinary(buffer, fileName, mimeType, 'softstore/images');
}

// Función para subir archivos de aplicaciones
export async function uploadProjectApp(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  return uploadToCloudinary(buffer, fileName, mimeType, 'softstore/apps');
}

// Función para subir códigos fuente
export async function uploadProjectCode(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  return uploadToCloudinary(buffer, fileName, mimeType, 'softstore/code');
}

// Función para subir documentos PDF
export async function uploadProjectDoc(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  return uploadToCloudinary(buffer, fileName, mimeType, 'softstore/docs');
}

// Obtener información de un archivo
export async function getFileInfo(publicId: string) {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      publicId: result.public_id,
      format: result.format,
      size: result.bytes,
      width: result.width,
      height: result.height,
      createdAt: result.created_at,
      secureUrl: result.secure_url
    };
  } catch (error: any) {
    console.error('[ERROR getFileInfo]:', error.message);
    return null;
  }
}