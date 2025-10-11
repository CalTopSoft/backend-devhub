import { CronJob } from 'cron';
import { computeCompanyRankings } from '../services/ranking.service';
import { logger } from '../config/logger';

// Ejecutar a las 4:00 AM todos los días
const job = new CronJob('0 4 * * *', async () => {
  logger.info('Cron job triggered: Computing company rankings...');
  await computeCompanyRankings();
});

export function startCron() {
  job.start();
  logger.info('Cron job started (runs daily at 4:00 AM)');
}