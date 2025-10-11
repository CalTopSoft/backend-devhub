import User from '../models/User';

export async function getUserById(id: string) {
  return await User.findById(id).select('-passwordHash');
}