import User, { IUser } from '../models/User';
import Company from '../models/Company';
import Project from '../models/Project';
import Review from '../models/Review';
import Audit from '../models/Audit';
import Notification from '../models/Notification';
import ProjectCategory from '../models/ProjectCategory';
import Role from '../models/Role';
import Platform from '../models/Platform'; // ← NUEVO

export async function exportBackup(collections: string[] = [
  'users', 
  'companies', 
  'projects', 
  'reviews', 
  'audits', 
  'notifications', 
  'projectcategories', 
  'roles',
  'platforms' // ← NUEVO
]) {
  const backup: { [key: string]: any } = {};
  let totalSize = 0;

  // Mapa de colecciones a modelos
  const collectionMap: { [key: string]: any } = {
    users: User,
    companies: Company,
    projects: Project,
    reviews: Review,
    audits: Audit,
    notifications: Notification,
    projectcategories: ProjectCategory,
    roles: Role,
    platforms: Platform, // ← NUEVO
  };

  // Obtener datos de las colecciones seleccionadas
  for (const collection of collections) {
    if (collectionMap[collection]) {
      const data = await collectionMap[collection].find().lean();
      backup[collection] = data;
      // Calcular tamaño aproximado en bytes (serializado como JSON)
      const size = Buffer.byteLength(JSON.stringify(backup[collection]), 'utf8');
      totalSize += size;
    }
  }

  return {
    data: backup,
    size: totalSize, // Tamaño en bytes
  };
}

export async function importBackup(backupData: { [key: string]: any }) {
  const collectionMap: { [key: string]: any } = {
    users: User,
    companies: Company,
    projects: Project,
    reviews: Review,
    audits: Audit,
    notifications: Notification,
    projectcategories: ProjectCategory,
    roles: Role,
    platforms: Platform, // ← NUEVO
  };

  for (const [collection, data] of Object.entries(backupData)) {
    if (collectionMap[collection] && Array.isArray(data)) {
      // Eliminar datos existentes en la colección
      await collectionMap[collection].deleteMany({});
      // Insertar nuevos datos
      await collectionMap[collection].insertMany(data);
    }
  }

  return { message: 'Backup restaurado exitosamente' };
}