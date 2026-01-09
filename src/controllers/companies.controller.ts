import { Request, Response } from 'express';
import Company from '../models/Company';
import User from '../models/User';
import { z } from 'zod';
import Project from '../models/Project';
import { env } from '../config/env';
import { generateCode } from '../utils/ids';
import { Types } from 'mongoose';
import notificationService from '../services/notifications.service';
import CategoriesService from '../services/categories.service';
import { listCompanies as listCompaniesService } from '../services/companies.service';


const companySchema = z.object({
  name: z.string().min(3),
});

const updateCompanySchema = z.object({
  name: z.string().min(3).optional(),
  photo: z.string().optional(),
  description: z.string().max(200).optional(), // ← NUEVO
  areas: z.array(z.string().max(30)).max(5).optional(), // ← NUEVO
  newOwnerId: z.string().optional(),
});

// Función auxiliar para verificar si un usuario puede administrar una empresa
function canManageCompany(user: any, company: any): boolean {
  if (user.role === 'admin') {
    return true;
  }
  if (company.ownerId.toString() === user.id) {
    return true;
  }
  
  // AGREGAR ESTA LÍNEA:
  // Verificar si el usuario tiene rol de Manager en esta empresa
  const member = company.members.find((m: any) => m.userId?.toString() === user.id);
  if (member && member.roles.includes('Manager')) {
    return true;
  }
  
  return false;
}

export async function createCompany(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });
    
    // ← CAMBIO: Schema completo para parsear TODO
    const createCompanySchema = z.object({
      name: z.string().min(3),
      description: z.string().max(200).optional(),  // ← NUEVO
      areas: z.array(z.string().max(30)).max(5).optional(),  // ← NUEVO: Array de strings
      photo: z.string().optional(),  // Ya estaba
    });

    const { name, description, areas, photo } = createCompanySchema.parse(req.body);
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if ((user.companiesCount || 0) >= env.MAX_COMPANIES_PER_USER) {
      return res.status(400).json({ error: 'Se alcanzó el límite máximo de compañías' });
    }

    const userId = new Types.ObjectId(req.user.id);

    // ← CAMBIO: Agrega description y areas a companyData
    const companyData: any = {
      name,
      description,  // ← NUEVO
      areas: areas || [],  // ← NUEVO: Default vacío
      ownerId: userId,
      code: generateCode(),
      members: [{ userId, roles: ['Owner'] }],  // ← ASEGURA ROLES: Solo userId y roles, NO photo/status aquí
    };

    // ← IGUAL: Validar photo si existe
    if (photo) {
      if (!photo.startsWith('data:image/png;base64,') && !photo.startsWith('data:image/jpeg;base64,')) {
        return res.status(400).json({ error: 'La foto debe estar en formato PNG o JPG' });
      }
      const buffer = Buffer.from(photo.split(',')[1], 'base64');
      if (buffer.length > 50 * 1024) {
        return res.status(400).json({ error: 'El tamaño de la foto no debe exceder los 50 KB' });
      }
      companyData.photo = photo;
    }

    const company = new Company(companyData);
    await company.save();

    user.companiesCount = (user.companiesCount || 0) + 1;
    await user.save();

    // ← CAMBIO: Populate completo para response (incluye roles)
    const populatedCompany = await Company.findById(company._id)
      .populate({
        path: 'ownerId',
        select: 'username email career semester age contacts role'
      })
      .populate({
        path: 'members.userId',
        select: 'username email career semester age contacts role'
      });

    res.status(201).json(populatedCompany);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function joinCompany(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const { code, message } = req.body;
    if (!code) return res.status(400).json({ error: 'Se requiere código' });

    const company = await Company.findOne({ code });
    if (!company) return res.status(404).json({ error: 'Código inválido' });

    const userId = new Types.ObjectId(req.user.id);
    
    const isAlreadyMember = company.members.some(
      member => member.userId?.toString() === req.user!.id
    );
    
    if (isAlreadyMember) {
      return res.status(400).json({ error: 'Ya eres miembro de esta empresa' });
    }

    const hasPendingRequest = company.pendingRequests?.some(
      request => request.userId?.toString() === req.user!.id
    );

    if (hasPendingRequest) {
      return res.status(400).json({ error: 'Ya tienes una solicitud pendiente para esta empresa' });
    }

    // Agregar a solicitudes pendientes
    if (!company.pendingRequests) company.pendingRequests = [];
    company.pendingRequests.push({
      userId,
      message: message || '',
      requestedAt: new Date()
    });

    await company.save();

    res.json({
      message: 'Solicitud enviada. Esperando aprobación del propietario.',
      status: 'pending'
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateMemberRoles(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const { roles } = req.body;
    if (!Array.isArray(roles)) {
      return res.status(400).json({ error: 'Los roles deben estar en la lista' });
    }
    
    console.log('[BACKEND DEBUG updateMemberRoles] Received:', { userId: req.params.userId, roles });
    
    if (roles.length > env.MAX_ROLES_PER_MEMBER) {
      return res.status(400).json({ error: `Se alcanzó el límite máximo de ${env.MAX_ROLES_PER_MEMBER} roles` });
    }

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (!canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Solo el propietario de la empresa o el administrador del sistema pueden actualizar los roles de los miembros' });
    }

    const member = company.members.find(
      (m) => m.userId?.toString() === req.params.userId
    );
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });

    if (roles.length > 0 && !roles.includes('Owner')) {
      // Filtrar roles especiales que no necesitan validación de categorías
      const rolesToValidate = roles.filter(role => !['Owner', 'Publisher', 'Manager'].includes(role));
      
      if (rolesToValidate.length > 0) {
        const validation = await CategoriesService.validateRoleCodes(rolesToValidate);
        if (!validation.valid) {
          console.log('[BACKEND DEBUG updateMemberRoles] Invalid roles:', validation.invalidCodes);
          return res.status(400).json({ 
            error: 'Roles proporcionados no válidos', 
            invalidRoles: validation.invalidCodes 
          });
        }
      }
    }

    const isOwnerBeingModified = member.roles.includes('Owner') && req.user.role !== 'admin';
    if (isOwnerBeingModified && !roles.includes('Owner')) {
      return res.status(403).json({ error: 'No se puede eliminar el rol de propietario. Solo un administrador del sistema puede hacerlo.' });
    }

    member.roles = roles;
    await company.save();
    
    const updatedCompany = await Company.findById(company._id)
      .populate({
        path: 'ownerId',
        select: 'username email career semester age contacts role'
      })
      .populate({
        path: 'members.userId',
        select: 'username email career semester age contacts role'
      });

    console.log('[BACKEND DEBUG updateMemberRoles] Success:', {
      userId: req.params.userId,
      roles: member.roles
    });

    res.json(updatedCompany);
  } catch (error: any) {
    console.error('[BACKEND DEBUG updateMemberRoles Error]:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function removeMember(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

        // Permitir que un usuario se remueva a sí mismo (salir de la empresa)
    const isSelfRemoval = req.params.userId === req.user.id;

    if (!isSelfRemoval && !canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Sólo el propietario de la empresa o el administrador del sistema pueden eliminar miembros' });
    }

    // Solo el owner no puede salirse (a menos que sea admin del sistema)
    if (req.params.userId === req.user.id && company.ownerId.toString() === req.user.id && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'El propietario de la empresa no puede salirse. Debe transferir la propiedad primero.' });
    }

    if (company.ownerId.toString() === req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No se puede eliminar al propietario de la empresa. Solo el administrador del sistema puede hacerlo.' });
    }

    const memberExists = company.members.some(
      (m) => m.userId?.toString() === req.params.userId
    );

    if (!memberExists) {
      return res.status(404).json({ error: 'Miembro no encontrado en esta empresa' });
    }

    company.members = company.members.filter(
      (m) => m.userId?.toString() !== req.params.userId
    );
    await company.save();

    const user = await User.findById(req.params.userId);
    if (user && user.companiesCount) {
      user.companiesCount = Math.max(0, user.companiesCount - 1);
      await user.save();
    }

    const updatedCompany = await Company.findById(company._id)
      .populate({
        path: 'ownerId',
        select: 'username email career semester age contacts role'
      })
      .populate({
        path: 'members.userId',
        select: 'username email career semester age contacts role'
      });

    res.json(updatedCompany);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getCompany(req: Request, res: Response) {
  try {
    // Verificar que req.user exista
    if (!req.user) {
      console.error('[BACKEND DEBUG getCompany] No user in request');
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Guardar req.user en una variable para ayudar a TypeScript
    const user = req.user;

    const company = await Company.findById(req.params.id)
      .populate({
        path: 'ownerId',
        select: 'username email career semester age contacts role photo'
      })
      .populate({
        path: 'members.userId',
        select: 'username email career semester age contacts role photo'
      })
      .populate({
        path: 'pendingRequests.userId',
        select: 'username email career semester age contacts role photo'
      });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Calcular isOwner, userRole y canManage
    const isOwner = company.ownerId._id.toString() === user.id;
    const member = company.members.find(m => m.userId?._id.toString() === user.id);
    const userRole = member ? member.roles : [];
    const canManage = isOwner || user.role === 'admin';

    console.log('[BACKEND DEBUG getCompany] Data sent:', {
      companyId: company._id,
      pendingRequests: company.pendingRequests?.map(r => {
        const user: any = r.userId;
        return {
          userId: user?._id,
          username: user?.username,
          career: user?.career,
          photo: user?.photo || 'No photo'
        };
      }),
      members: company.members?.map(m => {
        const user: any = m.userId;
        return {
          userId: user?._id,
          username: user?.username,
          career: user?.career,
          photo: user?.photo || 'No photo',
          roles: m.roles
        };
      }),
      isOwner,
      userRole,
      canManage
    });
    
    res.json({
      ...company.toObject(),
      isOwner,
      userRole,
      canManage
    });
  } catch (error: any) {
    console.error('[BACKEND DEBUG getCompany Error]:', error);
    res.status(500).json({ error: 'Error Interno del Servidor' });
  }
}

export async function inviteMember(req: Request, res: Response) {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    
    if (!req.user || !canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Sólo el propietario de la empresa puede generar códigos de invitación' });
    }
    
    res.json({ code: company.code });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function listCompanies(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const companies = await listCompaniesService();
    res.json(companies);
  } catch (error: any) {
    console.error('Error in listCompanies:', error);
    res.status(500).json({ error: 'Error Interno del Servidor' });
  }
}

export async function updateCompany(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (!canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Sólo el propietario de la empresa puede actualizar datos de la empresa.' });
    }

    const { name, photo, description, areas, newOwnerId } = updateCompanySchema.parse(req.body);

    // Actualizar nombre si se proporciona
    if (name) {
      company.name = name;
    }

    // Actualizar descripción si se proporciona
    if (description !== undefined) {
      company.description = description;
    }

    // Actualizar áreas si se proporciona
    if (areas !== undefined) {
      company.areas = areas;
    }

    // Validar la imagen si se proporciona
    if (photo) {
      if (!photo.startsWith('data:image/png;base64,') && !photo.startsWith('data:image/jpeg;base64,')) {
        return res.status(400).json({ error: 'La foto debe estar en formato PNG o JPG' });
      }
      const buffer = Buffer.from(photo.split(',')[1], 'base64');
      if (buffer.length > 50 * 1024) {
        return res.status(400).json({ error: 'El tamaño de la foto no debe exceder los 50 KB' });
      }
      company.photo = photo;
    } else if (photo === '') {
      company.photo = undefined;
    }

    // Transferir propietario si se proporciona newOwnerId
    if (newOwnerId) {
      const newOwner = await User.findById(newOwnerId);
      if (!newOwner) return res.status(404).json({ error: 'No se encontró nuevo propietario' });

      const isMember = company.members.some(
        (m) => m.userId?.toString() === newOwnerId
      );
      if (!isMember) {
        return res.status(400).json({ error: 'El nuevo propietario debe ser miembro de la empresa.' });
      }

      // Remover rol Owner del propietario actual
      const currentOwner = company.members.find(
        (m) => m.userId?.toString() === company.ownerId.toString()
      );
      if (currentOwner) {
        currentOwner.roles = currentOwner.roles.filter((role) => role !== 'Owner');
      }

      // Asignar rol Owner al nuevo propietario
      const newOwnerMember = company.members.find(
        (m) => m.userId?.toString() === newOwnerId
      );
      if (newOwnerMember) {
        newOwnerMember.roles = [...new Set([...newOwnerMember.roles, 'Owner'])];
      }

      company.ownerId = new Types.ObjectId(newOwnerId);
    }

    await company.save();

    const updatedCompany = await Company.findById(company._id)
      .populate({
        path: 'ownerId',
        select: 'username email career semester age contacts role'
      })
      .populate({
        path: 'members.userId',
        select: 'username email career semester age contacts role'
      })
      .populate({
        path: 'pendingRequests.userId',
        select: 'username email career semester age contacts role photo'
      });

    console.log('[BACKEND DEBUG updateCompany] Updated:', {
      id: updatedCompany?._id,
      name: updatedCompany?.name,
      description: updatedCompany?.description,
      areas: updatedCompany?.areas,
    });

    res.json(updatedCompany);
  } catch (error: any) {
    console.error('[BACKEND DEBUG updateCompany Error]:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function deleteCompany(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (company.status === 'inactive') return res.status(400).json({ error: 'La empresa ya está programada para eliminación' });

    if (!canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Solo el propietario de la empresa o administrador pueden eliminar la empresa' });
    }

    // HACER SOFT DELETE DIRECTAMENTE (sin confirmación)
    company.status = 'inactive';
    company.deletedAt = new Date();
    company.deleteReason = 'Eliminación directa';
    company.deletedBy = new Types.ObjectId(req.user.id);
    await company.save();

    // Actualizar proyectos correctamente
    await Project.updateMany(
      { companyId: company._id },
      { 
        $set: {
          isOrphan: true,
          isFromInactiveCompany: true,
          originalCompanyId: company._id
        },
        $unset: {
          companyId: ""
        }
      }
    );

    res.json({ 
      message: 'Empresa marcada para eliminación en 5 días',
      companyId: company._id,
      deletedAt: company.deletedAt
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function confirmDeleteCompany(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const { reason } = req.body;
    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Se requiere especificar el motivo' });
    }

    const company = await Company.findById(req.params.id).populate('ownerId', 'email username');
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    if (company.status === 'inactive') return res.status(400).json({ error: 'La empresa ya está programada para eliminación' });

    if (!canManageCompany(req.user, company)) {
      return res.status(403).json({ error: 'Solo el propietario de la empresa o administrador pueden eliminar la empresa' });
    }

    // Soft delete de la empresa
    company.status = 'inactive';
    company.deletedAt = new Date();
    company.deleteReason = reason;
    company.deletedBy = new Types.ObjectId(req.user.id);
    await company.save();

    await Project.updateMany(
      { companyId: company._id },
      { 
        $set: {
          isOrphan: true,
          isFromInactiveCompany: true,
          originalCompanyId: company._id
        },
        $unset: {
          companyId: ""
        }
      }
    );

    // Enviar email de notificación
    const ownerEmail = (company.ownerId as any)?.email;
    if (ownerEmail) {
      // Aquí integrarás con el email service más tarde
      console.log(`Email pendiente para ${ownerEmail}: Empresa ${company.name} eliminada en 5 días`);
    }

    res.json({ 
      message: 'Empresa marcada para eliminación en 5 días',
      companyId: company._id,
      deletedAt: company.deletedAt
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function restoreCompany(req: Request, res: Response) {
  try {
    // Solo administradores
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden restaurar empresas' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Validación modificada
    if (company.status !== 'inactive') {
      return res.status(400).json({ error: 'La empresa no está marcada para eliminación' });
    }

    // Verificar fecha de eliminación si existe
    if (company.deletedAt) {
      const daysPassed = Math.floor((Date.now() - company.deletedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPassed >= 5) {
        return res.status(400).json({ error: 'El período de gracia ha expirado' });
      }
    } else {
      // Si no hay fecha de eliminación, permitir restauración pero advertir
      console.warn(`Empresa ${company._id} marcada como inactiva sin fecha de eliminación`);
    }

    // Restaurar empresa con manejo de campos opcionales
    company.status = 'active';
    if (company.deletedAt) company.deletedAt = undefined;
    if (company.deleteReason) company.deleteReason = undefined;
    if (company.deletedBy) company.deletedBy = undefined;
    await company.save();

    // Restaurar proyectos huérfanos que pertenecían a esta empresa
    await Project.updateMany(
      { originalCompanyId: company._id, isOrphan: true },
      { 
        $set: {
          companyId: company._id,
          isOrphan: false,
          isFromInactiveCompany: false
        },
        $unset: {
          originalCompanyId: ""
        }
      }
    );

    res.json({ 
      message: 'Empresa restaurada exitosamente',
      company
    });

  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getMyCompanies(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const companies = await Company.find({
      'members.userId': req.user.id
    })
    .populate('ownerId', 'username email')  // ← ASEGURA populate
    .populate('members.userId', 'username email career')  // ← Incluye roles en members
    .populate('pendingRequests.userId', 'username email career')
    .sort({ createdAt: -1 });

    // ← IGUAL: Enriquecer con roles
    const companiesWithUserRole = companies.map(company => {
      const member = company.members.find((m: any) => m.userId?._id.toString() === req.user!.id);
      const isOwner = company.ownerId._id.toString() === req.user!.id;
      
      return {
        ...company.toObject(),
        userRole: member?.roles || [],
        isOwner,
        canManage: isOwner,
        canCreateProjects: isOwner || member?.roles.includes('Publisher')
      };
    });

    res.json(companiesWithUserRole);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Obtener solicitudes pendientes (solo owner)
export async function getPendingRequests(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const company = await Company.findById(req.params.id)
      .populate('pendingRequests.userId', 'username career photo');

    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (company.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el propietario puede ver solicitudes pendientes' });
    }

    res.json(company.pendingRequests || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Manejar solicitud de miembro (aceptar/rechazar)
export async function handleMemberRequest(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const { userId, action } = req.body;
    if (!userId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'userId y action (accept/reject) son requeridos' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (company.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el propietario puede gestionar solicitudes' });
    }

    const requestIndex = company.pendingRequests?.findIndex(
      request => request.userId?.toString() === userId
    );

    if (requestIndex === -1 || requestIndex === undefined) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const request = company.pendingRequests![requestIndex];

    if (action === 'accept') {
      // Agregar como miembro
      company.members.push({
        userId: new Types.ObjectId(userId),
        roles: []
      });

      // Actualizar contador del usuario
      const user = await User.findById(userId);
      if (user) {
        user.companiesCount = (user.companiesCount || 0) + 1;
        await user.save();
      }

      // ✅ CAMBIO: Enviar notificación en BACKGROUND (sin esperar)
      notificationService.createNotification({
        userId: userId,
        type: 'company_invitation',
        title: 'Solicitud aceptada',
        message: `Tu solicitud para unirte a "${company.name}" ha sido aceptada.`,
        data: { companyName: company.name, action: 'accepted' },
        sendEmail: true
      }).catch(notifError => {
        console.error('Error enviando notificación de aceptación:', notifError);
      });
    } else {
      // ✅ CAMBIO: Enviar notificación en BACKGROUND (sin esperar)
      notificationService.createNotification({
        userId: userId,
        type: 'company_invitation',
        title: 'Solicitud rechazada',
        message: `Tu solicitud para unirte a "${company.name}" ha sido rechazada.`,
        data: { companyName: company.name, action: 'rejected' },
        sendEmail: true
      }).catch(notifError => {
        console.error('Error enviando notificación de rechazo:', notifError);
      });
    }

    // Remover de solicitudes pendientes
    company.pendingRequests?.splice(requestIndex, 1);
    await company.save();

    // ✅ Responder inmediatamente (sin esperar al email)
    res.json({
      message: action === 'accept' ? 'Miembro aceptado exitosamente' : 'Solicitud rechazada',
      action,
      userName: (request as any).userId?.username || 'Usuario'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Asignar permisos de publicación (solo owner)
export async function assignPublishPermission(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const { userId, canPublish } = req.body;
    if (!userId || typeof canPublish !== 'boolean') {
      return res.status(400).json({ error: 'userId y canPublish son requeridos' });
    }

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (company.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Solo el propietario puede asignar permisos' });
    }

    const member = company.members.find(m => m.userId?.toString() === userId);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });

    // Contar cuántos ya tienen permisos de Publisher
    const publishersCount = company.members.filter(m => 
      m.roles.includes('Publisher')
    ).length;

    if (canPublish) {
      if (publishersCount >= 2 && !member.roles.includes('Publisher')) {
        return res.status(400).json({ error: 'Máximo 2 miembros pueden tener permisos de publicación' });
      }
      if (!member.roles.includes('Publisher')) {
        member.roles.push('Publisher');
      }
    } else {
      member.roles = member.roles.filter(role => role !== 'Publisher');
    }

    await company.save();

    res.json({
      message: canPublish ? 'Permisos de publicación otorgados' : 'Permisos de publicación revocados',
      userId,
      canPublish
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
// ← NUEVO: Endpoint para search por code (arregla búsqueda real)
export async function searchCompanyByCode(req: Request, res: Response) {
  try {
    const { code } = req.params;  // o req.body.code si POST
    if (!code || code.length < 6) return res.status(400).json({ error: 'Código inválido' });

    const company = await Company.findOne({ code })
      .populate({
        path: 'ownerId',
        select: 'username email'
      })
      .populate({
        path: 'members.userId',
        select: 'username'
      });

    if (!company) {
      return res.json({ found: false });
    }

    // Chequea si user ya es member (para frontend)
    const isAlreadyMember = company.members.some(
      (m: any) => m.userId?._id.toString() === req.user!.id
    );

    if (isAlreadyMember) {
      return res.status(400).json({ error: 'Ya eres miembro de esta empresa' });
    }

    res.json({ 
      found: true, 
      company: {
        _id: company._id,
        name: company.name,
        description: company.description,  // ← Incluye nuevos campos
        areas: company.areas,
        code: company.code,
        ownerId: company.ownerId,
        members: company.members.length,
        photo: company.photo,
        createdAt: company.createdAt
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getCompanyProjects(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

    const projects = await Project.find({ 
      companyId: req.params.id,
      isOrphan: false 
    });

    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}