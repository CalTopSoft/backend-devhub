import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function generateToken(userId: string, role: string) {
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, { expiresIn: '1h' });
}