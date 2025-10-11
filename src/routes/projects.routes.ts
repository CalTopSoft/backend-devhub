import { Router } from 'express';
import { 
  createProject, 
  getProjects, 
  getProject, 
  updateProject,
  getMyProjects,
  resubmitProject, getProjectById, createProjectWithFiles, checkProjectSlug,  likeProject,
  getProjectLikes
} from '../controllers/projects.controller';
import { authMiddleware } from '../middlewares/auth';

import { requireUser } from '../middlewares/auth';
import multer from 'multer';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

const router = Router();


router.get('/check-slug', authMiddleware(), checkProjectSlug);

// ✅ RUTAS CON :id ESPECÍFICAS (van ANTES de las genéricas)
router.post('/:id/like', authMiddleware(), likeProject);
router.get('/:id/likes', authMiddleware(), getProjectLikes);

// Rutas públicas
router.get('/', getProjects);
router.get('/:slug', getProject);

// Rutas protegidas
router.post('/', authMiddleware(), createProject);
router.put('/:id', authMiddleware(), updateProject);

// NUEVAS RUTAS: Gestión personal de proyectos
router.get('/my/projects', authMiddleware(), getMyProjects);
router.post('/:id/resubmit', authMiddleware(), resubmitProject);

router.get('/by-id/:id', requireUser, getProjectById);

// Ruta para crear proyecto con archivos
router.post(
  '/with-files', 
  authMiddleware(), 
  upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'images', maxCount: 5 },
    { name: 'app', maxCount: 1 },
    { name: 'code', maxCount: 1 },
    { name: 'doc', maxCount: 1 }
  ]), 
  createProjectWithFiles
);


export default router;