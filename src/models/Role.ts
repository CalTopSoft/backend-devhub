import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description: string;
  code: string; // Código único para el rol (ej: 'frontend_dev', 'mobile_designer')
  categoryId: Schema.Types.ObjectId; // Referencia a ProjectCategory
  responsibilities: string[]; // Lista de responsabilidades del rol
  skills: string[]; // Habilidades requeridas
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'ProjectCategory', required: true },
  responsibilities: [{ type: String }],
  skills: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Índice compuesto para evitar duplicados de nombres por categoría
RoleSchema.index({ name: 1, categoryId: 1 }, { unique: true });

// Middleware para actualizar updatedAt
RoleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IRole>('Role', RoleSchema);