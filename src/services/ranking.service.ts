import Company from '../models/Company';
import Project from '../models/Project';
import { logger } from '../config/logger';

export async function computeCompanyRankings() {
  try {
    logger.info('Starting company rankings computation...');
    
    // Obtener todas las empresas activas
    const companies = await Company.find({ status: 'active' });
    
    const companiesWithScores = await Promise.all(
      companies.map(async (company) => {
        // Obtener proyectos de la empresa
        const projects = await Project.find({
          companyId: company._id,
          status: 'published',
          isFromInactiveCompany: false
        });
        
        // Calcular score
        let totalLikes = 0;
        let totalRating = 0;
        const projectCount = projects.length;
        
        projects.forEach(project => {
          totalLikes += project.likes || 0;
          totalRating += project.ratingAvg || 0;
        });
        
        const avgRating = projectCount > 0 ? totalRating / projectCount : 0;
        const avgLikes = projectCount > 0 ? totalLikes / projectCount : 0;
        
        // FÓRMULA: (promedio_likes * 0.6) + (promedio_rating * 0.3) + (cantidad_proyectos * 0.1)
        const rankingScore = (avgLikes * 0.6) + (avgRating * 0.3) + (projectCount * 0.1);
        
        return {
          companyId: company._id,
          rankingScore,
          stats: { projectCount, totalLikes, avgRating, avgLikes }
        };
      })
    );
    
    // Ordenar por score descendente
    companiesWithScores.sort((a, b) => b.rankingScore - a.rankingScore);
    
    // Asignar ranking (1-30) y actualizar en BD
    const bulk = Company.collection.initializeUnorderedBulkOp();
    
    companiesWithScores.forEach((item, index) => {
      const ranking = index < 30 ? index + 1 : null; // Top 30
      bulk.find({ _id: item.companyId }).updateOne({
        $set: {
          ranking: ranking,
          rankingScore: item.rankingScore
        }
      });
    });
    
    if (companiesWithScores.length > 0) {
      await bulk.execute();
      logger.info(`Rankings updated: ${companiesWithScores.length} companies processed`);
    }
    
  } catch (error) {
    logger.error('Error computing rankings:', error);
  }
}