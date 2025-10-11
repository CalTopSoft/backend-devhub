// src/app.ts - VERSIÓN ACTUALIZADA
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
import uploadRoutes from './routes/upload.routes'; // NUEVA RUTA
import platformsRoutes from './routes/platforms.routes';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration - usar env en lugar de process.env directamente
const corsOptions = {
  origin: [
    env.FRONTEND_ORIGIN || 'http://localhost:3002',
    env.ADMIN_ORIGIN || 'http://localhost:3001',
    env.EXTRA_ORIGIN || 'http://127.0.0.1:3001'
  ].filter(Boolean), // Filtra valores falsy
  credentials: true
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000 // limit each IP to 2000 requests per windowMs
});
app.use(limiter);

// Body parsing - Aumentar límite para archivos base64
app.use(express.json({ limit: '50mb' })); // Aumentado de 10mb a 50mb
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
app.use('/api/upload', uploadRoutes); // NUEVA RUTA
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