// src/routes/platforms.routes.ts
import { Router } from 'express';
import { getPlatforms } from '../controllers/platforms.controller';
import { requireAdmin } from '../middlewares/auth'; // 👈 importa el middleware

const router = Router();

// Solo admins pueden acceder a la lista de plataformas (para el panel de admin)
router.get('/', requireAdmin, getPlatforms);

export default router;