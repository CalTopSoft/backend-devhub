// src/routes/upload.routes.ts (FIX FINAL: AGREGAR requireUser A BASE64 ROUTES)
import express from 'express';
import { 
  uploadProjectAppController,
  uploadProjectCodeController,
  uploadProjectDocController,
  uploadProjectIcon, // Función base64
  uploadProjectImages, // Función base64
  deleteFileController,
  getOptimizedImageController,
  getProjectFiles, 
  deleteUploadedFile,
} from '../controllers/upload.controller';
import { requireUser } from '../middlewares/auth'; // ← IMPORTANTE: MIDDLEWARE DE AUTH
import { antivirusService } from '../services/antivirus.service';

const router = express.Router();

// Rutas para iconos e imágenes (base64 - AHORA CON AUTH)
router.post('/project-icon', requireUser, uploadProjectIcon); // ← FIX: AGREGADO requireUser
router.post('/project-images', requireUser, uploadProjectImages); // ← FIX: AGREGADO requireUser

// RUTAS CON MULTER: Ya tienen auth en wrappers
router.post('/project-app', uploadProjectAppController);
router.post('/project-code', uploadProjectCodeController);
router.post('/project-doc', uploadProjectDocController);

// Rutas de gestión de archivos (agregar auth donde falte)
router.delete('/file/:fileId', requireUser, deleteFileController); // ← AGREGADO SI NO ESTABA
router.get('/optimize/:fileId', getOptimizedImageController); // Público, ok
router.get('/project/:projectId/files', requireUser, getProjectFiles); // ← AGREGADO

router.delete('/delete/:fileId', requireUser, deleteUploadedFile); // ← AGREGADO

// NUEVA RUTA: Obtener estadísticas del antivirus (solo admin)
router.get('/antivirus/stats', requireUser, async (req, res) => { // ← YA TIENE
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver las estadísticas' });
    }

    const stats = antivirusService.getStats();
    res.json({
      success: true,
      stats: {
        ...stats,
        apiConfigured: !!process.env.VIRUSTOTAL_API_KEY,
        lastRequestTime: stats.lastRequestTime ? new Date(stats.lastRequestTime).toISOString() : null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;