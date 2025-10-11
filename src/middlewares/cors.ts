import cors from 'cors';
import { env } from '../config/env';

export const corsOptions = cors({
  origin: [env.FRONTEND_ORIGIN, env.ADMIN_ORIGIN],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});