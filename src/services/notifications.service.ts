import Notification, { INotification } from '../models/Notification';
import User from '../models/User';
import Project from '../models/Project';
import { sendNotificationEmail } from './email.service';
import mongoose from 'mongoose';

// Constantes para motivos predefinidos
export const REJECTION_REASONS = {
  CONTENT_QUALITY: 'Calidad del contenido insuficiente',
  INCOMPLETE_INFO: 'Información incompleta o faltante',
  INAPPROPRIATE_CONTENT: 'Contenido inapropiado o no permitido',
  TECHNICAL_ISSUES: 'Problemas técnicos en archivos o enlaces',
  PLAGIARISM: 'Posible plagio o falta de originalidad',
  WRONG_CATEGORY: 'Categoría incorrecta o no correspondiente',
  MISSING_FILES: 'Archivos faltantes o corruptos',
  POLICY_VIOLATION: 'Violación de políticas de la plataforma'
};

export const EDIT_REASONS = {
  IMPROVE_DESCRIPTION: 'Mejorar descripción del proyecto',
  UPDATE_CATEGORIES: 'Actualizar categorías',
  FIX_TECHNICAL_INFO: 'Corregir información técnica',
  ENHANCE_DOCUMENTATION: 'Mejorar documentación',
  UPDATE_SCREENSHOTS: 'Actualizar capturas de pantalla',
  CLARIFY_REQUIREMENTS: 'Aclarar requisitos del sistema',
  IMPROVE_PRESENTATION: 'Mejorar presentación general'
};

export const WARNING_REASONS = {
  CONTENT_REVIEW: 'Contenido bajo revisión por reportes',
  POLICY_WARNING: 'Advertencia por posible violación de políticas',
  TECHNICAL_ISSUES: 'Problemas técnicos detectados',
  USER_REPORTS: 'Reportes de usuarios sobre el contenido',
  SPAM_DETECTION: 'Posible contenido spam detectado',
  COPYRIGHT_CONCERN: 'Posible problema de derechos de autor'
};

export const DELETION_REASONS = {
  POLICY_VIOLATION: 'Violación grave de políticas',
  COPYRIGHT_INFRINGEMENT: 'Infracción de derechos de autor',
  INAPPROPRIATE_CONTENT: 'Contenido inapropiado confirmado',
  SPAM: 'Contenido spam confirmado',
  TECHNICAL_FAILURE: 'Falla técnica irreparable',
  USER_REQUEST: 'Solicitud del autor',
  LEGAL_ISSUES: 'Problemas legales'
};

interface CreateNotificationOptions {
  userId: string | mongoose.Types.ObjectId;
  type: INotification['type'];
  title: string;
  message: string;
  projectId?: string | mongoose.Types.ObjectId;
  data?: INotification['data'];
  priority?: INotification['priority'];
  actionRequired?: boolean;
  expiresAt?: Date;
  sendEmail?: boolean;
}

class NotificationService {
  async createNotification(options: CreateNotificationOptions): Promise<INotification> {
    const notification = new Notification({
      userId: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      projectId: options.projectId,
      data: options.data,
      priority: options.priority || 'medium',
      actionRequired: options.actionRequired || false,
      expiresAt: options.expiresAt
    });

    await notification.save();

    // Enviar email si se solicita
    if (options.sendEmail) {
      try {
        await this.sendNotificationByEmail(notification);
      } catch (error) {
        console.error('Error enviando email de notificación:', error);
        // No fallar la creación de notificación por error de email
      }
    }

    return notification;
  }

  async sendNotificationByEmail(notification: INotification) {
    const user = await User.findById(notification.userId);
    if (!user) return;

    const project = notification.projectId ? 
      await Project.findById(notification.projectId) : null;

    await sendNotificationEmail({
      to: user.email,
      username: user.username,
      notification,
      project
    });
  }

  // Notificación de proyecto enviado para revisión
  async notifyProjectSubmitted(projectId: string, authorId: string) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Proyecto no encontrado');

    return await this.createNotification({
      userId: authorId,
      type: 'project_status',
      title: 'Proyecto enviado para revisión',
      message: `Tu proyecto "${project.title}" ha sido enviado para revisión por el equipo administrativo.`,
      projectId,
      data: {
        projectTitle: project.title,
        newStatus: 'pending'
      },
      priority: 'medium',
      sendEmail: true
    });
  }

  // Notificación de proyecto publicado
  async notifyProjectPublished(projectId: string, authorId: string, adminName?: string) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Proyecto no encontrado');

    return await this.createNotification({
      userId: authorId,
      type: 'project_status',
      title: '¡Proyecto publicado exitosamente!',
      message: `¡Felicidades! Tu proyecto "${project.title}" ha sido aprobado y ya está disponible públicamente.`,
      projectId,
      data: {
        projectTitle: project.title,
        oldStatus: project.status,
        newStatus: 'published',
        adminName
      },
      priority: 'high',
      sendEmail: true
    });
  }

  // Notificación de proyecto rechazado
  async notifyProjectRejected(
    projectId: string, 
    authorId: string, 
    reasons: string[], 
    customMessage?: string,
    adminName?: string
  ) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Proyecto no encontrado');

    const reasonsText = reasons.length > 0 ? 
      `\n\nMotivos:\n• ${reasons.join('\n• ')}` : '';
    
    const customText = customMessage ? 
      `\n\nComentario adicional: ${customMessage}` : '';

    return await this.createNotification({
      userId: authorId,
      type: 'project_feedback',
      title: 'Proyecto rechazado',
      message: `Tu proyecto "${project.title}" ha sido rechazado y necesita modificaciones antes de ser publicado.${reasonsText}${customText}`,
      projectId,
      data: {
        projectTitle: project.title,
        oldStatus: project.status,
        newStatus: 'rejected',
        feedbackType: 'rejection',
        reasons,
        customMessage,
        adminName
      },
      priority: 'high',
      actionRequired: true,
      sendEmail: true
    });
  }

  // Notificación de solicitud de edición
  async notifyProjectNeedsEditing(
    projectId: string, 
    authorId: string, 
    reasons: string[], 
    customMessage?: string,
    adminName?: string
  ) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Proyecto no encontrado');

    const reasonsText = reasons.length > 0 ? 
      `\n\nSugerencias de mejora:\n• ${reasons.join('\n• ')}` : '';
    
    const customText = customMessage ? 
      `\n\nComentario adicional: ${customMessage}` : '';

    return await this.createNotification({
      userId: authorId,
      type: 'project_feedback',
      title: 'Proyecto requiere edición',
      message: `Tu proyecto "${project.title}" está casi listo para publicación, pero necesita algunas mejoras.${reasonsText}${customText}`,
      projectId,
      data: {
        projectTitle: project.title,
        oldStatus: project.status,
        newStatus: 'needs_author_review',
        feedbackType: 'edit_request',
        reasons,
        customMessage,
        adminName
      },
      priority: 'medium',
      actionRequired: true,
      sendEmail: true
    });
  }

  // Notificación de advertencia
  async notifyProjectWarning(
    projectId: string, 
    authorId: string, 
    reasons: string[], 
    customMessage?: string,
    adminName?: string,
    expiresInDays?: number
  ) {
    const project = await Project.findById(projectId);
    if (!project) throw new Error('Proyecto no encontrado');

    const reasonsText = reasons.length > 0 ? 
      `\n\nMotivos de la advertencia:\n• ${reasons.join('\n• ')}` : '';
    
    const customText = customMessage ? 
      `\n\nDetalles: ${customMessage}` : '';

    const expirationText = expiresInDays ? 
      `\n\nTienes ${expiresInDays} días para resolver estos problemas.` : '';

    const expiresAt = expiresInDays ? 
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : undefined;

    return await this.createNotification({
      userId: authorId,
      type: 'project_warning',
      title: 'Advertencia sobre tu proyecto',
      message: `Tu proyecto "${project.title}" ha recibido una advertencia que requiere tu atención.${reasonsText}${customText}${expirationText}`,
      projectId,
      data: {
        projectTitle: project.title,
        feedbackType: 'warning',
        reasons,
        customMessage,
        adminName
      },
      priority: 'urgent',
      actionRequired: true,
      expiresAt,
      sendEmail: true
    });
  }

  // Notificación de proyecto eliminado
  async notifyProjectDeleted(
    projectTitle: string,
    authorId: string, 
    reasons: string[], 
    customMessage?: string,
    adminName?: string
  ) {
    const reasonsText = reasons.length > 0 ? 
      `\n\nMotivos de la eliminación:\n• ${reasons.join('\n• ')}` : '';
    
    const customText = customMessage ? 
      `\n\nInformación adicional: ${customMessage}` : '';

    return await this.createNotification({
      userId: authorId,
      type: 'project_deleted',
      title: 'Proyecto eliminado',
      message: `Tu proyecto "${projectTitle}" ha sido eliminado de la plataforma.${reasonsText}${customText}`,
      data: {
        projectTitle,
        feedbackType: 'deletion',
        reasons,
        customMessage,
        adminName
      },
      priority: 'urgent',
      sendEmail: true
    });
  }

  // Obtener notificaciones de un usuario
  async getUserNotifications(
    userId: string, 
    options: {
      unreadOnly?: boolean;
      type?: INotification['type'];
      limit?: number;
      skip?: number;
    } = {}
  ) {
    const query: any = { userId };
    
    if (options.unreadOnly) query.read = false;
    if (options.type) query.type = options.type;

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 50)
      .skip(options.skip || 0)
      .populate('projectId', 'title slug status');
  }

  // Marcar notificación como leída
  async markAsRead(notificationId: string, userId: string) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true, readAt: new Date() },
      { new: true }
    );
  }

  // Marcar todas las notificaciones como leídas
  async markAllAsRead(userId: string) {
    return await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );
  }

  // Eliminar notificaciones antiguas
  async cleanupOldNotifications(daysOld: number = 30) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    return await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      read: true
    });
  }

  // Obtener estadísticas de notificaciones
  async getNotificationStats(userId: string) {
    const [total, unread, byType] = await Promise.all([
      Notification.countDocuments({ userId }),
      Notification.countDocuments({ userId, read: false }),
      Notification.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    return {
      total,
      unread,
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  // Eliminar notificación específica (solo el propietario)
  async deleteNotification(notificationId: string, userId: string) {
    return await Notification.findOneAndDelete({
      _id: notificationId,
      userId
    });
  }
}

export const notificationService = new NotificationService();
export default notificationService;