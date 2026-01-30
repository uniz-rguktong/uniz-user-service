import { Router } from 'express';
import { getStudentProfile, updateStudentProfile, getAdminProfile, getFacultyProfile, searchStudents } from '../controllers/profile.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
// Needs generic validation middleware similar to auth service
// Creating a simple duplicate here for isolation as per rules
import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ErrorCode } from '@uniz-org/shared/dist/errors/error-codes';

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
    address: z.string().optional()
    // Add other fields as necessary from legacy schema
});

router.get('/student/me', authMiddleware, getStudentProfile);
router.put('/student/update', authMiddleware, validateRequest(StudentUpdateSchema), updateStudentProfile);
router.post('/student/search', authMiddleware, searchStudents);

router.get('/faculty/me', authMiddleware, getFacultyProfile);
router.get('/admin/me', authMiddleware, getAdminProfile);

export default router;
