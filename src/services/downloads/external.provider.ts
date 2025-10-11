import { Response } from 'express';
import fetch from 'node-fetch';
import { logger } from '../../config/logger';

// Helper function para manejar errores
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}

export async function streamExternal(url: string, res: Response) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error('Invalid external URL');
    }
    const stream = await fetch(url);
    if (!stream.body) {
      throw new Error('No response body available');
    }
    stream.body.pipe(res);
  } catch (error) {
    logger.error(`External download error: ${getErrorMessage(error)}`);
    res.status(503).json({ error: 'Descarga no disponible. Por favor, notifica el error.' });
  }
}