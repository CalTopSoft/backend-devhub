// src/routes/downloads.routes.ts
import { Router } from 'express';
import { downloadApp, downloadCode, downloadDoc } from '../controllers/downloads.controller';

const router = Router();

// Rutas públicas (sin autenticación para proyectos publicados)
router.get('/app/:projectId', downloadApp);
router.get('/code/:projectId', downloadCode);
router.get('/doc/:projectId', downloadDoc);

export default router;