import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import * as XLSX from "xlsx";
import axios from "axios";
import { UserRole } from "../shared/roles.enum";

const prisma = new PrismaClient();
const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "https://uniz-auth.vercel.app";

// Helper for Excel generation
const generateExcel = (
  headers: string[][],
  filename: string,
  res: Response,
) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(headers);
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename=${filename}.xlsx`);
  return res.send(buf);
};

export const getStudentsTemplate = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  // Columns: Student ID, Name, Email, Gender (M/F), Branch, Year, Section, Phone
  const headers = [
    [
      "Student ID",
      "Name",
      "Email",
      "Gender",
      "Branch",
      "Year",
      "Section",
      "Phone",
    ],
    [
      "O210000",
      "ExampleStudent",
      "o210000@rguktong.ac.in",
      "Male",
      "CSE",
      "E1",
      "A",
      "9876543210",
    ],
  ];
  return generateExcel(headers, "Student_Upload_Template", res);
};

export const uploadStudents = async (req: any, res: Response) => {
  const user = req.user;
  if (!user || user.role === UserRole.STUDENT) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "Excel file required" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let authCreatedCount = 0;
    const errors: any[] = [];

    console.log(`Starting student upload: ${rows.length} rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Normalize keys
      const getVal = (keys: string[]) => {
        const found = Object.keys(row).find((k) =>
          keys.includes(k.trim().toLowerCase()),
        );
        return found ? String(row[found]).trim() : "";
      };

      const id = getVal(["student id", "studentid", "id", "username"]);
      const name = getVal(["name", "student name"]);
      const email = getVal(["email", "mail"]);
      const gender = getVal(["gender", "sex"]);
      const branch = getVal(["branch", "department"]);
      const year = getVal(["year", "class"]);
      const section = getVal(["section", "sec"]);
      const phone = getVal(["phone", "mobile"]);

      if (!id) {
        errors.push({ row: i + 2, error: "Missing Student ID" });
        continue;
      }

      // 1. Upsert Profile
      try {
        await prisma.studentProfile.upsert({
          where: { username: id },
          update: {
            name,
            email,
            gender,
            branch,
            year,
            section,
            phone,
            updatedAt: new Date(),
          },
          create: {
            id,
            username: id,
            name,
            email,
            gender,
            branch,
            year,
            section,
            phone,
          },
        });
        successCount++;

        // 2. Create Auth Credential (if needed)
        // We call the Auth Service generic signup.
        // Default Password = ID (or a secure default)
        try {
          await axios.post(`${AUTH_SERVICE_URL}/api/v1/auth/signup`, {
            username: id,
            password: id, // Default password is ID
            role: "student",
            email: email,
          });
          authCreatedCount++;
        } catch (authErr: any) {
          // Ignore "Username already exists" (409)
          if (authErr.response && authErr.response.status === 409) {
            // already exists, all good
          } else {
            console.warn(`Failed to create auth for ${id}: ${authErr.message}`);
          }
        }
      } catch (dbErr: any) {
        errors.push({ row: i + 2, id, error: dbErr.message });
      }
    }

    return res.json({
      success: true,
      total: rows.length,
      profilesCreated: successCount,
      authCredentialsCreated: authCreatedCount,
      errors,
    });
  } catch (e: any) {
    console.error("Upload Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
};
