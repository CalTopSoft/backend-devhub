// src/controllers/projects.controller.ts
import { Request, Response } from 'express';
import Project from '../models/Project';
import Company from '../models/Company';
import notificationService from '../services/notifications.service';
import { z } from 'zod';
import { generateSlug } from '../utils/ids';
import { SortOrder } from 'mongoose';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import path from 'path';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/upload.service';
import { scanWithVirusTotal } from '../services/antivirus.service';

// Función auxiliar para sanitizar nombres de archivos (evita caracteres problemáticos)
function sanitizeFileName(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remover caracteres especiales
    .trim()
    .replace(/\s+/g, '_') // Reemplazar espacios por guiones bajos
    .toLowerCase();
}

const projectSchema = z.object({
  title: z.string().min(3),
  shortDesc: z.string().min(10),
  longDesc: z.string().min(20),
  categories: z.array(z.string()),
  platforms: z.array(z.enum(['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web'])),
  companyId: z.string().optional(),
  participants: z.array(z.string()),
  files: z.object({
    // App externa (sin virusScan)
    app: z.object({ 
      type: z.literal('external'), 
      url: z.string().url(),
      fileName: z.string().optional()
    }).optional(),
    // Código con virusScan
    code: z.object({ 
      type: z.literal('cloudinary'), 
      publicId: z.string(),
      url: z.string(),
      fileName: z.string(),
      virusScan: z.object({
        isSafe: z.boolean(),
        scanId: z.string(),
        scannedAt: z.date().or(z.string()), // ✅ Acepta Date o string ISO
        threats: z.array(z.string()).optional()
      }).optional() // ✅ OPCIONAL
    }).optional(),
    // PDF con virusScan
    docPdf: z.object({ 
      type: z.literal('cloudinary'), 
      publicId: z.string(),
      url: z.string(),
      fileName: z.string(),
      virusScan: z.object({
        isSafe: z.boolean(),
        scanId: z.string(),
        scannedAt: z.date().or(z.string()), // ✅ Acepta Date o string ISO
        threats: z.array(z.string()).optional()
      }).optional() // ✅ OPCIONAL
    }).optional(),
  }).optional(),
  iconPublicId: z.string().optional(),
  iconUrl: z.string().optional(),
  imagePublicIds: z.array(z.string()).max(5).optional(),
  imageUrls: z.array(z.string()).max(5).optional(),
});

// Helper function para manejar errores
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

// ✅ NUEVO: Obtener proyectos con borradores pendientes (para admin)
export async function getProjectsWithDrafts(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden ver esta información' });
    }

    const projects = await Project.find({ 
      status: 'published',
      draftStatus: 'pending'
    })
    .populate({
      path: 'companyId',
      populate: { path: 'ownerId', select: 'username email' }
    })
    .sort({ draftSubmittedAt: -1 });

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}

export async function createProject(req: Request, res: Response) {
  try {
    const validated = projectSchema.parse(req.body);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const company = await Company.findById(validated.companyId);
    if (!company && validated.companyId) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Verificar permisos para crear proyectos
    if (company) {
      const member = company.members.find(m => m.userId?.toString() === userId);
      const isOwner = company.ownerId.toString() === userId;
      const canPublish = member?.roles.includes('Publisher');
      
      if (!member) {
        return res.status(403).json({ error: 'No eres miembro de esta empresa' });
      }
      
      if (!isOwner && !canPublish) {
        return res.status(403).json({ error: 'No tienes permisos para crear proyectos en esta empresa' });
      }
    }
    
    // Filtrar participantes válidos
    const participants = validated.participants.filter(p => 
      company?.members.some(m => m.userId?.toString() === p)
    );
    
    // Obtener miembros inactivos
    const inactiveMembers = company?.members
      .filter(m => m.userId && !participants.includes(m.userId.toString()))
      .map(m => m.userId!)
      .filter(Boolean) || [];
    
    const project = new Project({
      ...validated,
      slug: generateSlug(validated.title),
      status: 'pending',
      participants,
      inactiveMembers,
    });
    
    await project.save();

    // Notificar que el proyecto fue enviado para revisión
    try {
      await notificationService.notifyProjectSubmitted(
        project._id.toString(),
        userId
      );
    } catch (notificationError) {
      console.error('Error enviando notificación de proyecto creado:', notificationError);
    }
    
    res.status(201).json({
      project,
      message: 'Proyecto creado exitosamente y enviado para revisión'
    });
  } catch (error: any) {
    // ✅ Manejo específico para slug duplicado
    if (error.code === 11000 && error.keyPattern?.slug) {
      return res.status(400).json({
        error: 'Ya existe un proyecto con ese nombre. Por favor elige otro título.'
      });
    }

    // ✅ Manejo genérico
    res.status(400).json({ error: getErrorMessage(error) });
  }
}

// valida si un título está disponible antes de crear el proyecto:
export async function checkProjectSlug(req: Request, res: Response) {
  try {
    const { title } = req.query;
    
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Título requerido' });
    }

    const slug = generateSlug(title);
    const exists = await Project.findOne({ slug });
    
    res.json({ 
      available: !exists,
      slug,
      message: exists ? 'Ya existe un proyecto con ese nombre' : 'Nombre disponible'
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}

export async function getProjects(req: Request, res: Response) {
  try {
    const { category, platform, sort = 'recent', search } = req.query;
    const query: any = { 
  status: 'published',
  $and: [
    { companyId: { $ne: null } },
    { isFromInactiveCompany: { $ne: true } }
  ]
};
    
    // Aplicar filtros básicos
    if (category) {
      query.categories = category;
    }
    if (platform) {
      query.platforms = platform;
    }
    
    // Manejar búsqueda de texto
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      
      // Si el término de búsqueda es muy corto o contiene caracteres especiales,
      // usar regex en lugar de $text search
      if (searchTerm.length < 3 || /[^a-zA-Z0-9\s]/.test(searchTerm)) {
        query.$or = [
          { title: { $regex: searchTerm, $options: 'i' } },
          { shortDesc: { $regex: searchTerm, $options: 'i' } },
          { longDesc: { $regex: searchTerm, $options: 'i' } },
          { categories: { $regex: searchTerm, $options: 'i' } }
        ];
      } else {
        // Usar búsqueda de texto completo para términos más largos
        try {
          query.$text = { $search: searchTerm };
        } catch (textSearchError) {
          console.warn('Text search failed, falling back to regex:', textSearchError);
          // Fallback a regex si falla la búsqueda de texto
          query.$or = [
            { title: { $regex: searchTerm, $options: 'i' } },
            { shortDesc: { $regex: searchTerm, $options: 'i' } },
            { longDesc: { $regex: searchTerm, $options: 'i' } },
            { categories: { $regex: searchTerm, $options: 'i' } }
          ];
        }
      }
    }

    // Configurar ordenamiento
    let sortOption: { [key: string]: SortOrder } = {};
    switch (sort) {
      case 'recent':
        sortOption = { createdAt: -1 as SortOrder };
        break;
      case 'popular':
        sortOption = { ratingAvg: -1 as SortOrder, ratingCount: -1 as SortOrder };
        break;
      case 'name':
        sortOption = { title: 1 as SortOrder };
        break;
      default:
        sortOption = { createdAt: -1 as SortOrder };
    }

    // Si se usa búsqueda de texto, incluir score en el ordenamiento
    if (query.$text) {
      sortOption = { 
        score: { $meta: 'textScore' } as any,
        ...sortOption 
      };
    }

    const projects = await Project.find(query)
      .sort(sortOption)
      .populate({
        path: 'companyId',
        populate: { path: 'ownerId', select: 'username email' }
      });

    res.json(projects);
  } catch (error) {
    console.error('Error in getProjects:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
}

export async function getProject(req: Request, res: Response) {
  try {
    const project = await Project.findOne({ slug: req.params.slug })
      .populate({
        path: 'companyId',
        populate: { path: 'ownerId', select: 'username email' }
      })
      .populate({
        path: 'participants',
        select: 'username email photo career semester age contacts'
      })
      .lean(); // ✅ Convertir a objeto plano

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.companyId || project.isFromInactiveCompany) {
      return res.status(404).json({ error: 'Project not available' });
    }

    // ✅ Buscar la empresa para obtener los roles
    const company = await Company.findById(project.companyId).lean();
    
    // ✅ Agregar roles a cada participante
    if (company && Array.isArray(project.participants)) {
      project.participants = project.participants.map((participant: any) => {
        // Solo procesar si participant es un objeto (poblado correctamente)
        if (participant && typeof participant === 'object' && participant._id) {
          const member = company.members?.find(
            (m: any) => m.userId?.toString() === participant._id.toString()
          );
          return {
            ...participant,
            roles: member?.roles || []
          };
        }
        return participant;
      });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}


export async function updateProject(req: Request, res: Response) {
  try {
    console.log('[DEBUG updateProject] Body:', JSON.stringify(req.body, null, 2));
    
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log('[DEBUG updateProject] Finding project:', req.params.id);
    const project = await Project.findById(req.params.id).populate('companyId');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    console.log('[DEBUG updateProject] Project found, checking permissions');
    const company = project.companyId as any;
    
    const isAdmin = userRole === 'admin';
    const isOwner = company?.ownerId?.toString() === userId;
    const member = company?.members?.find((m: any) => m.userId?.toString() === userId);
    const isPublisher = member?.roles?.includes('Publisher') || false;
    
    console.log('[DEBUG updateProject] Permission check:', {
      userId,
      userRole,
      isAdmin,
      isOwner,
      isPublisher,
      projectStatus: project.status
    });
    
    // Verificar permisos básicos
    if (!isAdmin && !isOwner && !isPublisher) {
      console.log('[DEBUG updateProject] User has no permission');
      return res.status(403).json({ 
        error: 'No tienes permisos para editar este proyecto. Solo el Owner o miembros con rol Publisher pueden editarlo.' 
      });
    }
    
    // ✅ NUEVO: Si el proyecto está publicado y NO es admin, crear borrador
    if (project.status === 'published' && !isAdmin) {
      console.log('[DEBUG updateProject] Creating draft for published project');
      
      // 🔥 NUEVO: Detectar archivos viejos para eliminar después
      const oldFiles = {
        icon: project.iconPublicId,
        images: project.imagePublicIds || [],
        code: project.files?.code?.publicId,
        docPdf: project.files?.docPdf?.publicId
      };

      // Flag para indicar que es una actualización
      const isUpdate = true; 

      // 🔥 FIX: Construir draft PRESERVANDO archivos no modificados
      const draftChanges: any = {};
      let hasChanges = false;

      // Comparar y agregar solo campos modificados
      if (req.body.title && req.body.title !== project.title) {
        draftChanges.title = req.body.title;
        hasChanges = true;
      }
      if (req.body.shortDesc && req.body.shortDesc !== project.shortDesc) {
        draftChanges.shortDesc = req.body.shortDesc;
        hasChanges = true;
      }
      if (req.body.longDesc && req.body.longDesc !== project.longDesc) {
        draftChanges.longDesc = req.body.longDesc;
        hasChanges = true;
      }
      if (req.body.iconPublicId !== undefined && req.body.iconPublicId !== project.iconPublicId) {
        draftChanges.iconPublicId = req.body.iconPublicId;
        draftChanges.iconUrl = req.body.iconUrl;
        hasChanges = true;
      }
      if (req.body.imagePublicIds !== undefined && 
          JSON.stringify(req.body.imagePublicIds) !== JSON.stringify(project.imagePublicIds)) {
        draftChanges.imagePublicIds = req.body.imagePublicIds;
        draftChanges.imageUrls = req.body.imageUrls;
        hasChanges = true;
      }

      // 🔥 FIX CRÍTICO: Manejar archivos PRESERVANDO los existentes
      if (req.body.files) {
        // Copiar archivos actuales como base
        draftChanges.files = {
          app: project.files?.app ? { ...project.files.app } : undefined,
          code: project.files?.code ? { ...project.files.code } : undefined,
          docPdf: project.files?.docPdf ? { ...project.files.docPdf } : undefined
        };
        
        // Solo sobrescribir los que vienen en el body
        if (req.body.files.app !== undefined) {
          draftChanges.files.app = req.body.files.app;
          hasChanges = true;
        }
        if (req.body.files.code !== undefined) {
          draftChanges.files.code = req.body.files.code;
          hasChanges = true;
        }
        if (req.body.files.docPdf !== undefined) {
          draftChanges.files.docPdf = req.body.files.docPdf;
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        return res.status(400).json({ 
          error: 'No se detectaron cambios para guardar' 
        });
      }

      console.log('[DEBUG] Draft changes to save:', JSON.stringify(draftChanges, null, 2));

      // Guardar como borrador
      project.draft = draftChanges;
      project.draftStatus = 'pending';
      project.draftSubmittedAt = new Date();
      project.draftFeedback = undefined;
      project.draftRejectedAt = undefined;

      await project.save();
            
      // 🔥 NUEVO: Si el borrador incluye nuevos archivos, NO eliminar los viejos aún
      // (se eliminarán cuando el admin apruebe el borrador)
      console.log('[DEBUG] Draft saved. Old files will be deleted upon approval.');

      console.log('[DEBUG updateProject] Draft created successfully');
      
      return res.json({
        project,
        message: 'Los cambios se han guardado como borrador y serán revisados por un administrador. La versión actual permanece publicada.',
        isDraft: true
      });
    }
    
    // ✅ SI ES ADMIN: Puede editar directamente (incluso publicados)
    console.log('[DEBUG updateProject] Admin editing, applying changes directly');
    
    if (req.body.iconPublicId !== undefined) {
      project.iconPublicId = req.body.iconPublicId;
    }
    if (req.body.iconUrl !== undefined) {
      project.iconUrl = req.body.iconUrl;
    }
    if (req.body.imagePublicIds !== undefined) {
      project.imagePublicIds = req.body.imagePublicIds;
    }
    if (req.body.imageUrls !== undefined) {
      project.imageUrls = req.body.imageUrls;
    }
    if (req.body.categories !== undefined) {
      project.categories = req.body.categories;
    }
    if (req.body.platforms !== undefined) {
      project.platforms = req.body.platforms;
    }
    
    // 🔥 FIX: Solo actualizar archivos que vienen en el body
    if (req.body.files) {
      console.log('[DEBUG] Files in body:', Object.keys(req.body.files));
      project.files = project.files || {};
      
      // Solo actualizar lo que viene específicamente en el body
      if ('app' in req.body.files) {
        project.files.app = req.body.files.app;
      }
      if ('code' in req.body.files) {
        project.files.code = req.body.files.code;
      }
      if ('docPdf' in req.body.files) {
        project.files.docPdf = req.body.files.docPdf;
      }
      
      project.markModified('files');
    }
    
    console.log('[DEBUG updateProject] About to save project');

    // 🔥 NUEVO: Si es admin editando proyecto publicado, eliminar archivos viejos y actualizar URLs
    const { deleteFromCloudinary, getFileInfo } = await import('../services/upload.service');

    // Icono
    if (req.body.iconPublicId && project.iconPublicId && req.body.iconPublicId !== project.iconPublicId) {
      await deleteFromCloudinary(project.iconPublicId).catch(e => 
        console.warn('[CLEANUP] Could not delete old icon:', e)
      );
      // Actualizar URL del nuevo icono
      const iconInfo = await getFileInfo(req.body.iconPublicId);
      if (iconInfo) project.iconUrl = iconInfo.secureUrl;
    }

    // Imágenes
    if (req.body.imagePublicIds && project.imagePublicIds) {
      const oldImages = project.imagePublicIds.filter(
        oldId => !req.body.imagePublicIds.includes(oldId)
      );
      await Promise.allSettled(oldImages.map(id => deleteFromCloudinary(id)));
      
      // Actualizar URLs de las nuevas imágenes
      const newUrls = await Promise.all(
        req.body.imagePublicIds.map(async (id: string) => {
          const info = await getFileInfo(id);
          return info?.secureUrl || '';
        })
      );
      project.imageUrls = newUrls.filter(Boolean);
    }

    // Código fuente
    if (req.body.files?.code?.publicId && project.files?.code?.publicId && 
        req.body.files.code.publicId !== project.files.code.publicId) {
      await deleteFromCloudinary(project.files.code.publicId).catch(e => 
        console.warn('[CLEANUP] Could not delete old code:', e)
      );
      const codeInfo = await getFileInfo(req.body.files.code.publicId);
      if (codeInfo) project.files.code.url = codeInfo.secureUrl;
    }

    // Documentación PDF
    if (req.body.files?.docPdf?.publicId && project.files?.docPdf?.publicId && 
        req.body.files.docPdf.publicId !== project.files.docPdf.publicId) {
      await deleteFromCloudinary(project.files.docPdf.publicId).catch(e => 
        console.warn('[CLEANUP] Could not delete old doc:', e)
      );
      const docInfo = await getFileInfo(req.body.files.docPdf.publicId);
      if (docInfo) project.files.docPdf.url = docInfo.secureUrl;
    }

    // Guardar proyecto actualizado
    await project.save();
    console.log('[DEBUG updateProject] Project saved successfully');

    
    res.json({
      project,
      message: 'Proyecto actualizado exitosamente',
      isDraft: false
    });
  } catch (error) {
    console.error('[ERROR updateProject] Exception:', error);
    console.error('[ERROR updateProject] Stack:', (error as Error).stack);
    res.status(400).json({ error: getErrorMessage(error) });
  }
}


// ✅ MODIFICACIÓN 1: getMyProjects - Incluir proyectos donde el usuario es Publisher
export async function getMyProjects(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Buscar empresas donde el usuario es owner
    const ownedCompanies = await Company.find({ ownerId: userId });
    const ownedCompanyIds = ownedCompanies.map(c => c._id);

    // ✅ NUEVO: Buscar empresas donde el usuario tiene rol Publisher
    const publisherCompanies = await Company.find({
      'members': {
        $elemMatch: {
          userId: userId,
          roles: 'Publisher'
        }
      }
    });
    const publisherCompanyIds = publisherCompanies.map(c => c._id);

    // Combinar ambos arrays de IDs (sin duplicados)
    const allCompanyIds = [...new Set([...ownedCompanyIds, ...publisherCompanyIds])];

    // Buscar proyectos de esas empresas
    const projects = await Project.find({ companyId: { $in: allCompanyIds } })
      .populate('companyId')
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}

// ✅ MODIFICACIÓN 3 (OPCIONAL): resubmitProject - Permitir a Publishers reenviar
export async function resubmitProject(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const project = await Project.findById(req.params.id).populate('companyId');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const company = project.companyId as any;
    const isOwner = company?.ownerId?.toString() === userId;
    
    // ✅ NUEVO: Verificar si tiene rol Publisher
    const isPublisher = company?.members?.some(
      (m: any) => m.userId?.toString() === userId && m.roles?.includes('Publisher')
    ) || false;
    
    // ✅ MODIFICADO: Permitir a Owner o Publisher reenviar
    if (!isOwner && !isPublisher) {
      return res.status(403).json({ 
        error: 'Solo el dueño del proyecto o un miembro con rol Publisher pueden reenviarlo' 
      });
    }

    // Verificar que el proyecto está en estado que permite reenvío
    if (!['rejected', 'needs_author_review'].includes(project.status)) {
      return res.status(400).json({ 
        error: 'El proyecto debe estar rechazado o necesitar revisión para poder reenviarlo' 
      });
    }

    // Cambiar estado a pending
    project.status = 'pending';
    await project.save();

    // Notificar que el proyecto fue reenviado
    try {
      await notificationService.notifyProjectSubmitted(
        project._id.toString(),
        userId
      );
    } catch (notificationError) {
      console.error('Error enviando notificación de reenvío:', notificationError);
    }

    res.json({
      project,
      message: 'Proyecto reenviado para revisión exitosamente'
    });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
  }
}

// ✅ MODIFICACIÓN 2: getProjectById - Permitir acceso a Publishers
export async function getProjectById(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const project = await Project.findById(req.params.id)
      .populate({
        path: 'companyId',
        populate: { path: 'ownerId', select: 'username email' }
      })
      .populate({
        path: 'participants',
        select: 'username email photo career semester age contacts'
      })
      .lean();

    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const company = project.companyId as any;
    const isOwner = company?.ownerId?._id.toString() === userId;
    const isAdmin = req.user?.role === 'admin';
    
    // ✅ NUEVO: Verificar si tiene rol Publisher
    const isPublisher = company?.members?.some(
      (m: any) => m.userId?.toString() === userId && m.roles?.includes('Publisher')
    ) || false;
    
    // ✅ MODIFICADO: Permitir acceso a Owner, Publisher o Admin
    if (!isOwner && !isPublisher && !isAdmin) {
      return res.status(403).json({ 
        error: 'No tienes permisos para ver este proyecto. Solo el Owner o miembros con rol Publisher pueden acceder.' 
      });
    }

    // Buscar company completa y agregar roles
    const fullCompany = await Company.findById(project.companyId).lean();
    if (fullCompany && Array.isArray(project.participants)) {
      project.participants = project.participants.map((participant: any) => {
        if (participant && typeof participant === 'object' && participant._id) {
          const member = fullCompany.members?.find(
            (m: any) => m.userId?.toString() === participant._id.toString()
          );
          return {
            ...participant,
            roles: member?.roles || []
          };
        }
        return participant;
      });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}


// src/controllers/project.controller.ts
export async function createProjectWithFiles(req: Request, res: Response) {
  let uploadedFileIds: string[] = [];
  let createdProjectId: string | null = null;

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // 1. Validar datos básicos
    const basicSchema = z.object({
      title: z.string().min(3),
      shortDesc: z.string().min(10),
      longDesc: z.string().min(20),
      categories: z.array(z.string()).min(1),
      platforms: z.array(z.enum(['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web'])).min(1),
      companyId: z.string(),
      participants: z.array(z.string()).min(1)
    });

    const basicData = basicSchema.parse(req.body);

    // 2. Validar empresa y permisos
    const company = await Company.findById(basicData.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const isOwner = company.ownerId.toString() === userId;
    const member = company.members.find(m => m.userId?.toString() === userId);
    if (!isOwner && (!member || !member.roles.includes('Publisher'))) {
      return res.status(403).json({ error: 'No tienes permisos para crear proyectos' });
    }

    // 3. Crear proyecto base
    const project = new Project({
      ...basicData,
      slug: generateSlug(basicData.title),
      status: 'pending',
      participants: basicData.participants,
      inactiveMembers: company.members
        .filter(m => m.userId && !basicData.participants.includes(m.userId.toString()))
        .map(m => m.userId!)
        .filter(Boolean) || []
    });

    await project.save();
    createdProjectId = project._id.toString();
    console.log('[INFO] Proyecto base creado:', createdProjectId);

    // 4. Subir archivos si existen
    const files = req.files as { [key: string]: Express.Multer.File[] };
    const updates: any = {};

    // Subir icono
    if (files?.icon && files.icon[0]) {
      const iconFile = files.icon[0];
      const sanitizedTitle = sanitizeFileName(project.title);
      const iconExt = path.extname(iconFile.originalname).toLowerCase() || '.png';
      const iconName = `icon_${sanitizedTitle}_${Date.now()}${iconExt}`;
      
      const iconResult = await uploadToCloudinary(iconFile.buffer, iconName, iconFile.mimetype, `softstore/${project._id}/icons`);
      uploadedFileIds.push(iconResult.fileId);
      updates.iconPublicId = iconResult.fileId;
      updates.iconUrl = iconResult.secureUrl;
    }

    // Subir imágenes
    if (files?.images && files.images.length > 0) {
      const imageResults = [];
      for (let i = 0; i < Math.min(files.images.length, 5); i++) {
        const imgFile = files.images[i];
        const sanitizedTitle = sanitizeFileName(project.title);
        const imgExt = path.extname(imgFile.originalname).toLowerCase() || '.png';
        const imgName = `image_${sanitizedTitle}_${Date.now()}_${i+1}${imgExt}`;
        
        const imgResult = await uploadToCloudinary(imgFile.buffer, imgName, imgFile.mimetype, `softstore/${project._id}/images`);
        uploadedFileIds.push(imgResult.fileId);
        imageResults.push({ fileId: imgResult.fileId, url: imgResult.secureUrl });
      }
      updates.imagePublicIds = imageResults.map(r => r.fileId);
      updates.imageUrls = imageResults.map(r => r.url);
    }

    // Subir app
    if (files?.app && files.app[0]) {
      const appFile = files.app[0];
      
      // Escanear con VirusTotal
      const virusScan = await scanWithVirusTotal(appFile.buffer, appFile.originalname);
      if (!virusScan.isSafe) {
        throw new Error(`Archivo contiene malware: ${virusScan.threats.join(', ')}`);
      }

      const sanitizedTitle = sanitizeFileName(project.title);
      const appExt = path.extname(appFile.originalname).toLowerCase();
      const appName = `app_${sanitizedTitle}_${Date.now()}${appExt}`;
      
      const appResult = await uploadToCloudinary(appFile.buffer, appName, appFile.mimetype, `softstore/${project._id}/apps`);
      uploadedFileIds.push(appResult.fileId);
      updates.files = updates.files || {};
      updates.files.app = {
        type: 'cloudinary',
        publicId: appResult.fileId,
        url: appResult.secureUrl,
        fileName: appFile.originalname,
        virusScan
      };
    }

    // Subir código
    if (files?.code && files.code[0]) {
      const codeFile = files.code[0];
      const virusScan = await scanWithVirusTotal(codeFile.buffer, codeFile.originalname);
      if (!virusScan.isSafe) {
        throw new Error(`Código contiene malware: ${virusScan.threats.join(', ')}`);
      }

      const sanitizedTitle = sanitizeFileName(project.title);
      const codeExt = path.extname(codeFile.originalname).toLowerCase();
      const codeName = `code_${sanitizedTitle}_${Date.now()}${codeExt}`;
      
      const codeResult = await uploadToCloudinary(codeFile.buffer, codeName, codeFile.mimetype, `softstore/${project._id}/code`);
      uploadedFileIds.push(codeResult.fileId);
      updates.files = updates.files || {};
      updates.files.code = {
        type: 'cloudinary',
        publicId: codeResult.fileId,
        url: codeResult.secureUrl,
        fileName: codeFile.originalname,
        virusScan
      };
    }

    // Subir documentación
    if (files?.doc && files.doc[0]) {
      const docFile = files.doc[0];
      const virusScan = await scanWithVirusTotal(docFile.buffer, docFile.originalname);
      if (!virusScan.isSafe) {
        throw new Error(`Documento contiene malware: ${virusScan.threats.join(', ')}`);
      }

      const sanitizedTitle = sanitizeFileName(project.title);
      const docName = `doc_${sanitizedTitle}_${Date.now()}.pdf`;
      
      const docResult = await uploadToCloudinary(docFile.buffer, docName, docFile.mimetype, `softstore/${project._id}/docs`);
      uploadedFileIds.push(docResult.fileId);
      updates.files = updates.files || {};
      updates.files.docPdf = {
        type: 'cloudinary',
        publicId: docResult.fileId,
        url: docResult.secureUrl,
        fileName: docFile.originalname,
        virusScan
      };
    }

    // 5. Actualizar proyecto con archivos
    if (Object.keys(updates).length > 0) {
      Object.assign(project, updates);
      await project.save();
    }

    // 6. ¡TODO OK! → Enviar notificación
    await notificationService.notifyProjectSubmitted(project._id.toString(), userId);

    return res.status(201).json({
      project,
      message: 'Proyecto creado exitosamente y enviado para revisión'
    });

  } catch (error) {
    // 7. ROLLBACK: Eliminar archivos y proyecto si hubo error
    console.error('[ERROR] Creación de proyecto fallida:', error);
    
    // Eliminar archivos subidos
    if (uploadedFileIds.length > 0) {
      await Promise.allSettled(
        uploadedFileIds.map(id => deleteFromCloudinary(id))
      );
      console.log('[CLEANUP] Archivos eliminados:', uploadedFileIds.length);
    }
    
    // Eliminar proyecto si se creó
    if (createdProjectId) {
      await Project.findByIdAndDelete(createdProjectId);
      console.log('[CLEANUP] Proyecto eliminado:', createdProjectId);
    }

    return res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Error al crear proyecto' 
    });
  }
}

export async function likeProject(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const projectId = req.params.id;

    console.log('[DEBUG likeProject] userId:', userId, 'projectId:', projectId);

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!validateObjectId(projectId)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const userObjectId = new Types.ObjectId(userId);
    const alreadyLiked = project.likedBy?.some(id => id.toString() === userId) || false;

    console.log('[DEBUG likeProject] alreadyLiked:', alreadyLiked);

    if (alreadyLiked) {
      project.likedBy = project.likedBy?.filter(id => id.toString() !== userId) || [];
      project.likes = Math.max(0, (project.likes || 0) - 1);
    } else {
      project.likedBy = [...(project.likedBy || []), userObjectId];
      project.likes = (project.likes || 0) + 1;
    }

    project.markModified('likedBy');
    await project.save();

    console.log('[DEBUG likeProject] Response:', { liked: !alreadyLiked, likes: project.likes });

    res.json({
      liked: !alreadyLiked,
      likes: project.likes,
      message: alreadyLiked ? 'Like removido' : 'Like agregado'
    });
  } catch (error: any) {
    console.error('[ERROR likeProject]:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function getProjectLikes(req: Request, res: Response) {
  try {
    const projectId = req.params.id;
    const userId = req.user?.id;

    if (!validateObjectId(projectId)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const project = await Project.findById(projectId).select('likes likedBy');
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const userLiked = userId 
      ? (project.likedBy?.some(id => id.toString() === userId) || false) 
      : false;

    //console.log('[DEBUG getProjectLikes]', { userId, userLiked, likedByArray: project.likedBy?.map(id => id.toString()) });

    res.json({
      likes: project.likes || 0,
      userLiked
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Si no está, agregar esta función helper (probablemente ya esté en admin.controller.ts)
function validateObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}
