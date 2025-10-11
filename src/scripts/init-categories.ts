import mongoose from 'mongoose';
import { env } from '../config/env';
import CategoriesService from '../services/categories.service';

async function initializeCategories() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(env.MONGO_URI);
    
    console.log('Initializing categories and roles...');
    await CategoriesService.seedInitialData();
    
    console.log('Categories and roles initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing categories:', error);
    process.exit(1);
  }
}

// Solo ejecutar si se llama directamente
if (require.main === module) {
  initializeCategories();
}

export default initializeCategories;