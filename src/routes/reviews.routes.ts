import { Router } from 'express';
import { createReview, getReviews } from '../controllers/reviews.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.post('/:projectId', authMiddleware(), createReview); // De /review a / directamente
router.get('/:projectId', getReviews); // De /reviews a / directamente

export default router;