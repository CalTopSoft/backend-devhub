// src/controllers/admin.antivirus.controller.ts
import { Request, Response } from 'express';
import Project from '../models/Project';
import { antivirusService } from '../services/antivirus.service';
import { z } from 'zod';

// Esquemas de validación (app ya no se puede escanear)
const rescanFileSchema = z.object({
  projectId: z.string().min(1, 'ID del proyecto requerido'),
  fileType: z.enum(['code', 'docPdf'], { required_error: 'Tipo de archivo requerido' }) // ❌ Removido 'app'
});

// Obtener estadísticas generales del antivirus
export async function getAntivirusStats(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver estas estadísticas' });
    }

    const stats = antivirusService.getStats();
    
    // Estadísticas de la base de datos (solo code y docPdf)
    const [
      totalProjects,
      projectsWithFiles,
      projectsWithUnsafeFiles,
      recentScans
    ] = await Promise.all([
      Project.countDocuments(),
      Project.countDocuments({
        $or: [
          { 'files.code': { $exists: true } },
          { 'files.docPdf': { $exists: true } }
        ]
      }),
      Project.countDocuments({
        $or: [
          { 'files.code.virusScan.isSafe': false },
          { 'files.docPdf.virusScan.isSafe': false }
        ]
      }),
      Project.find({
        $or: [
          { 'files.code.virusScan.scannedAt': { $exists: true } },
          { 'files.docPdf.virusScan.scannedAt': { $exists: true } }
        ]
      })
      .sort({ 'files.code.virusScan.scannedAt': -1, 'files.docPdf.virusScan.scannedAt': -1 })
      .limit(10)
      .select('title slug files.code.virusScan files.docPdf.virusScan')
    ]);

    res.json({
      success: true,
      stats: {
        api: {
          ...stats,
          apiConfigured: !!process.env.VIRUSTOTAL_API_KEY,
          lastRequestTime: stats.lastRequestTime ? new Date(stats.lastRequestTime).toISOString() : null
        },
        database: {
          totalProjects,
          projectsWithFiles,
          projectsWithUnsafeFiles,
          safeProjects: projectsWithFiles - projectsWithUnsafeFiles,
          recentScans: recentScans.map(project => ({
            id: project._id,
            title: project.title,
            slug: project.slug,
            files: {
              // ❌ app ya no tiene virusScan
              code: project.files?.code?.virusScan,
              docPdf: project.files?.docPdf?.virusScan
            }
          }))
        }
      }
    });

  } catch (error: any) {
    console.error('[ERROR] getAntivirusStats:', error);
    res.status(500).json({ error: error.message });
  }
}

// Obtener proyectos con archivos infectados
export async function getInfectedProjects(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver esta información' });
    }

    const infectedProjects = await Project.find({
      $or: [
        { 'files.code.virusScan.isSafe': false },
        { 'files.docPdf.virusScan.isSafe': false }
      ]
    })
    .populate({
      path: 'companyId',
      select: 'name ownerId',
      populate: {
        path: 'ownerId',
        select: 'username email'
      }
    })
    .sort({ createdAt: -1 });

    const processedProjects = infectedProjects.map(project => {
      const unsafeFiles = (project as any).getUnsafeFiles();
      
      return {
        id: project._id,
        title: project.title,
        slug: project.slug,
        status: project.status,
        company: project.companyId,
        createdAt: project.createdAt,
        unsafeFiles,
        files: {
          code: project.files?.code?.virusScan,
          docPdf: project.files?.docPdf?.virusScan
        }
      };
    });

    res.json({
      success: true,
      count: processedProjects.length,
      projects: processedProjects
    });

  } catch (error: any) {
    console.error('[ERROR] getInfectedProjects:', error);
    res.status(500).json({ error: error.message });
  }
}

// Reescanear archivo específico (solo code y docPdf)
export async function rescanFile(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden reescanear archivos' });
    }

    const { projectId, fileType } = rescanFileSchema.parse(req.body);

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const file = project.files?.[fileType as 'code' | 'docPdf'];
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado en el proyecto' });
    }

    res.json({
      success: true,
      message: 'Función de reescaneo pendiente de implementar',
      projectId,
      fileType,
      currentScan: file.virusScan
    });

  } catch (error: any) {
    console.error('[ERROR] rescanFile:', error);
    res.status(400).json({ error: error.message });
  }
}

// Obtener historial de escaneos de un proyecto específico
export async function getProjectScanHistory(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver el historial de escaneos' });
    }

    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .populate({
        path: 'companyId',
        select: 'name ownerId',
        populate: {
          path: 'ownerId',
          select: 'username email'
        }
      });

    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const scanHistory = {
      project: {
        id: project._id,
        title: project.title,
        slug: project.slug,
        status: project.status,
        company: project.companyId,
        createdAt: project.createdAt
      },
      files: {
        app: project.files?.app ? {
          exists: true,
          type: 'external',
          url: project.files.app.url,
          fileName: project.files.app.fileName,
          note: 'App externa no escaneada (link de descarga)'
        } : { exists: false },
        code: project.files?.code ? {
          exists: true,
          fileName: project.files.code.fileName,
          virusScan: project.files.code.virusScan
        } : { exists: false },
        docPdf: project.files?.docPdf ? {
          exists: true,
          fileName: project.files.docPdf.fileName,
          virusScan: project.files.docPdf.virusScan
        } : { exists: false }
      },
      summary: {
        allFilesSafe: (project as any).areFilesSafe(),
        unsafeFiles: (project as any).getUnsafeFiles()
      }
    };

    res.json({
      success: true,
      scanHistory
    });

  } catch (error: any) {
    console.error('[ERROR] getProjectScanHistory:', error);
    res.status(500).json({ error: error.message });
  }
}

// Marcar archivo como seguro manualmente (solo code y docPdf)
export async function markFileAsSafe(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden marcar archivos como seguros' });
    }

    const { projectId, fileType, reason } = z.object({
      projectId: z.string().min(1),
      fileType: z.enum(['code', 'docPdf']), // ❌ Removido 'app'
      reason: z.string().min(5, 'Se requiere una razón de al menos 5 caracteres')
    }).parse(req.body);

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const file = project.files?.[fileType];
    if (!file || !file.virusScan) {
      return res.status(404).json({ error: 'Archivo o información de escaneo no encontrado' });
    }

    // Actualizar el escaneo marcándolo como seguro
    file.virusScan.isSafe = true;
    file.virusScan.scanId = `admin-override-${Date.now()}`;
    file.virusScan.scannedAt = new Date();
    file.virusScan.threats = [`ADMIN OVERRIDE: ${reason}`];

    await project.save();

    res.json({
      success: true,
      message: 'Archivo marcado como seguro por administrador',
      projectId,
      fileType,
      reason,
      updatedScan: file.virusScan
    });

  } catch (error: any) {
    console.error('[ERROR] markFileAsSafe:', error);
    res.status(400).json({ error: error.message });
  }
}

// Obtener configuración actual del antivirus
export async function getAntivirusConfig(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver la configuración' });
    }

    const config = {
      apiConfigured: !!process.env.VIRUSTOTAL_API_KEY,
      maxFileSize: 32 * 1024 * 1024, // 32MB
      supportedFormats: {
        app: 'Links externos (no escaneados)', // ✅ Actualizado
        code: ['.zip', '.rar', '.7z', '.tar.gz', '.tar'],
        doc: ['.pdf']
      },
      rateLimits: {
        requestsPerMinute: 4,
        requestsPerDay: 500,
        delayBetweenRequests: 15000
      },
      scanningEnabled: !!process.env.VIRUSTOTAL_API_KEY,
      notes: 'Las apps ahora son links externos y no se escanean'
    };

    res.json({
      success: true,
      config
    });

  } catch (error: any) {
    console.error('[ERROR] getAntivirusConfig:', error);
    res.status(500).json({ error: error.message });
  }
}