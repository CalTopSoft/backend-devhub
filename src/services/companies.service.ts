import Company from '../models/Company';
import mongoose from 'mongoose';

export async function getCompanyById(id: string) {
  return await Company.findById(id).populate('members.userId');
}

export async function listCompanies() {
  return await Company.find({ status: 'active' })
    .populate({
      path: 'ownerId',
      select: 'username email career semester age contacts role',
    })
    .populate({
      path: 'members.userId',
      select: 'username email career semester age contacts role',
    });
}

export async function updateCompany(id: string, data: { name?: string; photo?: string; newOwnerId?: string }) {
  const company = await Company.findById(id);
  if (!company) throw new Error('Company not found');

  if (data.name) company.name = data.name;
  if (data.photo !== undefined) company.photo = data.photo;
  if (data.newOwnerId) {
    const isMember = company.members.some((m) => m.userId?.toString() === data.newOwnerId);
    if (!isMember) throw new Error('New owner must be a member of the company');

    const currentOwner = company.members.find((m) => m.userId?.toString() === company.ownerId.toString());
    if (currentOwner) {
      currentOwner.roles = currentOwner.roles.filter((role) => role !== 'Owner');
    }

    const newOwnerMember = company.members.find((m) => m.userId?.toString() === data.newOwnerId);
    if (newOwnerMember) {
      newOwnerMember.roles = [...new Set([...newOwnerMember.roles, 'Owner'])];
    }

    company.ownerId = new mongoose.Types.ObjectId(data.newOwnerId);
  }

  await company.save();
  return await Company.findById(id)
    .populate({
      path: 'ownerId',
      select: 'username email career semester age contacts role',
    })
    .populate({
      path: 'members.userId',
      select: 'username email career semester age contacts role',
    });
}