import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import * as XLSX from "xlsx";
import axios from "axios";
import { UserRole } from "../shared/roles.enum";
import { redis } from "../utils/redis.util";

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

export const getUploadProgress = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (!user)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const key = `student:upload:progress:${user.username}`;
  const data = await redis.get(key);

  if (!data) {
    return res.json({
      status: "idle",
      message: "No active or recent student upload found.",
    });
  }

  return res.json(JSON.parse(data));
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
    const total = rows.length;

    if (total === 0)
      return res.status(400).json({ success: false, message: "Empty file" });

    // Initialize progress in Redis
    await redis.setex(
      `student:upload:progress:${user.username}`,
      600,
      JSON.stringify({
        status: "processing",
        processed: 0,
        total,
        success: 0,
        fail: 0,
        percent: 0,
        etaSeconds: 0,
      }),
    );

    const startTime = Date.now();

    // Background Execution Handler
    const runIngestion = async () => {
      let successCount = 0;
      let failCount = 0;
      const errors: any[] = [];

      const CHUNK_SIZE = 5;
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map(async (row, indexInChunk) => {
            const globalIndex = i + indexInChunk;
            const getVal = (keys: string[]) => {
              const found = Object.keys(row).find((k) =>
                keys.includes(k.trim().toLowerCase()),
              );
              return found ? String(row[found]).trim() : "";
            };

            const id = getVal([
              "student id",
              "studentid",
              "id",
              "username",
            ]).toUpperCase();
            const name = getVal(["name", "student name"]);
            const email = getVal(["email", "mail"]);
            const gender = getVal(["gender", "sex"]);
            const branch = getVal(["branch", "department"]).toUpperCase();
            const year = getVal(["year", "class"]).toUpperCase();
            const section = getVal(["section", "sec"]).toUpperCase();
            const phone = getVal(["phone", "mobile"]);

            if (!id) {
              failCount++;
              errors.push({
                row: globalIndex + 2,
                error: "Missing Student ID",
              });
              return;
            }

            try {
              // 1. Upsert Profile
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
              try {
                await axios.post(`${AUTH_SERVICE_URL}/api/v1/auth/signup`, {
                  username: id,
                  password: id, // Default password is ID
                  role: "student",
                  email: email,
                });
              } catch (authErr: any) {
                if (authErr.response && authErr.response.status === 409) {
                  // already exists, skip
                } else {
                  console.warn(
                    `Failed to create auth for ${id}: ${authErr.message}`,
                  );
                }
              }
            } catch (dbErr: any) {
              failCount++;
              errors.push({ row: globalIndex + 2, id, error: dbErr.message });
            }
          }),
        );

        const processedCount = Math.min(i + CHUNK_SIZE, total);
        const elapsed = Math.max(Date.now() - startTime, 1);
        const avgTimePerItem = elapsed / processedCount;
        const remaining = total - processedCount;
        const etaSeconds = Math.ceil((avgTimePerItem * remaining) / 1000);

        await redis.setex(
          `student:upload:progress:${user.username}`,
          600,
          JSON.stringify({
            status: processedCount >= total ? "done" : "processing",
            processed: processedCount,
            total,
            success: successCount,
            fail: failCount,
            percent: Math.round((processedCount / total) * 100),
            etaSeconds: processedCount >= total ? 0 : Math.max(etaSeconds, 1),
            errors: errors.slice(-20),
          }),
        );
      }
    };

    runIngestion();

    return res.status(202).json({
      success: true,
      message: "Student bulk upload started in background.",
      total,
      monitor_url: "/api/v1/profile/admin/student/upload/progress",
    });
  } catch (e: any) {
    console.error("Upload Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
};
