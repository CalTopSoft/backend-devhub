import mongoose from 'mongoose';
import ProjectCategory, { IProjectCategory } from '../models/ProjectCategory';
import Role, { IRole } from '../models/Role';

export class CategoriesService {
  
  // Obtener todas las categorías activas
  async getCategories(): Promise<IProjectCategory[]> {
    return ProjectCategory.find({ isActive: true }).sort({ name: 1 });
  }

  // Obtener una categoría por ID
  async getCategoryById(id: string): Promise<IProjectCategory | null> {
    return ProjectCategory.findById(id);
  }

  // Obtener una categoría por código
  async getCategoryByCode(code: string): Promise<IProjectCategory | null> {
    return ProjectCategory.findOne({ code, isActive: true });
  }

  // Crear nueva categoría
  async createCategory(categoryData: {
    name: string;
    description: string;
    code: string;
    icon?: string;
  }): Promise<IProjectCategory> {
    const category = new ProjectCategory(categoryData);
    return category.save();
  }

  // Actualizar categoría
  async updateCategory(id: string, updateData: Partial<IProjectCategory>): Promise<IProjectCategory | null> {
    return ProjectCategory.findByIdAndUpdate(id, updateData, { new: true });
  }

  // Eliminar categoría (soft delete)
  async deleteCategory(id: string): Promise<boolean> {
    const result = await ProjectCategory.findByIdAndUpdate(id, { isActive: false });
    return !!result;
  }

  // Obtener todos los roles activos
  async getRoles(): Promise<IRole[]> {
    return Role.find({ isActive: true })
      .populate('categoryId', 'name code icon')
      .sort({ name: 1 });
  }

  // Obtener roles por categoría
  async getRolesByCategory(categoryId: string): Promise<IRole[]> {
    return Role.find({ categoryId, isActive: true }).sort({ name: 1 });
  }

  // Obtener roles por código de categoría
  async getRolesByCategoryCode(categoryCode: string): Promise<IRole[]> {
    const category = await this.getCategoryByCode(categoryCode);
    if (!category) return [];
    
    return this.getRolesByCategory(category._id.toString());
  }

  // Obtener un rol por ID
  async getRoleById(id: string): Promise<IRole | null> {
    return Role.findById(id).populate('categoryId', 'name code icon');
  }

  // Obtener rol por código
  async getRoleByCode(code: string): Promise<IRole | null> {
    return Role.findOne({ code, isActive: true }).populate('categoryId', 'name code icon');
  }

  // Crear nuevo rol
  async createRole(roleData: {
    name: string;
    description: string;
    code: string;
    categoryId: mongoose.Types.ObjectId | string;
    responsibilities?: string[];
    skills?: string[];
  }): Promise<IRole> {
    // Asegurar que categoryId sea ObjectId
    const processedData = {
      ...roleData,
      categoryId: typeof roleData.categoryId === 'string' 
        ? new mongoose.Types.ObjectId(roleData.categoryId)
        : roleData.categoryId
    };
    
    const role = new Role(processedData);
    return role.save();
  }

  // Actualizar rol
  async updateRole(id: string, updateData: Partial<IRole> & { categoryId?: mongoose.Types.ObjectId | string }): Promise<IRole | null> {
    // Si categoryId viene como string, convertirlo a ObjectId
    const processedData: any = { ...updateData };
    if (processedData.categoryId && typeof processedData.categoryId === 'string') {
      processedData.categoryId = new mongoose.Types.ObjectId(processedData.categoryId);
    }
    
    return Role.findByIdAndUpdate(id, processedData, { new: true })
      .populate('categoryId', 'name code icon');
  }

  // Eliminar rol (soft delete)
  async deleteRole(id: string): Promise<boolean> {
    const result = await Role.findByIdAndUpdate(id, { isActive: false });
    return !!result;
  }

  // Validar si los códigos de roles existen
  async validateRoleCodes(roleCodes: string[]): Promise<{ valid: boolean; invalidCodes: string[] }> {
    const validRoles = await Role.find({ 
      code: { $in: roleCodes }, 
      isActive: true 
    }).select('code');
    
    const validCodes = validRoles.map(role => role.code);
    const invalidCodes = roleCodes.filter(code => !validCodes.includes(code));
    
    return {
      valid: invalidCodes.length === 0,
      invalidCodes
    };
  }

  // Obtener estructura completa (categorías con sus roles)
  async getCategoriesWithRoles(): Promise<any[]> {
    const categories = await this.getCategories();
    
    const categoriesWithRoles = await Promise.all(
      categories.map(async (category) => {
        const roles = await this.getRolesByCategory(category._id.toString());
        return {
          ...category.toObject(),
          roles
        };
      })
    );

    return categoriesWithRoles;
  }

  // Seed inicial - crear datos por defecto
  async seedInitialData(): Promise<void> {
    // Verificar si ya existe data
    const existingCategories = await ProjectCategory.countDocuments();
    if (existingCategories > 0) {
      console.log('Categories already exist, skipping seed');
      return;
    }

    console.log('Seeding initial categories and roles...');

    // Crear categorías
    const categories = await Promise.all([
      this.createCategory({
        name: 'Desarrollo Web',
        description: 'Aplicaciones y sitios web',
        code: 'web',
        icon: '🌐'
      }),
      this.createCategory({
        name: 'Desarrollo Mobile',
        description: 'Aplicaciones móviles Android e iOS',
        code: 'mobile',
        icon: '📱'
      }),
      this.createCategory({
        name: 'IoT y Arduino',
        description: 'Internet de las cosas y sistemas embebidos',
        code: 'iot',
        icon: '🤖'
      }),
      this.createCategory({
        name: 'Inteligencia Artificial',
        description: 'Machine Learning, Deep Learning y AI',
        code: 'ai',
        icon: '🧠'
      }),
      this.createCategory({
        name: 'Desarrollo de Juegos',
        description: 'Videojuegos y aplicaciones interactivas',
        code: 'games',
        icon: '🎮'
      }),
      this.createCategory({
        name: 'DevOps y Cloud',
        description: 'Infraestructura, despliegue y operaciones',
        code: 'devops',
        icon: '☁️'
      })
    ]);

    // Crear roles para cada categoría
    const rolesByCategory = {
      'web': [
        { name: 'Frontend Developer', code: 'frontend_dev', description: 'Desarrollo de interfaces de usuario' },
        { name: 'Backend Developer', code: 'backend_dev', description: 'Desarrollo de APIs y lógica de servidor' },
        { name: 'Fullstack Developer', code: 'fullstack_dev', description: 'Desarrollo completo front y back' },
        { name: 'UI/UX Designer', code: 'web_designer', description: 'Diseño de experiencia e interfaces' },
        { name: 'QA Tester', code: 'web_tester', description: 'Pruebas y control de calidad' }
      ],
      'mobile': [
        { name: 'Android Developer', code: 'android_dev', description: 'Desarrollo de aplicaciones Android' },
        { name: 'iOS Developer', code: 'ios_dev', description: 'Desarrollo de aplicaciones iOS' },
        { name: 'React Native Developer', code: 'rn_dev', description: 'Desarrollo multiplataforma con React Native' },
        { name: 'Flutter Developer', code: 'flutter_dev', description: 'Desarrollo multiplataforma con Flutter' },
        { name: 'Mobile Designer', code: 'mobile_designer', description: 'Diseño de interfaces móviles' },
        { name: 'Mobile Tester', code: 'mobile_tester', description: 'Pruebas en dispositivos móviles' }
      ],
      'iot': [
        { name: 'Embedded Developer', code: 'embedded_dev', description: 'Desarrollo de sistemas embebidos' },
        { name: 'Hardware Engineer', code: 'hardware_eng', description: 'Diseño de circuitos y hardware' },
        { name: 'Firmware Developer', code: 'firmware_dev', description: 'Programación de microcontroladores' },
        { name: 'IoT Architect', code: 'iot_architect', description: 'Arquitectura de soluciones IoT' }
      ],
      'ai': [
        { name: 'ML Engineer', code: 'ml_engineer', description: 'Ingeniería de Machine Learning' },
        { name: 'Data Scientist', code: 'data_scientist', description: 'Análisis y ciencia de datos' },
        { name: 'AI Researcher', code: 'ai_researcher', description: 'Investigación en inteligencia artificial' },
        { name: 'Computer Vision Engineer', code: 'cv_engineer', description: 'Visión por computadora' }
      ],
      'games': [
        { name: 'Game Developer', code: 'game_dev', description: 'Programación de videojuegos' },
        { name: 'Game Designer', code: 'game_designer', description: 'Diseño de mecánicas y gameplay' },
        { name: 'Game Artist', code: 'game_artist', description: 'Arte y gráficos para juegos' },
        { name: '3D Modeler', code: '3d_modeler', description: 'Modelado 3D para juegos' }
      ],
      'devops': [
        { name: 'DevOps Engineer', code: 'devops_engineer', description: 'Automatización y despliegue' },
        { name: 'Cloud Architect', code: 'cloud_architect', description: 'Arquitectura en la nube' },
        { name: 'SRE Engineer', code: 'sre_engineer', description: 'Site Reliability Engineering' },
        { name: 'Security Engineer', code: 'security_engineer', description: 'Seguridad en infraestructura' }
      ]
    };

    // Crear todos los roles
    for (const category of categories) {
      const categoryRoles = rolesByCategory[category.code as keyof typeof rolesByCategory];
      if (categoryRoles) {
        await Promise.all(
          categoryRoles.map(roleData => 
            this.createRole({
              ...roleData,
              categoryId: category._id.toString()
            })
          )
        );
      }
    }

    console.log('Initial categories and roles seeded successfully!');
  }
}

export default new CategoriesService();