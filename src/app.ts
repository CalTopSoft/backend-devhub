// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import companyRoutes from './routes/companies.routes';
import projectRoutes from './routes/projects.routes';
import reviewRoutes from './routes/reviews.routes';
import downloadsRoutes from './routes/downloads.routes';
import adminRoutes from './routes/admin.routes';
import categoriesRoutes from './routes/categories.routes';
import statsRoutes from './routes/stats.routes';
import notificationsRoutes from './routes/notifications.routes';
import uploadRoutes from './routes/upload.routes';
import platformsRoutes from './routes/platforms.routes';

const app = express();

/* ======================================================
   🔴 RENDER / PROXY CONFIG (OBLIGATORIO)
====================================================== */
app.set('trust proxy', 1);

/* ======================================================
   🔐 SECURITY
====================================================== */
app.use(helmet());

/* ======================================================
   🌍 CORS (PRODUCCIÓN + LOCAL)
   ❌ SIN credentials (GitHub Pages no usa cookies)
====================================================== */
app.use(
  cors({
    origin: [
      env.FRONTEND_ORIGIN || 'http://localhost:3002',
      env.ADMIN_ORIGIN || 'http://localhost:3001',
      env.EXTRA_ORIGIN || 'http://127.0.0.1:3001',
    ].filter(Boolean),
  })
);

/* ======================================================
   🧠 BODY PARSING
====================================================== */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* ======================================================
   ⚡ RATE LIMIT (DESPUÉS DE CORS)
====================================================== */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 2000, // límite por IP
});
app.use(limiter);

/* ======================================================
   🚀 ROUTES
====================================================== */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', statsRoutes);
app.use('/api/platforms', platformsRoutes);

/* ======================================================
   ❤️ HEALTH CHECK
====================================================== */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/* ======================================================
   ❗ ERROR HANDLER (SIEMPRE AL FINAL)
====================================================== */
app.use(errorHandler);

export default app;
