// src/controllers/upload.controller.ts (VERSIÓN COMPLETA Y FIXEADA)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import Project from '../models/Project';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  getOptimizedImageUrl,
  UploadResult
} from '../services/upload.service';
import { scanWithVirusTotal } from '../services/antivirus.service';
import { requireUser } from '../middlewares/auth'; // Para consistencia

// Configuración de multer para manejo de archivos
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB máximo
  }
});

// Esquemas de validación - PROJECTID OPCIONAL AHORA
const projectFileUploadSchema = z.object({
  projectId: z.string().optional(), // ← CAMBIADO: OPCIONAL para uploads iniciales
  projectTitle: z.string().min(1, 'Título del proyecto es requerido')
});

// Para icon e images (base64)
const base64UploadSchema = z.object({
  image: z.string().optional(), // Para icon, opcional si es images
  images: z.array(z.string()).optional(), // Para images, opcional si es icon
  projectTitle: z.string().min(1, 'El título del proyecto es requerido'),
  projectId: z.string().optional() // ← OPCIONAL
});

const fileTypeValidation = {
  app: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['.exe', '.apk', '.ipa', '.dmg', '.msi', '.deb', '.rpm'],
    mimeTypes: ['application/vnd.android.package-archive', 'application/octet-stream', 'application/x-msdownload']
  },
  code: {
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: ['.zip', '.rar', '.7z', '.tar.gz', '.tar'],
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-rar',       // agregado
      'application/vnd.rar',     // agregado
      'application/x-7z-compressed',
      'application/gzip',
      'application/x-tar',
      'application/x-gzip'
    ]
  },
  doc: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['.pdf'],
    mimeTypes: ['application/pdf']
  },
  icon: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['.png', '.jpg', '.jpeg', '.webp'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp']
  },
  images: {
    maxSize: 5 * 1024 * 1024, // 5MB por imagen
    allowedTypes: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  }
};

/**
 * Limpia la carpeta uploads/temp después de subir archivos a Cloudinary
 */
async function cleanupTempUploads(): Promise<void> {
  try {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');

    // Verificar si existe
    try {
      await fs.access(tempDir);
    } catch {
      // No existe, no hay nada que limpiar
      return;
    }

    // Eliminar recursivamente
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('[CLEANUP] Carpeta temp eliminada correctamente');
  } catch (error) {
    console.warn('[CLEANUP] Error al limpiar temp:', error);
  }
}
/**
 * Limpia archivos de un proyecto específico después de subirlos
 */
async function cleanupProjectUploads(projectId: string): Promise<void> {
  try {
    const projectDir = path.join(process.cwd(), 'uploads', projectId);

    try {
      await fs.access(projectDir);
    } catch {
      return;
    }

    await fs.rm(projectDir, { recursive: true, force: true });
    console.log(`[CLEANUP] Archivos del proyecto ${projectId} eliminados`);
  } catch (error) {
    console.warn(`[CLEANUP] Error al limpiar proyecto ${projectId}:`, error);
  }
}

// Helper functions
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error inesperado';
}

function validateFileType(file: Express.Multer.File, fileType: keyof typeof fileTypeValidation): boolean {
  const config = fileTypeValidation[fileType];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  // ✅ Si la extensión es válida, aceptar el archivo
  if (config.allowedTypes.includes(fileExtension)) {
    return true;
  }

  // Como fallback, validar MIME type
  return config.mimeTypes.includes(file.mimetype);
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/(^_|_$)/g, '');
}



function getUploadFolder(baseFolder: string, projectId?: string, isUpdate: boolean = false): string {
  if (!projectId) return `softstore/temp/${baseFolder}`;
  if (isUpdate) return `softstore/updates/${projectId}/${baseFolder}`;
  return `softstore/projects/${projectId}/${baseFolder}`;
}

// Wrappers para multer (con logs extra)
export const uploadProjectAppController = [
  requireUser,
  upload.single('appFile'),
  async (req: Request, res: Response, next: NextFunction) => {

    try {
      console.log('[DEBUG] Starting project app upload...');

      const userId = req.user?.id;
      if (!userId) {
        console.log('[ERROR] No user ID in app upload');
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }
      console.log('[DEBUG] User authenticated:', userId);

      const file = req.file;
      if (!file) {
        console.log('[ERROR] No file in app upload');
        return res.status(400).json({ error: 'No se proporcionó archivo' });
      }
      console.log('[DEBUG] File received:', file.originalname, file.size);

      const { projectId, projectTitle } = projectFileUploadSchema.parse(req.body);
      console.log('[DEBUG] Parsed body:', { projectId, projectTitle });

      if (!validateFileType(file, 'app')) {
        console.log('[ERROR] Invalid app file type');
        return res.status(400).json({
          error: 'Tipo de archivo no válido para aplicación. Formatos permitidos: .exe, .apk, .ipa, .dmg, .msi, .deb, .rpm'
        });
      }
      console.log('[DEBUG] File type validated');

      if (file.size > fileTypeValidation.app.maxSize) {
        console.log('[ERROR] App file too large');
        return res.status(400).json({
          error: `Archivo demasiado grande. Máximo permitido: ${fileTypeValidation.app.maxSize / (1024 * 1024)}MB`
        });
      }
      console.log('[DEBUG] File size validated');

      console.log('[DEBUG] Starting virus scan...');
      const virusScanResult = await scanWithVirusTotal(file.buffer, file.originalname);
      console.log('[DEBUG] Virus scan result:', virusScanResult.isSafe);

      if (!virusScanResult.isSafe) {
        console.log('[ERROR] Virus scan failed');
        return res.status(400).json({
          error: 'El archivo contiene amenazas de seguridad',
          details: virusScanResult.threats,
          scanId: virusScanResult.scanId
        });
      }
      console.log('[DEBUG] Virus scan passed');

      const sanitizedTitle = sanitizeFileName(projectTitle || 'untitled');
      const fileExtension = path.extname(file.originalname);
      const fileName = `app_${sanitizedTitle}_${Date.now()}${fileExtension}`;
      console.log('[DEBUG] Generated filename:', fileName);

      // ✅ AHORA:
      const project = projectId ? await Project.findById(projectId) : null;
      const isUpdate = project?.status === 'published';
      const folder = getUploadFolder('apps', projectId, isUpdate);

      console.log('[DEBUG] Upload folder:', folder);

      const result: UploadResult = await uploadToCloudinary(
        file.buffer,
        fileName,
        file.mimetype,
        folder
      );
      console.log('[DEBUG] Cloudinary upload success:', result.publicId);

      // Limpiar carpeta temp si no hay projectId
      if (!projectId) {
        await cleanupTempUploads();
      }

      console.log('[DEBUG] App upload completed successfully');

      return res.status(200).json({
        success: true,
        fileId: result.publicId,
        fileName: fileName,
        url: result.secureUrl,
        size: file.size,
        virusScan: {
          isSafe: true,
          scanId: virusScanResult.scanId,
          scannedAt: new Date().toISOString()
        },
        message: 'Aplicación subida y escaneada exitosamente'
      });

    } catch (error) {
      console.error('[ERROR] Upload project app failed:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }
];

export const uploadProjectCodeController = [
  requireUser,
  upload.single('codeFile'),
  async (req: Request, res: Response, next: NextFunction) => {


    try {
      console.log('[DEBUG] Starting project code upload...');

      const userId = req.user?.id;
      if (!userId) {
        console.log('[ERROR] No user ID in code upload');
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }
      console.log('[DEBUG] User authenticated:', userId);

      const file = req.file;
      if (!file) {
        console.log('[ERROR] No file in code upload');
        return res.status(400).json({ error: 'No se proporcionó archivo' });
      }
      console.log('[DEBUG] File received:', file.originalname, file.size);

      const { projectId, projectTitle } = projectFileUploadSchema.parse(req.body);
      console.log('[DEBUG] Parsed body:', { projectId, projectTitle });

      if (!validateFileType(file, 'code')) {
        console.log('[ERROR] Invalid code file type');
        return res.status(400).json({
          error: 'Tipo de archivo no válido para código fuente. Formatos permitidos: .zip, .rar, .7z, .tar.gz, .tar'
        });
      }
      console.log('[DEBUG] File type validated');

      if (file.size > fileTypeValidation.code.maxSize) {
        console.log('[ERROR] Code file too large');
        return res.status(400).json({
          error: `Archivo demasiado grande. Máximo permitido: ${fileTypeValidation.code.maxSize / (1024 * 1024)}MB`
        });
      }
      console.log('[DEBUG] File size validated');

      console.log('[DEBUG] Starting virus scan...');
      const virusScanResult = await scanWithVirusTotal(file.buffer, file.originalname);
      console.log('[DEBUG] Virus scan result:', virusScanResult.isSafe);

      if (!virusScanResult.isSafe) {
        console.log('[ERROR] Virus scan failed');
        return res.status(400).json({
          error: 'El archivo contiene amenazas de seguridad',
          details: virusScanResult.threats,
          scanId: virusScanResult.scanId
        });
      }
      console.log('[DEBUG] Virus scan passed');

      const sanitizedTitle = sanitizeFileName(projectTitle || 'untitled');
      const fileExtension = path.extname(file.originalname);
      const fileName = `code_${sanitizedTitle}_${Date.now()}${fileExtension}`;
      console.log('[DEBUG] Generated filename:', fileName);

      // ✅ AHORA:
      const project = projectId ? await Project.findById(projectId) : null;
      const isUpdate = project?.status === 'published';
      const folder = getUploadFolder('code', projectId, isUpdate);
      console.log('[DEBUG] Upload folder:', folder);

      const result: UploadResult = await uploadToCloudinary(
        file.buffer,
        fileName,
        file.mimetype,
        folder
      );
      console.log('[DEBUG] Cloudinary upload success:', result.publicId);

      // Limpiar carpeta temp si no hay projectId
      if (!projectId) {
        await cleanupTempUploads();
      }

      console.log('[DEBUG] Code upload completed successfully');

      if (projectId) {
        const project = await Project.findById(projectId);
        if (project) {
          // 🔥 NUEVO: Si está publicado, NO actualizar directamente
          if (project.status === 'published') {
            console.log('[DEBUG] Project is published, skipping direct code update');
          } else {
            project.files = project.files || {};
            project.files.code = {
              type: 'cloudinary',
              publicId: result.publicId,
              url: result.secureUrl,
              fileName: file.originalname,
              virusScan: {
                isSafe: true,
                scanId: virusScanResult.scanId,
                scannedAt: new Date(),
                threats: virusScanResult.threats
              }
            };
            await project.save();
            console.log('[DEBUG] Project updated in DB with code file');
          }
        }
      }

      return res.status(200).json({
        success: true,
        fileId: result.publicId,
        fileName: fileName,
        url: result.secureUrl,
        size: file.size,
        virusScan: {
          isSafe: true,
          scanId: virusScanResult.scanId,
          scannedAt: new Date().toISOString()
        },
        message: 'Código fuente subido y escaneado exitosamente'
      });

    } catch (error) {
      // En caso de error, limpiar archivo local si existe
      console.error('[ERROR] Upload project code failed:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }
];

export const uploadProjectDocController = [
  requireUser,
  upload.single('docFile'),
  async (req: Request, res: Response, next: NextFunction) => {


    try {
      console.log('[DEBUG] Starting project doc upload...');

      const userId = req.user?.id;
      if (!userId) {
        console.log('[ERROR] No user ID in doc upload');
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }
      console.log('[DEBUG] User authenticated:', userId);

      const file = req.file;
      if (!file) {
        console.log('[ERROR] No file in doc upload');
        return res.status(400).json({ error: 'No se proporcionó archivo' });
      }
      console.log('[DEBUG] File received:', file.originalname, file.size);

      const { projectId, projectTitle } = projectFileUploadSchema.parse(req.body);
      console.log('[DEBUG] Parsed body:', { projectId, projectTitle });

      if (!validateFileType(file, 'doc')) {
        console.log('[ERROR] Invalid doc file type');
        return res.status(400).json({
          error: 'Tipo de archivo no válido para documentación. Solo se permite PDF'
        });
      }
      console.log('[DEBUG] File type validated');

      if (file.size > fileTypeValidation.doc.maxSize) {
        console.log('[ERROR] Doc file too large');
        return res.status(400).json({
          error: `Archivo demasiado grande. Máximo permitido: ${fileTypeValidation.doc.maxSize / (1024 * 1024)}MB`
        });
      }
      console.log('[DEBUG] File size validated');

      console.log('[DEBUG] Starting virus scan...');
      const virusScanResult = await scanWithVirusTotal(file.buffer, file.originalname);
      console.log('[DEBUG] Virus scan result:', virusScanResult.isSafe);

      if (!virusScanResult.isSafe) {
        console.log('[ERROR] Virus scan failed');
        return res.status(400).json({
          error: 'El archivo contiene amenazas de seguridad',
          details: virusScanResult.threats,
          scanId: virusScanResult.scanId
        });
      }
      console.log('[DEBUG] Virus scan passed');

      const sanitizedTitle = sanitizeFileName(projectTitle || 'untitled');
      const fileName = `doc_${sanitizedTitle}_${Date.now()}.pdf`;
      console.log('[DEBUG] Generated filename:', fileName);

      // ✅ AHORA:
      const project = projectId ? await Project.findById(projectId) : null;
      const isUpdate = project?.status === 'published';
      const folder = getUploadFolder('docs', projectId, isUpdate);
      console.log('[DEBUG] Upload folder:', folder);

      const result: UploadResult = await uploadToCloudinary(
        file.buffer,
        fileName,
        file.mimetype,
        folder
      );
      console.log('[DEBUG] Cloudinary upload success:', result.publicId);


      // Limpiar carpeta temp si no hay projectId
      if (!projectId) {
        await cleanupTempUploads();
      }

      console.log('[DEBUG] Doc upload completed successfully');

      // ✅ ACTUALIZAR PROYECTO EN BD
      if (projectId) {
        const project = await Project.findById(projectId);
        if (project) {
          // 🔥 NUEVO: Si está publicado, NO actualizar directamente
          if (project.status === 'published') {
            console.log('[DEBUG] Project is published, skipping direct doc update');
          } else {
            project.files = project.files || {};
            project.files.docPdf = {
              type: 'cloudinary',
              publicId: result.publicId,
              url: result.secureUrl,
              fileName: file.originalname,
              virusScan: {
                isSafe: true,
                scanId: virusScanResult.scanId,
                scannedAt: new Date(),
                threats: virusScanResult.threats
              }
            };
            await project.save();
            console.log('[DEBUG] Project updated in DB with doc file');
          }
        }
      }

      return res.status(200).json({
        success: true,
        fileId: result.publicId,
        fileName: fileName,
        url: result.secureUrl,
        size: file.size,
        virusScan: {
          isSafe: true,
          scanId: virusScanResult.scanId,
          scannedAt: new Date().toISOString()
        },
        message: 'Documentación subida y escaneada exitosamente'
      });

    } catch (error) {
      // En caso de error, limpiar archivo local si existe
      console.error('[ERROR] Upload project doc failed:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }
];

// Para icon (base64) - COMPLETO CON LOGS Y OPCIONAL PROJECTID
export async function uploadProjectIcon(req: Request, res: Response) {
  console.log('[DEBUG] Received request for project icon upload');
  try {
    console.log('[DEBUG] Starting project icon upload...');

    const userId = req.user?.id;
    console.log('[DEBUG] User ID from req:', userId);
    if (!userId) {
      console.log('[ERROR] No user authenticated for icon upload');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log('[DEBUG] Body received:', req.body);
    const parsedBody = base64UploadSchema.parse(req.body);
    const { image, projectTitle, projectId } = parsedBody;
    console.log('[DEBUG] Parsed schema:', { image: image ? 'present' : 'missing', projectTitle, projectId });

    if (!image) {
      console.log('[ERROR] No image in body for icon upload');
      return res.status(400).json({ error: 'La imagen es requerida' });
    }

    // Validar imagen base64
    console.log('[DEBUG] Validating base64 image...');
    if (!image.startsWith('data:image/')) {
      console.log('[ERROR] Invalid base64 format');
      return res.status(400).json({ error: 'El archivo debe ser una imagen' });
    }

    const validFormats = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/jpg;base64,', 'data:image/webp;base64,'];
    const isValidFormat = validFormats.some(format => image.startsWith(format));
    console.log('[DEBUG] Valid format check:', isValidFormat);

    if (!isValidFormat) {
      console.log('[ERROR] Invalid image format');
      return res.status(400).json({ error: 'Formato de imagen no permitido. Solo PNG, JPG, JPEG, WebP' });
    }
    console.log('[DEBUG] Format validated');

    const base64Data = image.split(',')[1];
    console.log('[DEBUG] Base64 data length:', base64Data ? base64Data.length : 0);
    const buffer = Buffer.from(base64Data, 'base64');
    console.log('[DEBUG] Buffer created, size:', buffer.length);

    if (buffer.length > fileTypeValidation.icon.maxSize) {
      console.log('[ERROR] Icon too large');
      return res.status(400).json({
        error: `Imagen demasiado grande. Máximo permitido: ${fileTypeValidation.icon.maxSize / (1024 * 1024)}MB`
      });
    }
    console.log('[DEBUG] Size validated');

    // Extraer extensión del formato
    const mimeType = image.split(';')[0].split('/')[1];
    const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
    console.log('[DEBUG] Extracted mimeType:', mimeType, 'extension:', extension);

    const sanitizedTitle = sanitizeFileName(projectTitle);
    const fileName = `icon_${sanitizedTitle}_${Date.now()}.${extension}`;
    console.log('[DEBUG] Generated filename:', fileName);

    const project = projectId ? await Project.findById(projectId) : null;
    const isUpdate = project?.status === 'published';
    const folder = getUploadFolder('icons', projectId, isUpdate);
    console.log('[DEBUG] Upload folder for icon:', folder);

    // Subir a Cloudinary
    console.log('[DEBUG] Starting Cloudinary upload for icon...');
    const result: UploadResult = await uploadToCloudinary(
      buffer,
      fileName,
      `image/${mimeType}`,
      folder
    );
    console.log('[DEBUG] Cloudinary icon upload success:', result.publicId);

    console.log('[DEBUG] Icon upload completed successfully');

    // ✅ ACTUALIZAR PROYECTO EN BD
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) {
        // 🔥 NUEVO: Si está publicado, NO actualizar directamente
        if (project.status === 'published') {
          console.log('[DEBUG] Project is published, skipping direct icon update');
          // No hacer nada, el frontend lo manejará en el borrador
        } else {
          project.iconPublicId = result.publicId;
          project.iconUrl = result.secureUrl;
          await project.save();
          console.log('[DEBUG] Project updated in DB with icon');
        }
      }
    }

    return res.status(200).json({
      success: true,
      fileId: result.publicId,
      fileName: fileName,
      url: result.secureUrl,
      optimizedUrl: getOptimizedImageUrl(result.publicId, { width: 256, height: 256 }),
      message: 'Icono subido exitosamente'
    });

  } catch (error: any) {
    console.error('[ERROR] Upload project icon failed at line:', error.stack ? error.stack.split('\n')[1] : 'unknown');
    console.error('[ERROR] Full error:', error.message || error);
    return res.status(500).json({ error: `Error al subir icono: ${getErrorMessage(error)}` });
  }
}

export async function uploadProjectImages(req: Request, res: Response) {
  console.log('[DEBUG] Received request for project images upload');
  try {
    console.log('[DEBUG] Starting project images upload...');

    const userId = req.user?.id;
    console.log('[DEBUG] User ID:', userId);
    if (!userId) {
      console.log('[ERROR] No user authenticated for images upload');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    //console.log('[DEBUG] Body for images:', req.body);
    const parsedBody = base64UploadSchema.parse(req.body);
    const { images, projectTitle, projectId } = parsedBody;
    console.log('[DEBUG] Parsed images count:', images ? images.length : 0);

    if (!images || images.length === 0) {
      console.log('[ERROR] No images in body for images upload');
      return res.status(400).json({ error: 'Al menos una imagen es requerida' });
    }

    if (images.length > 5) {
      console.log('[ERROR] Too many images');
      return res.status(400).json({ error: 'Máximo 5 imágenes permitidas' });
    }

    // Validar todas las imágenes
    const validatedImages: { buffer: Buffer; mimeType: string; extension: string }[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`[DEBUG] Processing image ${i + 1}...`);

      if (!image.startsWith('data:image/')) {
        console.log('[ERROR] Invalid base64 format for image', i + 1);
        return res.status(400).json({ error: `Error en imagen ${i + 1}: Debe ser una imagen` });
      }

      const validFormats = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/jpg;base64,', 'data:image/webp;base64,', 'data:image/gif;base64,'];
      const isValidFormat = validFormats.some(format => image.startsWith(format));

      if (!isValidFormat) {
        console.log('[ERROR] Invalid format for image', i + 1);
        return res.status(400).json({
          error: `Error en imagen ${i + 1}: Formato no permitido. Solo PNG, JPG, JPEG, WebP, GIF`
        });
      }

      const base64Data = image.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      console.log(`[DEBUG] Image ${i + 1} buffer size:`, buffer.length);

      if (buffer.length > fileTypeValidation.images.maxSize) {
        console.log('[ERROR] Image', i + 1, 'too large');
        return res.status(400).json({
          error: `Error en imagen ${i + 1}: Demasiado grande. Máximo ${fileTypeValidation.images.maxSize / (1024 * 1024)}MB`
        });
      }

      const mimeType = image.split(';')[0].split('/')[1];
      const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;

      validatedImages.push({ buffer, mimeType, extension });
    }

    // Subir todas las imágenes
    const uploadPromises = validatedImages.map(async (img, index) => {
      console.log(`[DEBUG] Uploading image ${index + 1}...`);
      const sanitizedTitle = sanitizeFileName(projectTitle);
      const fileName = `image_${sanitizedTitle}_${Date.now()}_${index + 1}.${img.extension}`;

      // ✅ AHORA:
      const project = projectId ? await Project.findById(projectId) : null;
      const isUpdate = project?.status === 'published';
      const folder = getUploadFolder('images', projectId, isUpdate);
      console.log(`[DEBUG] Image ${index + 1} folder:`, folder);

      const result: UploadResult = await uploadToCloudinary(
        img.buffer,
        fileName,
        `image/${img.mimeType}`,
        folder
      );

      console.log(`[DEBUG] Image ${index + 1} uploaded:`, result.publicId);
      return {
        fileId: result.publicId,
        fileName,
        url: result.secureUrl,
        optimizedUrl: getOptimizedImageUrl(result.publicId, { width: 800, height: 600 })
      };
    });

    const uploadResults = await Promise.all(uploadPromises);
    console.log('[DEBUG] All images uploaded successfully');

    // ✅ ACTUALIZAR PROYECTO EN BD
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) {
        // 🔥 NUEVO: Si está publicado, NO actualizar directamente
        if (project.status === 'published') {
          console.log('[DEBUG] Project is published, skipping direct images update');
          // No hacer nada, el frontend lo manejará en el borrador
        } else {
          project.imagePublicIds = uploadResults.map(r => r.fileId);
          project.imageUrls = uploadResults.map(r => r.url);
          await project.save();
          console.log('[DEBUG] Project updated in DB with images');
        }
      }
    }

    return res.status(200).json({
      success: true,
      files: uploadResults,
      message: `${uploadResults.length} imágenes subidas exitosamente`
    });

  } catch (error: any) {
    console.error('[ERROR] Upload project images failed at line:', error.stack ? error.stack.split('\n')[1] : 'unknown');
    console.error('[ERROR] Full error:', error.message || error);
    return res.status(500).json({ error: `Error al subir imágenes: ${getErrorMessage(error)}` });
  }
}

// Función para obtener información de archivos de un proyecto
export async function getProjectFiles(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    console.log('[DEBUG] Getting files for project:', projectId);

    if (!req.user) {
      console.log('[ERROR] No user for get files');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Aquí puedes implementar lógica para obtener los archivos del proyecto
    // desde la base de datos o directamente desde Cloudinary

    return res.status(200).json({
      success: true,
      projectId,
      message: 'Función pendiente de implementar'
    });

  } catch (error) {
    console.error('[ERROR] Get project files failed:', error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}

// Función existente para eliminar archivos
export async function deleteFileController(req: Request, res: Response) {
  try {
    console.log('[DEBUG] Deleting file:', req.params.fileId);
    const userId = req.user?.id;
    if (!userId) {
      console.log('[ERROR] No user for delete file');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { fileId } = req.params;

    if (!fileId) {
      console.log('[ERROR] No fileId for delete');
      return res.status(400).json({ error: 'File ID requerido' });
    }

    // Eliminar de Cloudinary
    await deleteFromCloudinary(fileId);
    console.log('[DEBUG] File deleted from Cloudinary');

    return res.status(200).json({
      success: true,
      message: 'Archivo eliminado exitosamente'
    });

  } catch (error) {
    console.error('[ERROR] Delete file failed:', error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}

// Función existente para URLs optimizadas
export async function getOptimizedImageController(req: Request, res: Response) {
  try {
    console.log('[DEBUG] Getting optimized image for:', req.params.fileId);
    const { fileId } = req.params;
    const { width, height, quality, format } = req.query;

    if (!fileId) {
      console.log('[ERROR] No fileId for optimized image');
      return res.status(400).json({ error: 'File ID requerido' });
    }

    const optimizedUrl = getOptimizedImageUrl(fileId, {
      width: width ? parseInt(width as string) : undefined,
      height: height ? parseInt(height as string) : undefined,
      quality: quality as string,
      format: format as string
    });

    return res.status(200).json({
      success: true,
      originalFileId: fileId,
      optimizedUrl
    });

  } catch (error) {
    console.error('[ERROR] Get optimized image failed:', error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}

// Función para deleteUploadedFile (si la necesitas separada)
export async function deleteUploadedFile(req: Request, res: Response) {
  console.log('[DEBUG] Deleting uploaded file via /delete route');
  return deleteFileController(req, res); // Reutiliza la misma lógica
}

export { cleanupTempUploads, cleanupProjectUploads };