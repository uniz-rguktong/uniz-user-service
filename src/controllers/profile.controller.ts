import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ErrorCode } from '../shared/error-codes';
import { UserRole } from '../shared/roles.enum';

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
    // Cache student profile at the edge for 1 minute
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
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
    const updated = await prisma.studentProfile.upsert({
        where: { username: user.username },
        update: updates,
        create: {
            id: user.id || user.username, // Fallback to username if ID missing (shouldn't happen with valid token)
            username: user.username,
            ...updates
        }
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

        // Cache search results for 1 minute
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        const [students, total] = await Promise.all([
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
    const adminRoles = [
        UserRole.WEBMASTER, 
        UserRole.DEAN, 
        UserRole.DIRECTOR, 
        UserRole.SWO,
        UserRole.WARDEN_MALE,
        UserRole.WARDEN_FEMALE,
        UserRole.CARETAKER_MALE,
        UserRole.CARETAKER_FEMALE,
        UserRole.SECURITY,
        UserRole.LIBRARIAN,
        // Legacy support
        UserRole.DSW, 
        UserRole.WARDEN, 
        UserRole.CARETAKER
    ];
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

export const createFacultyProfile = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const { username, name, email, department, designation } = req.body;

    // Admin role check
    const adminRoles = [UserRole.WEBMASTER, UserRole.DEAN, UserRole.DIRECTOR];
    if (!user || !adminRoles.includes(user.role as UserRole)) {
        return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
    }

    try {
        const profile = await prisma.facultyProfile.create({
            data: {
                id: username, // In transition username acts as ID
                username,
                name,
                email,
                department,
                designation,
                role: 'teacher'
            }
        });
        return res.status(201).json({ success: true, faculty: mapFacultyProfile(profile) });
    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Internal Server Error' });
    }
}
export const updateStudentPresence = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    const { username, isPresent } = req.body;

    const allowedRoles = [
        UserRole.WEBMASTER, 
        UserRole.DEAN, 
        UserRole.DIRECTOR, 
        UserRole.SWO,
        UserRole.WARDEN_MALE,
        UserRole.WARDEN_FEMALE,
        UserRole.CARETAKER_MALE,
        UserRole.CARETAKER_FEMALE,
        UserRole.SECURITY
    ];

    if (!user || !allowedRoles.includes(user.role as UserRole)) {
        return res.status(403).json({ code: ErrorCode.AUTH_FORBIDDEN, message: 'Access denied' });
    }

    try {
        const updated = await prisma.studentProfile.update({
            where: { username },
            data: { isPresentInCampus: isPresent }
        });
        return res.json({ success: true, student: mapStudentProfile(updated) });
    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Failed to update presence' });
    }
};

export const getBanners = async (req: Request, res: Response) => {
    try {
        // Banners are static, cache for 5 minutes
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1200');
        const banners = await prisma.banner.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ success: true, banners });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch banners' });
    }
};

export const createBanner = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || user.role !== UserRole.WEBMASTER) {
        return res.status(403).json({ success: false, message: 'Only webmaster can add banners' });
    }

    const { title, text, imageUrl } = req.body;
    try {
        const banner = await prisma.banner.create({
            data: { title, text, imageUrl, isPublished: true }
        });
        return res.json({ success: true, banner });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to create banner' });
    }
};

export const deleteBanner = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || user.role !== UserRole.WEBMASTER) {
        return res.status(403).json({ success: false, message: 'Denied' });
    }
    const { id } = req.params;
    try {
        await prisma.banner.delete({ where: { id } });
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};

export const publishBanner = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || user.role !== UserRole.WEBMASTER) {
        return res.status(403).json({ success: false });
    }
    const { id } = req.params;
    const { publish } = req.body;
    try {
        await prisma.banner.update({
            where: { id },
            data: { isPublished: publish }
        });
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};
