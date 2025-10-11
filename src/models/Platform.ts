// src/models/Platform.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IPlatform extends Document {
  name: string; // 'Android', 'iOS', 'Windows', etc.
  description: string;
  code: string; // Código único para la plataforma (ej: 'android', 'ios')
  icon: string; // Emoji o icono para la plataforma
  isActive: boolean;
  order: number; // Para ordenar las plataformas en el frontend
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSchema = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web'] // Mantiene compatibilidad con el enum actual
  },
  description: { type: String, required: true },
  code: { 
    type: String, 
    required: true, 
    unique: true 
  },
  icon: { type: String, default: '📱' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware para actualizar updatedAt
PlatformSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IPlatform>('Platform', PlatformSchema);