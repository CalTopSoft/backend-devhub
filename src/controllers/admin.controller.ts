import { Request, Response } from 'express';
import Project from '../models/Project';
import User from '../models/User';
import Company from '../models/Company';
import Review from '../models/Review';
import notificationService, { 
  REJECTION_REASONS, 
  EDIT_REASONS, 
  WARNING_REASONS, 
  DELETION_REASONS 
} from '../services/notifications.service';
import { exportBackup as exportBackupService, importBackup as importBackupService } from '../services/backup.service';
import { z } from 'zod';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { sendResetPasswordEmail } from '../services/email.service';

// Esquemas de validación
const projectUpdateSchema = z.object({
  title: z.string().min(3).optional(),
  shortDesc: z.string().min(10).optional(),
  longDesc: z.string().min(20).optional(),
  categories: z.array(z.string()).optional(),
  platforms: z.array(z.enum(['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web'])).optional(),
  iconFileId: z.string().optional(),
  imageFileIds: z.array(z.string()).max(5).optional(),
  participants: z.array(z.string()).optional(),
});

const feedbackSchema = z.object({
  reasons: z.array(z.string()).min(1, 'Debe seleccionar al menos un motivo'),
  customMessage: z.string().optional(),
  expiresInDays: z.number().min(1).max(30).optional()
});

const projectDeletionSchema = z.object({
  reasons: z.array(z.string()).min(1, 'Debe seleccionar al menos un motivo'),
  customMessage: z.string().optional()
});

// Helper function para obtener información del admin
function getAdminInfo(req: Request) {
  return {
    adminId: req.user?.id,
    adminName: req.user?.username || 'Administrador'
  };
}

// Función helper para manejar errores de ObjectId
function validateObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function getAdminProjects(req: Request, res: Response) {
  try {
    const { status } = req.query;

    // Filtrar proyectos de empresas activas
    const baseQuery = status ? { status } : {};
    const query = {
      ...baseQuery,
      isFromInactiveCompany: { $ne: true } // Excluir proyectos de empresas inactivas
    };

    const projects = await Project.find(query)
      .populate({
        path: 'companyId',
        populate: {
          path: 'ownerId',
          select: 'username email'
        }
      })
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ✅ NUEVO: Obtener proyectos con borradores pendientes
export async function getProjectsWithDrafts(req: Request, res: Response) {
  try {
    const projects = await Project.find({
      status: 'published',
      draftStatus: 'pending',
      draft: { $exists: true, $ne: null },
      isFromInactiveCompany: { $ne: true }
    })
      .populate({
        path: 'companyId',
        populate: {
          path: 'ownerId',
          select: 'username email'
        }
      })
      .sort({ draftSubmittedAt: -1 });

    res.json(projects);
  } catch (error: any) {
    console.error('Error in getProjectsWithDrafts:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function updateProject(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Validar ObjectId
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const validated = projectUpdateSchema.parse(req.body);
    const project = await Project.findByIdAndUpdate(id, validated, { new: true });
    
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    res.json(project);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function sendToAuthor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Validar ObjectId - AQUÍ ESTABA TU ERROR
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const validated = feedbackSchema.parse(req.body);
    const { adminName } = getAdminInfo(req);

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Actualizar estado del proyecto
    project.status = 'needs_author_review';
    await project.save();

    // Crear notificación con feedback detallado
    await notificationService.notifyProjectNeedsEditing(
      id,
      project.companyId?.ownerId?.toString() || 'unknown',
      validated.reasons,
      validated.customMessage,
      adminName
    );

    res.json({
      message: 'Proyecto enviado al autor para revisión',
      project
    });
  } catch (error: any) {
    console.error('Error in sendToAuthor:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function publishProject(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const { adminName } = getAdminInfo(req);

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Actualizar proyecto
    project.status = 'published';
    project.publishedAt = new Date();

    // 🔥 NUEVO: Mover archivos de temp a carpeta del proyecto
    const projectId = project._id.toString();
    
    // 🟢 DEBUG: Ver archivos antes de mover
    console.log('[DEBUG] Project files before moving:', {
      icon: project.iconPublicId,
      images: project.imagePublicIds,
      code: project.files?.code?.publicId,
      doc: project.files?.docPdf?.publicId
    });

    try {
      const { moveCloudinaryFiles, getFileInfo } = await import('../services/upload.service');
      let filesMoved = false;

      // Mover icono
      if (project.iconPublicId?.includes('/temp/')) {
        try {
          const newIconId = await moveCloudinaryFiles(
            project.iconPublicId,
            `softstore/projects/${projectId}/icons`
          );
          project.iconPublicId = newIconId;

          const iconInfo = await getFileInfo(newIconId);
          if (iconInfo) project.iconUrl = iconInfo.secureUrl;

          filesMoved = true;
          console.log('[INFO] Icon moved successfully');
        } catch (err) {
          console.error('[ERROR] Failed to move icon:', err);
        }
      }

      // Mover imágenes
      if (project.imagePublicIds && project.imagePublicIds.length > 0) {
        const movedImages: string[] = [];
        const movedUrls: string[] = [];
        
        for (const imageId of project.imagePublicIds) {
          if (imageId.includes('/temp/')) {
            try {
              const newImageId = await moveCloudinaryFiles(
                imageId,
                `softstore/projects/${projectId}/images`
              );
              movedImages.push(newImageId);
              
              const imgInfo = await getFileInfo(newImageId);
              movedUrls.push(imgInfo?.secureUrl || '');
              filesMoved = true;
            } catch (err) {
              console.error('[ERROR] Failed to move image:', imageId, err);
              movedImages.push(imageId); // Mantener original si falla
              movedUrls.push(project.imageUrls?.[project.imagePublicIds.indexOf(imageId)] || '');
            }
          } else {
            movedImages.push(imageId);
            movedUrls.push(project.imageUrls?.[project.imagePublicIds.indexOf(imageId)] || '');
          }
        }

        if (filesMoved) {
          project.imagePublicIds = movedImages;
          project.imageUrls = movedUrls;
          console.log('[INFO] Images moved successfully');
        }
      }

      // Mover código fuente
      if (project.files?.code?.publicId?.includes('/temp/')) {
        try {
          const newCodeId = await moveCloudinaryFiles(
            project.files.code.publicId,
            `softstore/projects/${projectId}/code`
          );
          project.files.code.publicId = newCodeId;

          const codeInfo = await getFileInfo(newCodeId);
          if (codeInfo) project.files.code.url = codeInfo.secureUrl;

          filesMoved = true;
          console.log('[INFO] Code moved successfully');
        } catch (err) {
          console.error('[ERROR] Failed to move code:', err);
        }
      }

      // Mover documentación
      if (project.files?.docPdf?.publicId?.includes('/temp/')) {
        try {
          const newDocId = await moveCloudinaryFiles(
            project.files.docPdf.publicId,
            `softstore/projects/${projectId}/docs`
          );
          project.files.docPdf.publicId = newDocId;

          const docInfo = await getFileInfo(newDocId);
          if (docInfo) project.files.docPdf.url = docInfo.secureUrl;

          filesMoved = true;
          console.log('[INFO] Doc moved successfully');
        } catch (err) {
          console.error('[ERROR] Failed to move doc:', err);
        }
      }

      if (filesMoved) {
        console.log('[INFO] Files moved from temp to project folder');
      } else {
        console.log('[INFO] No files needed to be moved');
      }

    } catch (moveError) {
      console.error('[ERROR] Error during file movement:', moveError);
      // No bloquear la publicación
    }

    await project.save();

    // Notificar al autor
    await notificationService.notifyProjectPublished(
      id,
      project.companyId?.ownerId?.toString() || 'unknown',
      adminName
    );

    res.json({
      message: 'Proyecto publicado exitosamente',
      project
    });

  } catch (error: any) {
    console.error('Error in publishProject:', error);
    res.status(400).json({ error: error.message });
  }
}


export async function rejectProject(req: Request, res: Response) {
  try {
    console.log('=== BACKEND DEBUG rejectProject ===');
    console.log('req.body:', req.body);
    console.log('req.body type:', typeof req.body);
    console.log('req.body.reasons:', req.body.reasons);
    console.log('req.body.customMessage:', req.body.customMessage);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Raw body keys:', Object.keys(req.body));
    console.log('=== END BACKEND DEBUG ===');

    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const validated = feedbackSchema.parse(req.body);
    const { adminName } = getAdminInfo(req);

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Actualizar estado
    project.status = 'rejected';
    await project.save();

    // Notificar rechazo con motivos
    await notificationService.notifyProjectRejected(
      id,
      project.companyId?.ownerId?.toString() || 'unknown',
      validated.reasons,
      validated.customMessage,
      adminName
    );

    res.json({
      message: 'Proyecto rechazado',
      project
    });
  } catch (error: any) {
    console.error('Error in rejectProject:', error);
    res.status(400).json({ error: error.message });
  }
}

// NUEVA FUNCIÓN: Enviar advertencia a proyecto publicado
export async function warnProject(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const validated = feedbackSchema.parse(req.body);
    const { adminName } = getAdminInfo(req);

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Validación de proyecto huérfano
    if (!project.companyId || !project.companyId.ownerId) {
      return res.status(400).json({ error: 'No se puede enviar advertencia a un proyecto huérfano' });
    }

    const authorId = project.companyId.ownerId.toString();

    // Enviar advertencia (el proyecto mantiene su estado)
    await notificationService.notifyProjectWarning(
      id,
      authorId,
      validated.reasons,
      validated.customMessage,
      adminName,
      validated.expiresInDays
    );

    res.json({
      message: 'Advertencia enviada al autor del proyecto',
      project
    });
  } catch (error: any) {
    console.error('Error in warnProject:', error);
    res.status(400).json({ error: error.message });
  }
}


// NUEVA FUNCIÓN: Eliminar proyecto con notificación
export async function deleteProject(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const validated = projectDeletionSchema.parse(req.body);
    const { adminName } = getAdminInfo(req);

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const projectTitle = project.title;

    // --- Manejar propietario ---
    let authorId: string | null = null;
    if (project.companyId && project.companyId.ownerId) {
      authorId = project.companyId.ownerId.toString();
    }

    // Eliminar el proyecto
    await Project.findByIdAndDelete(id);

    // Notificar solo si hay propietario válido
    if (authorId) {
      await notificationService.notifyProjectDeleted(
        projectTitle,
        authorId,
        validated.reasons,
        validated.customMessage,
        adminName
      );
    }

    res.json({
      message: 'Proyecto eliminado y notificación enviada al autor (si aplica)',
      deletedProjectId: id,
      projectTitle
    });
  } catch (error: any) {
    console.error('Error in deleteProject:', error);
    res.status(400).json({ error: error.message });
  }
}


// NUEVA FUNCIÓN: Obtener motivos predefinidos
export async function getFeedbackReasons(req: Request, res: Response) {
  try {
    res.json({
      rejection: REJECTION_REASONS,
      edit: EDIT_REASONS,
      warning: WARNING_REASONS,
      deletion: DELETION_REASONS
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    const users = await User.find().select('-passwordHash');
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function resetUserPassword(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Determinar a qué email enviar
    let targetEmail = email;
    if (!targetEmail) {
      targetEmail = user.email;
    } else {
      // Verificar que el email proporcionado pertenezca al usuario
      const validEmails = [
        user.email,
        user.contacts?.email,
        user.contacts?.outlook
      ].filter(Boolean);

      if (!validEmails.includes(targetEmail)) {
        return res.status(400).json({ 
          error: 'El email especificado no pertenece a este usuario' 
        });
      }
    }

    // Generar token (los admins no tienen límite de intentos)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Actualizar usuario
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    await user.save();

    // Enviar email
    await sendResetPasswordEmail({
      to: targetEmail,
      username: user.username,
      resetToken
    });

    res.json({ 
      message: `Enlace de recuperación enviado a ${targetEmail}`,
      sentTo: targetEmail
    });

  } catch (error) {
    console.error('Error in resetUserPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

export async function exportBackup(req: Request, res: Response) {
  try {
    const collections = req.query.collections ? (req.query.collections as string).split(',') : undefined;
    const { data, size } = await exportBackupService(collections);
    res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.json({ data, size });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function importBackup(req: Request, res: Response) {
  try {
    const backupData = req.body as { [key: string]: any };
    const result = await importBackupService(backupData);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function ping(req: Request, res: Response) {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({ status: 'online' });
  } catch (error) {
    res.status(503).json({ status: 'offline' });
  }
}

export async function getBackupSize(req: Request, res: Response) {
  try {
    const collections = req.query.collections ? (req.query.collections as string).split(',') : undefined;
    
    let totalSize = 0;
    const collectionsToCheck = collections || ['users', 'companies', 'projects', 'projectcategories', 'roles', 'reviews', 'notifications'];
    
    for (const collectionName of collectionsToCheck) {
      const collection = mongoose.connection.db.collection(collectionName);
      const stats = await collection.stats();
      totalSize += stats.size || 0;
    }
    
    res.json({ size: totalSize });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ✅ NUEVO: Aprobar borrador de proyecto publicado
// ✅ NUEVO: Aprobar borrador de proyecto publicado (CORREGIDO)
export async function approveDraft(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');

    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    if (project.status !== 'published') {
      return res.status(400).json({
        error: 'Solo se pueden aprobar borradores de proyectos publicados'
      });
    }

    if (project.draftStatus !== 'pending' || !project.draft) {
      return res.status(400).json({
        error: 'No hay borrador pendiente para este proyecto'
      });
    }

    // 🔥 NUEVO: Guardar archivos viejos para eliminarlos después
    const oldIcon = project.iconPublicId;
    const oldImages = [...(project.imagePublicIds || [])];
    const oldCode = project.files?.code?.publicId;
    const oldDoc = project.files?.docPdf?.publicId;

    // Guardar referencias a archivos del borrador para moverlos
    const draftIcon = project.draft?.iconPublicId;
    const draftImages = project.draft?.imagePublicIds || [];
    const draftCode = project.draft?.files?.code?.publicId;
    const draftDoc = project.draft?.files?.docPdf?.publicId;

    // Aplicar cambios del borrador PRIMERO
    project.applyDraft();

    const { deleteFromCloudinary, moveCloudinaryFiles, getFileInfo } = await import('../services/upload.service');
    const projectId = project._id.toString();

    // ✅ PASO 1: Mover archivos de /updates/ a /projects/
    try {
      // Mover icono
      if (draftIcon?.includes('/updates/')) {
        const newIconId = await moveCloudinaryFiles(draftIcon, `softstore/projects/${projectId}/icons`);
        project.iconPublicId = newIconId;
        const iconInfo = await getFileInfo(newIconId);
        if (iconInfo) project.iconUrl = iconInfo.secureUrl;
        console.log('[INFO] Draft icon moved to projects');
      }

      // Mover imágenes
      if (draftImages.length > 0) {
        const movedImages: string[] = [];
        const movedUrls: string[] = [];

        for (const imgId of draftImages) {
          if (imgId.includes('/updates/')) {
            const newImgId = await moveCloudinaryFiles(imgId, `softstore/projects/${projectId}/images`);
            movedImages.push(newImgId);
            const imgInfo = await getFileInfo(newImgId);
            if (imgInfo) movedUrls.push(imgInfo.secureUrl);
          } else {
            movedImages.push(imgId);
            movedUrls.push(project.imageUrls?.[draftImages.indexOf(imgId)] || '');
          }
        }

        project.imagePublicIds = movedImages;
        project.imageUrls = movedUrls;
        console.log('[INFO] Draft images moved to projects');
      }

      // Mover código
      if (draftCode?.includes('/updates/')) {
        const newCodeId = await moveCloudinaryFiles(draftCode, `softstore/projects/${projectId}/code`);
        project.files = project.files || {};
        if (!project.files.code) {
          project.files.code = { 
            type: 'cloudinary', 
            publicId: newCodeId, 
            url: '', 
            fileName: project.draft?.files?.code?.fileName || 'code'
          };
        } else {
          project.files.code.publicId = newCodeId;
        }
        const codeInfo = await getFileInfo(newCodeId);
        if (codeInfo && project.files.code) project.files.code.url = codeInfo.secureUrl;
        console.log('[INFO] Draft code moved to projects');
      }

      // Mover doc
      if (draftDoc?.includes('/updates/')) {
        const newDocId = await moveCloudinaryFiles(draftDoc, `softstore/projects/${projectId}/docs`);
        project.files = project.files || {};
        if (!project.files.docPdf) {
          project.files.docPdf = { 
            type: 'cloudinary', 
            publicId: newDocId, 
            url: '', 
            fileName: project.draft?.files?.docPdf?.fileName || 'doc.pdf'
          };
        } else {
          project.files.docPdf.publicId = newDocId;
        }
        const docInfo = await getFileInfo(newDocId);
        if (docInfo && project.files.docPdf) project.files.docPdf.url = docInfo.secureUrl;
        console.log('[INFO] Draft doc moved to projects');
      }

    } catch (moveError) {
      console.error('[ERROR] Failed to move draft files:', moveError);
      throw new Error('No se pudieron mover los archivos del borrador');
    }

    // ✅ PASO 2: Eliminar archivos viejos que fueron reemplazados
    const filesToDelete: string[] = [];

    if (draftIcon && oldIcon && draftIcon !== oldIcon) filesToDelete.push(oldIcon);
    if (draftImages.length > 0 && oldImages.length > 0) {
      oldImages.forEach(oldImg => {
        if (!draftImages.includes(oldImg)) filesToDelete.push(oldImg);
      });
    }
    if (draftCode && oldCode && draftCode !== oldCode) filesToDelete.push(oldCode);
    if (draftDoc && oldDoc && draftDoc !== oldDoc) filesToDelete.push(oldDoc);

    if (filesToDelete.length > 0) {
      console.log(`[CLEANUP] Deleting ${filesToDelete.length} old files from projects folder`);
      await Promise.allSettled(filesToDelete.map(id => deleteFromCloudinary(id)));
      console.log('[CLEANUP] Old files deleted successfully');
    }

    // Limpiar borrador
    project.clearDraft();
    await project.save();

    // Notificar al autor
    if (project.companyId && project.companyId.ownerId) {
      const authorId = project.companyId.ownerId.toString();
      const { adminName } = getAdminInfo(req);

      await notificationService.createNotification({
        userId: authorId,
        type: 'project_update',
        title: 'Actualización aprobada',
        message: `Tu actualización para "${project.title}" ha sido aprobada y aplicada.`,
        data: {
          projectId: project._id.toString(),
          projectTitle: project.title,
          adminName
        },
        sendEmail: true
      });
    }

    console.log('[INFO] Draft approved and applied successfully');
    res.json({
      message: 'Borrador aprobado y aplicado exitosamente',
      project
    });

  } catch (error: any) {
    console.error('Error in approveDraft:', error);
    res.status(400).json({ error: error.message });
  }
}


export async function rejectDraft(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const { feedback } = req.body;
    
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Debe proporcionar una razón para rechazar el borrador' 
      });
    }

    const project = await Project.findById(id).populate<{ companyId: { ownerId: Types.ObjectId } }>('companyId');
    
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    if (project.status !== 'published') {
      return res.status(400).json({ 
        error: 'Solo se pueden rechazar borradores de proyectos publicados' 
      });
    }

    if (project.draftStatus !== 'pending' || !project.draft) {
      return res.status(400).json({ 
        error: 'No hay borrador pendiente para este proyecto' 
      });
    }

    // 🔥 NUEVO: Eliminar archivos del borrador rechazado de Cloudinary
    const filesToDelete: string[] = [];
    
    if (project.draft.iconPublicId && project.draft.iconPublicId !== project.iconPublicId) {
      filesToDelete.push(project.draft.iconPublicId);
    }
    
    if (project.draft.imagePublicIds && project.draft.imagePublicIds.length > 0) {
      const currentImageIds = project.imagePublicIds || [];
      project.draft.imagePublicIds.forEach(draftImageId => {
        if (!currentImageIds.includes(draftImageId)) {
          filesToDelete.push(draftImageId);
        }
      });
    }
    
    if (project.draft.files) {
      if (project.draft.files.code?.publicId && 
          project.draft.files.code.publicId !== project.files?.code?.publicId) {
        filesToDelete.push(project.draft.files.code.publicId);
      }
      if (project.draft.files.docPdf?.publicId && 
          project.draft.files.docPdf.publicId !== project.files?.docPdf?.publicId) {
        filesToDelete.push(project.draft.files.docPdf.publicId);
      }
    }

    // Eliminar de Cloudinary
    if (filesToDelete.length > 0) {
      console.log(`[CLEANUP] Eliminando ${filesToDelete.length} archivos rechazados:`, filesToDelete);
      const { deleteFromCloudinary } = await import('../services/upload.service');
      await Promise.allSettled(
        filesToDelete.map(publicId => deleteFromCloudinary(publicId))
      );
      console.log('[CLEANUP] Archivos del borrador rechazado eliminados');
    }

    // Marcar como rechazado y guardar feedback
    project.draftStatus = 'rejected';
    project.draftFeedback = feedback.trim();
    project.draftRejectedAt = new Date();
    
    await project.save();

    // Notificar al autor
    if (project.companyId && project.companyId.ownerId) {
      const authorId = project.companyId.ownerId.toString();
      const { adminName } = getAdminInfo(req);
      
      await notificationService.createNotification({
        userId: authorId,
        type: 'project_update',
        title: 'Actualización rechazada',
        message: `Tu actualización para "${project.title}" ha sido rechazada.`,
        data: { 
          projectId: project._id.toString(),
          projectTitle: project.title,
          feedback,
          adminName
        },
        sendEmail: true
      });
    }

    res.json({
      message: 'Borrador rechazado. El autor fue notificado.',
      filesDeleted: filesToDelete.length,
      project
    });
  } catch (error: any) {
    console.error('Error in rejectDraft:', error);
    res.status(400).json({ error: error.message });
  }
}

// ✅ NUEVO: Limpiar borrador rechazado (autor puede intentar de nuevo)
export async function clearRejectedDraft(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const project = await Project.findById(id).populate('companyId');
    
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Verificar permisos
    const company = project.companyId as any;
    const isOwner = company?.ownerId?.toString() === userId;
    const isPublisher = company?.members?.some(
      (m: any) => m.userId?.toString() === userId && m.roles?.includes('Publisher')
    ) || false;
    
    if (!isOwner && !isPublisher) {
      return res.status(403).json({ 
        error: 'No tienes permisos para realizar esta acción' 
      });
    }

    if (project.draftStatus !== 'rejected') {
      return res.status(400).json({ 
        error: 'Solo se pueden limpiar borradores rechazados' 
      });
    }

    // Limpiar borrador completamente
    project.clearDraft();
    await project.save();

    res.json({
      message: 'Borrador rechazado eliminado. Puedes crear uno nuevo.',
      project
    });
  } catch (error: any) {
    console.error('Error in clearRejectedDraft:', error);
    res.status(400).json({ error: error.message });
  }
}
export async function verifyCompany(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { isVerified } = req.body; // true o false

    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de empresa inválido' });
    }

    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({ error: 'isVerified debe ser true o false' });
    }

    const company = await Company.findByIdAndUpdate(
      id,
      { isVerified },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    res.json({
      message: isVerified ? 'Empresa verificada' : 'Verificación removida',
      company
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getCompanyRankings(req: Request, res: Response) {
  try {
    const companies = await Company.find({ status: 'active', ranking: { $ne: null } })
      .select('_id name ranking rankingScore isVerified photo description')
      .sort({ ranking: 1 })
      .limit(30)
      .populate('ownerId', 'username email');

    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
export async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    if (!validateObjectId(id)) {
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // No permitir eliminar admins (excepto por otro admin)
    if (user.role === 'admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'No puedes eliminar administradores' });
    }

    // Buscar empresas donde es owner
    const ownedCompanies = await Company.find({ ownerId: id });

    // Para cada empresa, transferir ownership al primer miembro disponible
    for (const company of ownedCompanies) {
      const newOwner = company.members.find(m => m.userId?.toString() !== id);
      
      if (newOwner && newOwner.userId) {
        // Transferir ownership
        company.ownerId = newOwner.userId;
        
        // Actualizar roles: remover Owner del usuario actual, agregar al nuevo
        company.members.forEach(m => {
          if (m.userId?.toString() === id) {
            m.roles = m.roles.filter(r => r !== 'Owner');
          } else if (newOwner.userId && m.userId?.toString() === newOwner.userId.toString()) {
            if (!m.roles.includes('Owner')) {
              m.roles.push('Owner');
            }
          }
        });
        
        await company.save();
      } else {
        // Si no hay otros miembros, marcar empresa como inactiva
        company.status = 'inactive';
        company.deletedAt = new Date();
        company.deleteReason = 'Owner eliminado sin miembros disponibles';
        await company.save();
      }
    }

    // Eliminar usuario de todas las empresas donde es miembro
    await Company.updateMany(
      { 'members.userId': id },
      { $pull: { members: { userId: id } } }
    );

    // Eliminar comentarios del usuario
    await Review.deleteMany({ userId: id });

    // Marcar proyectos como huérfanos si era participante único
    await Project.updateMany(
      { participants: id },
      { 
        $pull: { participants: id },
        $addToSet: { inactiveMembers: id }
      }
    );

    // Eliminar usuario
    await User.findByIdAndDelete(id);

    res.json({
      message: 'Usuario eliminado exitosamente',
      companiesTransferred: ownedCompanies.length,
      userId: id
    });

  } catch (error: any) {
    console.error('Error in deleteUser:', error);
    res.status(500).json({ error: error.message });
  }
}