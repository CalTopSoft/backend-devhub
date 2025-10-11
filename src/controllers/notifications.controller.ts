import { Request, Response } from 'express';
import notificationService from '../services/notifications.service';
import { z } from 'zod';

// Esquemas de validación
const markAsReadSchema = z.object({
  notificationId: z.string()
});

const getNotificationsSchema = z.object({
  unreadOnly: z.string().optional().transform(val => val === 'true'),
  type: z.enum(['project_status', 'project_feedback', 'project_warning', 'project_deleted', 'general']).optional(),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  skip: z.string().optional().transform(val => val ? parseInt(val, 10) : 0)
});

// Obtener notificaciones del usuario autenticado
export async function getUserNotifications(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const validated = getNotificationsSchema.parse(req.query);
    
    const notifications = await notificationService.getUserNotifications(userId, {
      unreadOnly: validated.unreadOnly,
      type: validated.type,
      limit: validated.limit,
      skip: validated.skip
    });

    res.json(notifications);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Marcar notificación como leída
export async function markNotificationAsRead(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { notificationId } = req.params;
    
    const notification = await notificationService.markAsRead(notificationId, userId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.json(notification);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Marcar todas las notificaciones como leídas
export async function markAllNotificationsAsRead(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const result = await notificationService.markAllAsRead(userId);
    
    res.json({ 
      message: 'Todas las notificaciones han sido marcadas como leídas',
      modifiedCount: result.modifiedCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Obtener estadísticas de notificaciones
export async function getNotificationStats(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const stats = await notificationService.getNotificationStats(userId);
    
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Eliminar notificación (solo el propietario)
export async function deleteNotification(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { notificationId } = req.params;
    
    const deleted = await notificationService.deleteNotification(notificationId, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.json({ message: 'Notificación eliminada exitosamente' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Limpiar notificaciones antiguas (solo admin)
export async function cleanupOldNotifications(req: Request, res: Response) {
  try {
    const daysOld = parseInt(req.query.days as string) || 30;
    
    const result = await notificationService.cleanupOldNotifications(daysOld);
    
    res.json({
      message: `Notificaciones anteriores a ${daysOld} días eliminadas`,
      deletedCount: result.deletedCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}