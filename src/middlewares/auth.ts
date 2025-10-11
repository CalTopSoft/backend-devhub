// src/middlewares/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import User from '../models/User';

interface JwtPayload {
  id: string;
  email: string;
  role: string;
  [key: string]: any;
}

export function authMiddleware(roles: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      
      // Buscar el usuario completo en la base de datos para tener todos sus datos
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Crear un objeto simple con los datos necesarios
      req.user = {
        id: user._id.toString(),
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        photo: user.photo,
        career: user.career,
        semester: user.semester,
        age: user.age,
        contacts: user.contacts,
        companiesCount: user.companiesCount
      };
      
      if (roles.length && !roles.includes(user.role || 'user')) {
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// Middleware específicos para roles
export const requireAdmin = authMiddleware(['admin']);
export const requireUser = authMiddleware(['user', 'admin']);