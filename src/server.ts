// src/server.ts
import app from './app';
import { connectDB } from './config/db';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

/**
 * Limpia archivos temporales huérfanos cada 6 horas
 */
function setupCleanupTask() {
  // Ejecutar cada 6 horas: '0 */6 * * *'
  cron.schedule('0 */6 * * *', async () => {
    console.log('[CLEANUP CRON] Iniciando limpieza de archivos huérfanos...');
    
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      // Verificar si existe
      try {
        await fs.access(uploadsDir);
      } catch {
        console.log('[CLEANUP CRON] No hay carpeta uploads para limpiar');
        return;
      }

      const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
      let cleaned = 0;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(uploadsDir, entry.name);
          const stats = await fs.stat(dirPath);
          
          // Eliminar carpetas de más de 24 horas
          const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
          
          if (ageHours > 24) {
            await fs.rm(dirPath, { recursive: true, force: true });
            cleaned++;
            console.log(`[CLEANUP CRON] Eliminada carpeta antigua: ${entry.name} (${ageHours.toFixed(1)}h)`);
          }
        }
      }

      console.log(`[CLEANUP CRON] Limpieza completada. ${cleaned} carpeta(s) eliminada(s)`);
      
    } catch (error) {
      console.error('[CLEANUP CRON] Error en limpieza:', error);
    }
  });

  console.log('[CLEANUP CRON] Tarea de limpieza programada (cada 6 horas)');
}

const PORT = process.env.PORT || 8080;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    // ✅ Iniciar la tarea de limpieza una vez que el servidor está arriba
    setupCleanupTask();
  });
});