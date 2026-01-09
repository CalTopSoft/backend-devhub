// src/routes/admin.routes.ts - MODIFICACIONES

import { Router } from 'express';
import { 
  getAdminProjects, 
  updateProject, 
  sendToAuthor, 
  publishProject, 
  rejectProject,
  warnProject,
  deleteProject,
  getFeedbackReasons,
  getUsers, 
  resetUserPassword, 
  deleteUser,
  exportBackup, 
  importBackup, 
  getBackupSize,
  getProjectsWithDrafts,
  ping,
  // ✅ NUEVO: Imports para borradores
  approveDraft,
  rejectDraft
} from '../controllers/admin.controller';

import {
  getAntivirusStats,
  getInfectedProjects,
  rescanFile,
  getProjectScanHistory,
  markFileAsSafe,
  getAntivirusConfig
} from '../controllers/admin.antivirus.controller';
import { verifyCompany, getCompanyRankings } from '../controllers/admin.controller';

import { authMiddleware } from '../middlewares/auth';


const router = Router();

router.get('/projects/with-drafts', authMiddleware(['admin']), getProjectsWithDrafts);
// Proyectos
router.get('/projects', authMiddleware(['admin']), getAdminProjects);
router.put('/projects/:id', authMiddleware(['admin']), updateProject);

// Acciones de proyectos con feedback
router.post('/projects/:id/send-to-author', authMiddleware(['admin']), sendToAuthor);
router.post('/projects/:id/publish', authMiddleware(['admin']), publishProject);
router.post('/projects/:id/reject', authMiddleware(['admin']), rejectProject);

// ✅ NUEVO: Gestión de borradores
router.post('/projects/:id/approve-draft', authMiddleware(['admin']), approveDraft);
router.post('/projects/:id/reject-draft', authMiddleware(['admin']), rejectDraft);

// Advertencias y eliminación
router.post('/projects/:id/warn', authMiddleware(['admin']), warnProject);
router.delete('/projects/:id', authMiddleware(['admin']), deleteProject);

// Motivos predefinidos
router.get('/feedback-reasons', authMiddleware(['admin']), getFeedbackReasons);

// Usuarios
router.get('/users', authMiddleware(['admin']), getUsers);
router.post('/users/:id/reset-password', authMiddleware(['admin']), resetUserPassword);

// Antivirus y Seguridad
router.get('/antivirus/stats', authMiddleware(['admin']), getAntivirusStats);
router.get('/antivirus/config', authMiddleware(['admin']), getAntivirusConfig);
router.get('/antivirus/infected-projects', authMiddleware(['admin']), getInfectedProjects);
router.get('/antivirus/project/:projectId/scan-history', authMiddleware(['admin']), getProjectScanHistory);
router.post('/antivirus/rescan', authMiddleware(['admin']), rescanFile);
router.post('/antivirus/mark-safe', authMiddleware(['admin']), markFileAsSafe);

// Backup
router.get('/backup/export', authMiddleware(['admin']), exportBackup);
router.post('/backup/import', authMiddleware(['admin']), importBackup);
router.get('/backup/size', authMiddleware(['admin']), getBackupSize);

// Sistema
router.get('/ping', authMiddleware(['admin']), ping);

// Agregar estas rutas ANTES del export:
router.patch('/companies/:id/verify', authMiddleware(['admin']), verifyCompany);
router.get('/companies/rankings', authMiddleware(['admin']), getCompanyRankings);

router.delete('/users/:id', authMiddleware(['admin']), deleteUser);

export default router;