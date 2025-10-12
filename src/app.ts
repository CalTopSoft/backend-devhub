// src/app.ts - CORS CORREGIDO
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

// Security middleware
app.use(helmet());

// CORS configuration - AHORA CORRECTO
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Lista de orígenes permitidos (sin paths - CORS usa solo origin, no path)
    const allowedOrigins = [
      'http://localhost:3002',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'https://caltopsoft.github.io',  // ✅ GitHub Pages - sin /DevHub ni /DevHubAdmin
      env.FRONTEND_ORIGIN || null,
      env.ADMIN_ORIGIN || null,
      env.EXTRA_ORIGIN || null
    ].filter(Boolean);

    console.log(`CORS Request origen: ${origin}`);

    // Si no hay origin (requests desde línea de comandos, etc), permitir
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS bloqueado para origen: ${origin}`);
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 3600
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

export default app;
