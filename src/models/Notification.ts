import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'project_status' | 'project_feedback' | 'project_warning' | 'project_deleted' | 'project_update' | 'general' | 'company_invitation';
  title: string;
  message: string;
  projectId?: mongoose.Types.ObjectId;
  data?: {
    projectTitle?: string;
    projectId?: string; // ✅ AGREGAR ESTO
    oldStatus?: string;
    newStatus?: string;
    feedbackType?: 'edit_request' | 'rejection' | 'warning' | 'deletion';
    reasons?: string[];
    customMessage?: string;
    feedback?: string; // ✅ AGREGAR ESTO para el feedback del draft
    adminName?: string;
    companyName?: string;
    action?: 'accepted' | 'rejected';
  };
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionRequired?: boolean;
  expiresAt?: Date;
  createdAt: Date;
  readAt?: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    enum: ['project_status', 'project_feedback', 'project_warning', 'project_deleted', 'project_update', 'general', 'company_invitation'],
    required: true,
    default: 'general'
  },
  title: { 
    type: String, 
    required: true,
    maxlength: 100
  },
  message: { 
    type: String, 
    required: true,
    maxlength: 500
  },
  projectId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Project',
    index: true
  },
  data: {
    projectTitle: { type: String },
    projectId: { type: String }, // ✅ AGREGAR ESTO
    oldStatus: { type: String },
    newStatus: { type: String },
    feedbackType: { 
      type: String, 
      enum: ['edit_request', 'rejection', 'warning', 'deletion']
    },
    reasons: [{ type: String }],
    customMessage: { type: String, maxlength: 1000 },
    feedback: { type: String, maxlength: 1000 }, // ✅ AGREGAR ESTO
    adminName: { type: String },
    companyName: { type: String },
    action: { type: String, enum: ['accepted', 'rejected'] }
  },
  read: { 
    type: Boolean, 
    default: false,
    index: true
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  actionRequired: { 
    type: Boolean, 
    default: false 
  },
  expiresAt: { 
    type: Date,
    index: { expireAfterSeconds: 0 }
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  readAt: { type: Date }
});

// Índices compuestos para optimizar consultas
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, priority: 1, createdAt: -1 });

// Middleware para actualizar readAt automáticamente
NotificationSchema.pre('save', function(next) {
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  next();
});

export default mongoose.model<INotification>('Notification', NotificationSchema);