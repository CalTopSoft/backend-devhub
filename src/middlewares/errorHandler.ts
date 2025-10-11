import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error(err.message);
  res.status(500).json({ error: 'Internal server error' });
}