// src/controllers/platforms.controller.ts
import { Request, Response } from 'express';
import Platform from '../models/Platform';

// Devuelve SOLO los nombres, como espera tu frontend actual
export const getPlatforms = async (req: Request, res: Response) => {
  try {
    const platforms = await Platform.find({ isActive: true })
      .sort({ order: 1 })
      .select('name'); // Solo el campo 'name'

    // Extrae solo los nombres como array de strings
    const names = platforms.map(p => p.name);
    res.json(names);
  } catch (error) {
    console.error('Error fetching platform names:', error);
    res.status(500).json({ error: 'Error al obtener las plataformas' });
  }
};