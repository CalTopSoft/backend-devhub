import { Request, Response } from 'express';
import Project from '../models/Project';
import User from '../models/User';
import Company from '../models/Company';

type ProjectStatus = 'pending' | 'needs_author_review' | 'published' | 'rejected';

interface ProjectStat {
  _id: ProjectStatus;
  count: number;
}

export async function getStats(req: Request, res: Response) {
  try {
    const [projectStats, userCount, projectCount, companyCount] = await Promise.all([
      Project.aggregate<ProjectStat>([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      User.countDocuments(),
      Project.countDocuments(),
      Company.countDocuments()
    ]);

    const projectsByStatus: Record<ProjectStatus, number> = {
      pending: 0,
      needs_author_review: 0,
      published: 0,
      rejected: 0
    };

    projectStats.forEach(project => {
      if (project._id in projectsByStatus) {
        projectsByStatus[project._id] = project.count;
      }
    });

    res.status(200).json({
      users: userCount,
      projects: projectCount,
      companies: companyCount,
      projectsByStatus
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
}