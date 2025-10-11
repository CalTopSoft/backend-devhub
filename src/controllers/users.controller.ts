import { Request, Response } from 'express';
import User from '../models/User';
import Company from '../models/Company';
import Project from '../models/Project';
import { z } from 'zod';

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  photo: z.string().optional(),
  career: z.string().optional(),
  semester: z.number().optional(),
  age: z.number().optional(),
  contacts: z.object({
    whatsapp: z.string().optional(),
    email: z.string().email().optional(),
    outlook: z.string().email().optional(),
    discord: z.string().optional(),
    linkedin: z.string().url().optional(),
  }).optional(),
});

// Función existente - obtener usuario por ID específico
export async function getUser(req: Request, res: Response) {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ error: 'Invalid user ID format' });
  }
}

// Actualizada - obtener el usuario autenticado actual (con populate para projects y companies)
export async function getCurrentUser(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Poblar empresas: donde es owner o miembro
    const companies = await Company.find({
      $or: [
        { ownerId: user._id },
        { 'members.userId': user._id }
      ]
    }).populate('ownerId', 'username email').populate('members.userId', 'username role');

    // Poblar proyectos: solo donde el usuario está en participants
    const companyIds = companies.map(c => c._id);
    const projects = await Project.find({
      companyId: { $in: companyIds },
      participants: user._id // Filtrar por participación activa
    }).populate('companyId', 'name')
      .sort({ createdAt: -1 });

    // Agregar listas al objeto user (sin modificar el documento en BD)
    const userWithData = {
      ...user.toObject(),
      companies: companies,
      projects: projects,
      projectsCount: projects.length // Conteo derivado
    };

    res.json(userWithData);
  } catch (error: any) {
    res.status(500).json({ error: 'Error fetching user data' });
  }
}

// Función existente - actualizar usuario autenticado
export async function updateUser(req: Request, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    console.log('Datos recibidos en el servidor:', req.body); // Depuración

    const data = updateUserSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(req.user.id, data, { new: true }).select('-passwordHash');
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      console.error('Error de validación Zod:', error.errors); // Depuración detallada
      res.status(400).json({ error: 'Invalid data format', details: error.errors });
    } else {
      console.error('Error general:', error.message); // Depuración
      res.status(400).json({ error: error.message });
    }
  }
}