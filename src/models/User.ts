import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  photo?: string;
  career?: string;
  semester?: number;
  age?: number;
  contacts?: {
    whatsapp?: string;
    email?: string;
    outlook?: string;
    discord?: String;
    linkedin?: String;
  };
  companiesCount?: number;
  role?: 'user' | 'admin';
  // Campos para recuperación de contraseña
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  resetPasswordAttempts?: number;
  resetPasswordLastAttempt?: Date;
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  photo: { type: String },
  career: { type: String },
  semester: { type: Number },
  age: { type: Number },
  contacts: {
    whatsapp: String,
    email: String,
    outlook: String,
    discord: String,
    linkedin: String,
  },
  companiesCount: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  // Campos para recuperación de contraseña
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  resetPasswordAttempts: { type: Number, default: 0 },
  resetPasswordLastAttempt: { type: Date },
});

export default mongoose.model<IUser>('User', UserSchema);