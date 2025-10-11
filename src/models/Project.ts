// src/models/Project.ts
import mongoose, { Schema, Document } from 'mongoose';

// Interface para archivos
interface ProjectFile {
  type: 'cloudinary' | 'external';
  url: string;
  publicId?: string;
  fileName?: string;
  virusScan?: {
    isSafe: boolean;
    scanId: string;
    scannedAt: Date;
    threats?: string[];
  };
}

// ✅ NUEVO: Interface para cambios propuestos en el borrador
interface DraftChanges {
  title?: string;
  shortDesc?: string;
  longDesc?: string;
  iconPublicId?: string;
  iconUrl?: string;
  imagePublicIds?: string[];
  imageUrls?: string[];
  files?: {
    app?: {
      type: 'external';
      url: string;
      fileName?: string;
    };
    code?: {
      type: 'cloudinary';
      publicId: string;
      url: string;
      fileName: string;
      virusScan?: {
        isSafe: boolean;
        scanId: string;
        scannedAt: Date;
        threats?: string[];
      };
    };
    docPdf?: {
      type: 'cloudinary';
      publicId: string;
      url: string;
      fileName: string;
      virusScan?: {
        isSafe: boolean;
        scanId: string;
        scannedAt: Date;
        threats?: string[];
      };
    };
  };
}

export interface IProject extends Document {
  likes: number;
  likedBy: mongoose.Types.ObjectId[];
  title: string;
  slug: string;
  shortDesc: string;
  longDesc: string;
  categories: string[];
  platforms: ('Android' | 'iOS' | 'Windows' | 'Linux' | 'macOS' | 'Web')[];
  iconPublicId?: string;
  iconUrl?: string;
  imagePublicIds?: string[];
  imageUrls?: string[];
  
  companyId?: mongoose.Types.ObjectId;
  originalCompanyId?: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  canCreateProjects?: mongoose.Types.ObjectId[];
  isOrphan: boolean;
  isFromInactiveCompany: boolean;
  inactiveMembers?: mongoose.Types.ObjectId[];
  
  files?: {
    app?: {
      type: 'external';
      url: string;
      fileName?: string;
    };
    code?: {
      type: 'cloudinary';
      publicId: string;
      url: string;
      fileName?: string;
      virusScan?: {
        isSafe: boolean;
        scanId: string;
        scannedAt: Date;
        threats?: string[];
      };
    };
    docPdf?: {
      type: 'cloudinary';
      publicId: string;
      url: string;
      fileName?: string;
      virusScan?: {
        isSafe: boolean;
        scanId: string;
        scannedAt: Date;
        threats?: string[];
      };
    };
  };
  
  status: 'pending' | 'needs_author_review' | 'published' | 'rejected';
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;

  // ✅ NUEVO: Sistema de borradores para proyectos publicados
  draftStatus: 'none' | 'pending' | 'rejected';
  draft?: DraftChanges;
  draftSubmittedAt?: Date;
  draftFeedback?: string;
  draftRejectedAt?: Date;

  areFilesSafe(): boolean;
  getUnsafeFiles(): Array<{type: string, threats: string[]}>;
  hasPendingDraft(): boolean;
  applyDraft(): void;
  clearDraft(): void;
}

const ProjectSchema = new Schema<IProject>({
  title: { type: String, required: true },
  slug: { type: String, unique: true, required: true },
  shortDesc: { type: String, required: true },
  longDesc: { type: String, required: true },
  categories: [{ type: String }],
  platforms: [{ type: String, enum: ['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web'] }],
  
  iconPublicId: { type: String },
  iconUrl: { type: String },
  imagePublicIds: [{ type: String, max: 5 }],
  imageUrls: [{ type: String, max: 5 }],
  
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  originalCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  canCreateProjects: [{ type: Schema.Types.ObjectId, ref: 'User', max: 2 }],
  isOrphan: { type: Boolean, default: false },
  isFromInactiveCompany: { type: Boolean, default: false },
  inactiveMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  files: {
    app: {
      type: { type: String, enum: ['external'] },
      url: String,
      fileName: String
    },
    code: {
      type: { type: String, enum: ['cloudinary'] },
      publicId: String,
      url: String,
      fileName: String,
      virusScan: {
        isSafe: Boolean,
        scanId: String,
        scannedAt: Date,
        threats: [String]
      }
    },
    docPdf: {
      type: { type: String, enum: ['cloudinary'] },
      publicId: String,
      url: String,
      fileName: String,
      virusScan: {
        isSafe: Boolean,
        scanId: String,
        scannedAt: Date,
        threats: [String]
      }
    }
  },
  
  status: { 
    type: String, 
    enum: ['pending', 'needs_author_review', 'published', 'rejected'], 
    default: 'pending' 
  },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date },

  // ✅ NUEVO: Campos para sistema de borradores
  draftStatus: { 
    type: String, 
    enum: ['none', 'pending', 'rejected'], 
    default: 'none' 
  },
  draft: {
    title: String,
    shortDesc: String,
    longDesc: String,
    iconPublicId: String,
    iconUrl: String,
    imagePublicIds: [String],
    imageUrls: [String],
    files: {
      app: {
        type: { type: String, enum: ['external'] },
        url: String,
        fileName: String
      },
      code: {
        type: { type: String, enum: ['cloudinary'] },
        publicId: String,
        url: String,
        fileName: String,
        virusScan: {
          isSafe: Boolean,
          scanId: String,
          scannedAt: Date,
          threats: [String]
        }
      },
      docPdf: {
        type: { type: String, enum: ['cloudinary'] },
        publicId: String,
        url: String,
        fileName: String,
        virusScan: {
          isSafe: Boolean,
          scanId: String,
          scannedAt: Date,
          threats: [String]
        }
      }
    }
  },
  draftSubmittedAt: { type: Date },
  draftFeedback: { type: String },
  draftRejectedAt: { type: Date },

  likes: { type: Number, default: 0 },
  likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }]
});

// Middleware para actualizar updatedAt
ProjectSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Índices
ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ companyId: 1, status: 1 });
ProjectSchema.index({ categories: 1, status: 1 });
ProjectSchema.index({ platforms: 1, status: 1 });
ProjectSchema.index({ title: 'text', shortDesc: 'text', longDesc: 'text' });
ProjectSchema.index({ draftStatus: 1, status: 1 }); // ✅ NUEVO: Para consultas de borradores

// Método para verificar si archivos están seguros
ProjectSchema.methods.areFilesSafe = function(): boolean {
  const files = this.files;
  if (!files) return true;
  
  if (files.code && files.code.virusScan && !files.code.virusScan.isSafe) return false;
  if (files.docPdf && files.docPdf.virusScan && !files.docPdf.virusScan.isSafe) return false;
  
  return true;
};

// Método para obtener archivos inseguros
ProjectSchema.methods.getUnsafeFiles = function(): Array<{type: string, threats: string[]}> {
  const files = this.files;
  if (!files) return [];
  
  const unsafeFiles: Array<{type: string, threats: string[]}> = [];
  
  if (files.code && files.code.virusScan && !files.code.virusScan.isSafe) {
    unsafeFiles.push({
      type: 'code',
      threats: files.code.virusScan.threats || []
    });
  }
  
  if (files.docPdf && files.docPdf.virusScan && !files.docPdf.virusScan.isSafe) {
    unsafeFiles.push({
      type: 'docPdf',
      threats: files.docPdf.virusScan.threats || []
    });
  }
  
  return unsafeFiles;
};

// ✅ NUEVO: Método para verificar si tiene borrador pendiente
ProjectSchema.methods.hasPendingDraft = function(): boolean {
  return this.draftStatus === 'pending' && this.draft !== undefined && this.draft !== null;
};

// ✅ NUEVO: Método para aplicar cambios del borrador
ProjectSchema.methods.applyDraft = function(): void {
  if (!this.draft) return;
  
  // Aplicar SOLO los campos que existen en el borrador
  if (this.draft.title !== undefined) this.title = this.draft.title;
  if (this.draft.shortDesc !== undefined) this.shortDesc = this.draft.shortDesc;
  if (this.draft.longDesc !== undefined) this.longDesc = this.draft.longDesc;
  if (this.draft.iconPublicId !== undefined) this.iconPublicId = this.draft.iconPublicId;
  if (this.draft.iconUrl !== undefined) this.iconUrl = this.draft.iconUrl;
  
  // 🔥 FIX: SOLO actualizar imágenes si vienen EXPLÍCITAMENTE en el borrador
  // (no si están vacías porque el usuario no las subió)
  if (this.draft.imagePublicIds !== undefined && this.draft.imagePublicIds.length > 0) {
    this.imagePublicIds = this.draft.imagePublicIds;
  }
  if (this.draft.imageUrls !== undefined && this.draft.imageUrls.length > 0) {
    this.imageUrls = this.draft.imageUrls;
  }
  
  // Aplicar archivos (solo los que están en el borrador)
  if (this.draft.files) {
    this.files = this.files || {};
    if (this.draft.files.app !== undefined) this.files.app = this.draft.files.app;
    if (this.draft.files.code !== undefined) this.files.code = this.draft.files.code;
    if (this.draft.files.docPdf !== undefined) this.files.docPdf = this.draft.files.docPdf;
  }
};

// ✅ NUEVO: Método para limpiar borrador
ProjectSchema.methods.clearDraft = function(): void {
  this.draft = undefined;
  this.draftStatus = 'none';
  this.draftSubmittedAt = undefined;
  this.draftFeedback = undefined;
  this.draftRejectedAt = undefined;
};

export default mongoose.model<IProject>('Project', ProjectSchema);