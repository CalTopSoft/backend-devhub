import mongoose, { Schema } from 'mongoose';

const AuditSchema = new Schema({
  action: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  details: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Audit', AuditSchema);