import expressRateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const rateLimit = expressRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: 'Demasiadas solicitudes, inténtelo de nuevo más tarde.',
});
