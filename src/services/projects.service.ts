import Project from '../models/Project';

export async function getProjectsByFilters(filters: any) {
  return await Project.find(filters).populate('companyId');
}