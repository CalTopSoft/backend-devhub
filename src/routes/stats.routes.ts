import { Router } from 'express';
import { getStats } from '../controllers/stats.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.get('/stats', authMiddleware(['admin']), getStats);

export default router;