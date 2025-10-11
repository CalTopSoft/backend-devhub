// src/services/downloads/cloudinary.provider.ts
import { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import fetch from 'node-fetch';
import { env } from '../../config/env';

// Configurar Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

interface DownloadOptions {
  filename?: string;
  forceDownload?: boolean;
}

export async function streamFileFromCloudinary(
  publicId: string, 
  res: Response, 
  options: DownloadOptions = {}
): Promise<void> {
  try {
    console.log('[DEBUG] Downloading file from Cloudinary:', publicId);

    // Obtener información del archivo
    let resourceInfo;
    try {
      resourceInfo = await cloudinary.api.resource(publicId, { resource_type: 'auto' });
    } catch (error: any) {
      if (error.http_code === 404) {
        res.status(404).json({ error: 'Archivo no encontrado' });
        return;
      }
      throw error;
    }

    const fileUrl = resourceInfo.secure_url;
    const filename = options.filename || resourceInfo.public_id.split('/').pop() + '.' + resourceInfo.format;

    console.log('[DEBUG] File info:', {
      publicId,
      format: resourceInfo.format,
      bytes: resourceInfo.bytes,
      url: fileUrl,
      filename
    });

    // Descargar el archivo de Cloudinary
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }

    // Configurar headers de respuesta
    const contentType = getContentType(resourceInfo.format);
    const contentDisposition = options.forceDownload !== false ? 'attachment' : 'inline';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${contentDisposition}; filename="${filename}"`);
    res.setHeader('Content-Length', resourceInfo.bytes || 0);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hora de cache

    // Streamear el archivo
    if (response.body) {
      response.body.pipe(res);
    } else {
      throw new Error('No file content received');
    }

  } catch (error: any) {
    console.error('[ERROR streamFileFromCloudinary]:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error descargando archivo: ' + error.message });
    }
  }
}

export async function streamImageFromCloudinary(
  publicId: string,
  res: Response,
  options: {
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
  } = {}
): Promise<void> {
  try {
    console.log('[DEBUG] Streaming optimized image from Cloudinary:', { publicId, options });

    // Generar URL optimizada
    const optimizedUrl = cloudinary.url(publicId, {
      width: options.width || 800,
      height: options.height || 600,
      crop: 'fill',
      quality: options.quality || 'auto:good',
      format: options.format || 'auto',
      fetch_format: 'auto',
      secure: true
    });

    console.log('[DEBUG] Optimized URL:', optimizedUrl);

    // Descargar la imagen optimizada
    const response = await fetch(optimizedUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch optimized image: ${response.status} ${response.statusText}`);
    }

    // Obtener content-type de la respuesta
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const contentLength = response.headers.get('content-length');

    // Configurar headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas de cache
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Streamear la imagen
    if (response.body) {
      response.body.pipe(res);
    } else {
      throw new Error('No image content received');
    }

  } catch (error: any) {
    console.error('[ERROR streamImageFromCloudinary]:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error descargando imagen: ' + error.message });
    }
  }
}

function getContentType(format: string): string {
  const contentTypes: { [key: string]: string } = {
    // Imágenes
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    
    // Documentos
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    
    // Archivos comprimidos
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    
    // Ejecutables
    'exe': 'application/x-msdownload',
    'msi': 'application/x-msi',
    'apk': 'application/vnd.android.package-archive',
    'ipa': 'application/octet-stream',
    'dmg': 'application/x-apple-diskimage',
    'deb': 'application/x-debian-package',
    'rpm': 'application/x-rpm',
    
    // Otros
    'txt': 'text/plain',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv'
  };

  return contentTypes[format.toLowerCase()] || 'application/octet-stream';
}

// src/services/downloads/external.provider.ts
export async function streamExternal(url: string, res: Response): Promise<void> {
  try {
    console.log('[DEBUG] Streaming external file:', url);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch external file: ${response.status} ${response.statusText}`);
    }

    // Copiar headers relevantes
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const contentDisposition = response.headers.get('content-disposition') || 'attachment';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Streamear el archivo
    if (response.body) {
      response.body.pipe(res);
    } else {
      throw new Error('No file content received from external source');
    }

  } catch (error: any) {
    console.error('[ERROR streamExternal]:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error descargando archivo externo: ' + error.message });
    }
  }
}