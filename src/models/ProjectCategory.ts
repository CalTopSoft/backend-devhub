import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectCategory extends Document {
  name: string;
  description: string;
  code: string; // Código único para la categoría (ej: 'mobile', 'web', 'iot')
  icon: string; // Emoji o icono para la categoría
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectCategorySchema = new Schema<IProjectCategory>({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  icon: { type: String, default: '📁' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware para actualizar updatedAt
ProjectCategorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IProjectCategory>('ProjectCategory', ProjectCategorySchema);