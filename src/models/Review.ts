import mongoose, { Schema } from 'mongoose';

const ReviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now },
});

ReviewSchema.index({ userId: 1, projectId: 1 }, { unique: true });

export default mongoose.model('Review', ReviewSchema);