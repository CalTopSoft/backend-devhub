import mongoose, { Schema } from 'mongoose';
import User from './User';

const CompanySchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, maxlength: 200 },  // ← NUEVO: Para descripción opcional
  areas: [{ type: String, maxlength: 30 }],  // ← NUEVO: Array de áreas (categorías)
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, unique: true },
  members: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    roles: [{ type: String, max: 3 }],  // Asegura que roles sea array
  }],
  pendingRequests: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now },
    message: { type: String }
  }],
  photo: { type: String },
  isVerified: { type: Boolean, default: false },
  ranking: { type: Number, default: null },
  rankingScore: { type: Number, default: 0 }, // Se usa para ordenar, no se muestra
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt: { type: Date },
  deleteReason: { type: String },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

// Middleware para manejar eliminaciones directas desde la BD
CompanySchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany'], async function() {
  const company = await this.model.findOne(this.getQuery());
  if (company) {
    const memberIds = company.members
      .map((member: any) => member.userId)
      .filter((id: any) => id);

    // Actualizar companiesCount de todos los miembros
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $inc: { companiesCount: -1 } }
    );

    // Asegurar que ningún companiesCount sea negativo
    await User.updateMany(
      { companiesCount: { $lt: 0 } },
      { $set: { companiesCount: 0 } }
    );
  }
});

export default mongoose.model('Company', CompanySchema);