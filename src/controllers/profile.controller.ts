import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ErrorCode } from '@uniz-org/shared/dist/errors/error-codes';
import { UserRole } from '@uniz-org/shared/dist/auth/roles.enum';

const prisma = new PrismaClient();

export const getStudentProfile = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user || user.role !== UserRole.STUDENT) {
     return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
  }

  try {
    const profile = await prisma.studentProfile.findUnique({ where: { username: user.username } });
    if (!profile) {
        return res.status(404).json({ code: ErrorCode.RESOURCE_NOT_FOUND, message: 'Profile not found' });
    }
    return res.json({ success: true, data: profile });
  } catch (e) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to fetch profile' });
  }
};

export const updateStudentProfile = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const updates = req.body; // Validation middleware should handle shape
  
  if (!user || user.role !== UserRole.STUDENT) {
      return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
  }

  try {
    const updated = await prisma.studentProfile.update({
        where: { username: user.username },
        data: updates
    });
    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to update profile' });
  }
};

export const getFacultyProfile = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.HOD)) {
        return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
    }
    // Implementation for faculty...
    return res.json({ success: true, message: 'Faculty profile implementation pending phase completion' });
};

export const getAdminProfile = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    // Check if role is any admin role
    const adminRoles = [UserRole.WEBMASTER, UserRole.DEAN, UserRole.DIRECTOR, UserRole.DSW, UserRole.WARDEN, UserRole.CARETAKER, UserRole.SECURITY];
    if (!user || !adminRoles.includes(user.role as UserRole)) {
        return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
    }
    
    try {
        const profile = await prisma.adminProfile.findUnique({ where: { username: user.username } });
        return res.json({ success: true, data: profile });
    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to fetch admin profile' });
    }
};
