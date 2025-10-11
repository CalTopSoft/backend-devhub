import { Router } from 'express';
import { register, login, resetPassword, confirmResetPassword } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/reset-password', resetPassword);
router.post('/confirm-reset-password', confirmResetPassword);

export default router;