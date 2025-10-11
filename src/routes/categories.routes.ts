import { Router } from 'express';
import {
  // Categories
  getCategories,
  getCategoriesWithRoles,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  
  // Roles
  getRoles,
  getRolesByCategory,
  getRolesByCategoryCode,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  
  // Utils
  validateRoles,
  seedInitialData
} from '../controllers/categories.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Rutas públicas (solo lectura)
router.get('/categories', getCategories);
router.get('/categories/with-roles', getCategoriesWithRoles);
router.get('/categories/:id', getCategory);
router.get('/roles', getRoles);

router.get('/roles/by-category/:categoryId', getRolesByCategory);
router.get('/roles/by-category-code/:categoryCode', getRolesByCategoryCode);
router.get('/roles/:id', getRole);
router.post('/roles/validate', validateRoles);

// Rutas de administración (solo admins)
router.post('/categories', authMiddleware(['admin']), createCategory);
router.put('/categories/:id', authMiddleware(['admin']), updateCategory);
router.delete('/categories/:id', authMiddleware(['admin']), deleteCategory);

router.post('/roles', authMiddleware(['admin']), createRole);
router.put('/roles/:id', authMiddleware(['admin']), updateRole);
router.delete('/roles/:id', authMiddleware(['admin']), deleteRole);

// Ruta para inicializar datos (solo admins y solo en desarrollo)
router.post('/seed', authMiddleware(['admin']), seedInitialData);

export default router;