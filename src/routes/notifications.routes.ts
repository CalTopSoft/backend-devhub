import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationStats,
  deleteNotification,
  cleanupOldNotifications
} from '../controllers/notifications.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Rutas protegidas para usuarios autenticados
router.get('/', authMiddleware(), getUserNotifications);
router.get('/stats', authMiddleware(), getNotificationStats);
router.patch('/:notificationId/read', authMiddleware(), markNotificationAsRead);
router.patch('/mark-all-read', authMiddleware(), markAllNotificationsAsRead);
router.delete('/:notificationId', authMiddleware(), deleteNotification);

// Rutas administrativas
router.delete('/cleanup', authMiddleware(['admin']), cleanupOldNotifications);

export default router;