import { Router } from 'express';
import { getUser, getCurrentUser, updateUser } from '../controllers/users.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// IMPORTANTE: La ruta /me debe ir ANTES que /:id para evitar conflictos
// GET /users/me - Obtener usuario autenticado actual
router.get('/me', authMiddleware(), getCurrentUser);

// PUT /users/me - Actualizar usuario autenticado
router.put('/me', authMiddleware(), updateUser);

// GET /users/:id - Obtener usuario por ID específico (público)
router.get('/:id', getUser);

export default router;