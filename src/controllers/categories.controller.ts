import { Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import CategoriesService from '../services/categories.service';


// Schemas de validación
const categorySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(5).max(200),
  code: z.string().min(2).max(20).regex(/^[a-z_]+$/, 'Code must be lowercase letters and underscores only'),
  icon: z.string().optional(),
});

const roleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(5).max(200),
  code: z.string().min(2).max(30).regex(/^[a-z_]+$/, 'Code must be lowercase letters and underscores only'),
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID'),
  responsibilities: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});

const updateCategorySchema = categorySchema.partial();
const updateRoleSchema = roleSchema.partial();

// Controladores para Categorías

export async function getCategories(req: Request, res: Response) {
  try {
    const categories = await CategoriesService.getCategories();
    res.json(categories);
  } catch (error: any) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCategoriesWithRoles(req: Request, res: Response) {
  try {
    const categoriesWithRoles = await CategoriesService.getCategoriesWithRoles();
    res.json(categoriesWithRoles);
  } catch (error: any) {
    console.error('Error getting categories with roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCategory(req: Request, res: Response) {
  try {
    const category = await CategoriesService.getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error: any) {
    console.error('Error getting category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const categoryData = categorySchema.parse(req.body);
    const category = await CategoriesService.createCategory(categoryData);
    res.status(201).json(category);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'El nombre o código de la categoría ya existe' });
    }
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCategory(req: Request, res: Response) {
  try {
    const updateData = updateCategorySchema.parse(req.body);
    const category = await CategoriesService.updateCategory(req.params.id, updateData);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(category);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const success = await CategoriesService.deleteCategory(req.params.id);
    
    if (!success) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Controladores para Roles

export async function getRoles(req: Request, res: Response) {
  try {
    const roles = await CategoriesService.getRoles();
    res.json(roles);
  } catch (error: any) {
    console.error('Error getting roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRolesByCategory(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const roles = await CategoriesService.getRolesByCategory(categoryId);
    res.json(roles);
  } catch (error: any) {
    console.error('Error getting roles by category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRolesByCategoryCode(req: Request, res: Response) {
  try {
    const { categoryCode } = req.params;
    const roles = await CategoriesService.getRolesByCategoryCode(categoryCode);
    res.json(roles);
  } catch (error: any) {
    console.error('Error getting roles by category code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRole(req: Request, res: Response) {
  try {
    const role = await CategoriesService.getRoleById(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json(role);
  } catch (error: any) {
    console.error('Error getting role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createRole(req: Request, res: Response) {
  try {
    const parsedData = roleSchema.parse(req.body);
    
    // Verificar que la categoría existe
    const category = await CategoriesService.getCategoryById(parsedData.categoryId);
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }
    
    // Convertir categoryId string a ObjectId
    const roleData = {
      ...parsedData,
      categoryId: new mongoose.Types.ObjectId(parsedData.categoryId)
    };
    
    const role = await CategoriesService.createRole(roleData);
    res.status(201).json(role);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Role name already exists for this category or role code already exists' });
    }
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateRole(req: Request, res: Response) {
  try {
    const parsedData = updateRoleSchema.parse(req.body);
    
    // Convertir categoryId string a ObjectId si está presente
    const updateData: any = { ...parsedData };
    if (updateData.categoryId) {
      const category = await CategoriesService.getCategoryById(updateData.categoryId);
      if (!category) {
        return res.status(400).json({ error: 'Category not found' });
      }
      // Convertir string a ObjectId
      updateData.categoryId = new mongoose.Types.ObjectId(updateData.categoryId);
    }
    
    const role = await CategoriesService.updateRole(req.params.id, updateData);
    
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    res.json(role);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteRole(req: Request, res: Response) {
  try {
    const success = await CategoriesService.deleteRole(req.params.id);
    
    if (!success) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    res.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Endpoint para validar roles
export async function validateRoles(req: Request, res: Response) {
  try {
    const { roleCodes } = req.body;
    
    if (!Array.isArray(roleCodes)) {
      return res.status(400).json({ error: 'roleCodes must be an array' });
    }
    
    const validation = await CategoriesService.validateRoleCodes(roleCodes);
    res.json(validation);
  } catch (error: any) {
    console.error('Error validating roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Endpoint para inicializar datos (solo para desarrollo)
export async function seedInitialData(req: Request, res: Response) {
  try {
    await CategoriesService.seedInitialData();
    res.json({ message: 'Initial data seeded successfully' });
  } catch (error: any) {
    console.error('Error seeding initial data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}