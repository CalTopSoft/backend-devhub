// src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT || '8080',
  MONGO_URI: process.env.MONGO_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '',
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || '',
  EXTRA_ORIGIN: process.env.EXTRA_ORIGIN || '',
  
  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  
  // VirusTotal Configuration (NUEVO)
  VIRUSTOTAL_API_KEY: process.env.VIRUSTOTAL_API_KEY || '',
  
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '160000'),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '19000'),
  MAX_COMPANIES_PER_USER: parseInt(process.env.MAX_COMPANIES_PER_USER || '5'),
  MAX_ROLES_PER_MEMBER: parseInt(process.env.MAX_ROLES_PER_MEMBER || '3'),
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
};