import { Request, Response } from 'express';
import Review from '../models/Review';
import Project from '../models/Project';
import { z } from 'zod';

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

// Helper function para manejar errores
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

export async function createReview(req: Request, res: Response) {
  try {
    // Verificar autenticación al principio
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { rating, comment } = reviewSchema.parse(req.body);
    const project = await Project.findById(req.params.projectId);
    if (!project || project.status !== 'published') {
      return res.status(403).json({ error: 'Cannot review unpublished project' });
    }

    // Declaramos la variable aquí
    let review;

    const existingReview = await Review.findOne({ userId: req.user.id, projectId: req.params.projectId });
    if (existingReview) {
      existingReview.rating = rating;
      existingReview.comment = comment;
      await existingReview.save();
      review = existingReview;
    } else {
      review = new Review({
        userId: req.user.id,
        projectId: req.params.projectId,
        rating,
        comment,
      });
      await review.save();
      project.ratingCount += 1;
    }

    const reviews = await Review.find({ projectId: req.params.projectId });
    project.ratingAvg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await project.save();

    res.json(review);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
  }
}

export async function getReviews(req: Request, res: Response) {
  try {
    const reviews = await Review.find({ projectId: req.params.projectId }).populate('userId');
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
}