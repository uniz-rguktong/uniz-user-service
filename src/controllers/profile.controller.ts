import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ErrorCode } from '@uniz-org/shared/dist/errors/error-codes';
import { UserRole } from '@uniz-org/shared/dist/auth/roles.enum';

const prisma = new PrismaClient();

const mapStudentProfile = (profile: any) => ({
    _id: profile.id,
    username: profile.username,
    name: profile.name,
    email: profile.email,
    gender: profile.gender,
    year: profile.year,
    branch: profile.branch,
    section: profile.section,
    roomno: profile.roomno,
    has_pending_requests: profile.isApplicationPending,
    is_in_campus: profile.isPresentInCampus,
    blood_group: profile.bloodGroup,
    phone_number: profile.phone,
    date_of_birth: profile.dateOfBirth,
    father_name: profile.fatherName,
    mother_name: profile.motherName,
    father_occupation: profile.fatherOccupation,
    mother_occupation: profile.motherOccupation,
    father_email: profile.fatherEmail,
    mother_email: profile.motherEmail,
    father_address: profile.fatherAddress,
    mother_address: profile.motherAddress,
    profile_url: profile.profileUrl,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt
});

const mapFacultyProfile = (profile: any) => ({
    id: profile.id,
    Username: profile.username,
    Name: profile.name,
    Email: profile.email,
    Department: profile.department,
    Designation: profile.designation,
    Role: profile.role,
    Contact: profile.contact,
    ProfileUrl: profile.profileUrl
});

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
    return res.json({ success: true, student: mapStudentProfile(profile) });
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
    return res.json({ success: true, student: mapStudentProfile(updated) });
  } catch (e) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to update profile' });
  }
};

export const searchStudents = async (req: AuthenticatedRequest, res: Response) => {
    const { username, branch, year, gender, page = 1, limit = 10 } = req.body;
    
    try {
        const skip = (Number(page) - 1) * Number(limit);
        const where: any = {};
        
        if (username) {
            where.OR = [
                { username: { contains: username, mode: 'insensitive' } },
                { name: { contains: username, mode: 'insensitive' } }
            ];
        }
        if (branch) where.branch = branch;
        if (year) where.year = year;
        if (gender) where.gender = gender;

        const [students, total] = await prisma.$transaction([
            prisma.studentProfile.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { username: 'asc' }
            }),
            prisma.studentProfile.count({ where })
        ]);

        return res.json({
            success: true,
            students: students.map(mapStudentProfile),
            pagination: {
                page: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                total
            }
        });
    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Search failed' });
    }
};

export const getFacultyProfile = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || (user.role !== UserRole.TEACHER && user.role !== UserRole.HOD)) {
        return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
    }
    
    try {
        const profile = await prisma.facultyProfile.findUnique({ where: { username: user.username } });
        if (!profile) return res.status(404).json({ code: ErrorCode.RESOURCE_NOT_FOUND, message: 'Profile not found' });
        return res.json({ success: true, faculty: mapFacultyProfile(profile) });
    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to fetch faculty profile' });
    }
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
