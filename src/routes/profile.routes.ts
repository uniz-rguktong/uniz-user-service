import { Router } from 'express';
import { getStudentProfile, updateStudentProfile, getAdminProfile, getFacultyProfile, searchStudents, createFacultyProfile, updateStudentPresence, getBanners, createBanner, deleteBanner, publishBanner } from '../controllers/profile.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
// Needs generic validation middleware similar to auth service
// Creating a simple duplicate here for isolation as per rules
import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ErrorCode } from '../shared/error-codes';

const validateRequest = (schema: ZodSchema<any>) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ code: ErrorCode.VALIDATION_ERROR, errors: error.errors });
    }
    next(error);
  }
};

const router = Router();

// Zod schema for profile update (Partial)
const StudentUpdateSchema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    email: z.string().email().optional()
});

const FacultyCreateSchema = z.object({
    username: z.string(),
    name: z.string(),
    email: z.string().email(),
    department: z.string(),
    designation: z.string()
});


router.get('/student/me', authMiddleware, getStudentProfile);
router.put('/student/update', authMiddleware, validateRequest(StudentUpdateSchema), updateStudentProfile);
router.post('/student/search', authMiddleware, searchStudents);

router.get('/faculty/me', authMiddleware, getFacultyProfile);
router.post('/faculty/create', authMiddleware, validateRequest(FacultyCreateSchema), createFacultyProfile);
router.put('/student/status', authMiddleware, updateStudentPresence);

// Banner Routes
router.get('/admin/banners', authMiddleware, getBanners);
router.post('/admin/banners', authMiddleware, createBanner);
router.delete('/admin/banners/:id', authMiddleware, deleteBanner);
router.post('/admin/banners/:id/publish', authMiddleware, publishBanner);

router.get('/admin/me', authMiddleware, getAdminProfile);


export default router;
