import { Router } from 'express';
import { createCompany, getCompany, inviteMember, joinCompany, updateMemberRoles, removeMember, listCompanies, updateCompany, deleteCompany, getCompanyProjects } from '../controllers/companies.controller';
import { authMiddleware } from '../middlewares/auth';
import { getMyCompanies, getPendingRequests, handleMemberRequest, assignPublishPermission } from '../controllers/companies.controller';
import { confirmDeleteCompany, restoreCompany, searchCompanyByCode } from '../controllers/companies.controller';

const router = Router();

router.post('/', authMiddleware(), createCompany);
router.get('/:id', authMiddleware(), getCompany);
router.post('/:id/invite', authMiddleware(), inviteMember);
router.post('/join', authMiddleware(), joinCompany);
router.put('/:id/members/:userId', authMiddleware(), updateMemberRoles);
router.delete('/:id/members/:userId', authMiddleware(), removeMember);
router.get('/', authMiddleware(), listCompanies);
router.put('/:id', authMiddleware(), updateCompany);
router.delete('/:id', authMiddleware(), deleteCompany);
router.post('/:id/confirm-delete', authMiddleware(), confirmDeleteCompany);
router.post('/:id/restore', authMiddleware(), restoreCompany);
router.get('/my/companies', authMiddleware(), getMyCompanies);
router.get('/:id/pending-requests', authMiddleware(), getPendingRequests);
router.post('/:id/handle-request', authMiddleware(), handleMemberRequest);
router.post('/:id/assign-publish', authMiddleware(), assignPublishPermission);
router.get('/search/code/:code', authMiddleware(), searchCompanyByCode);
router.get('/:id/projects', authMiddleware(), getCompanyProjects);

export default router;