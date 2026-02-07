import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding User Service...');

  // 1. Clean up old data
  try {
    await prisma.studentProfile.deleteMany();
    await prisma.facultyProfile.deleteMany();
    await prisma.adminProfile.deleteMany();
    await prisma.banner.deleteMany();
    console.log('✅ Deleted old user data.');
  } catch (e) {
    console.warn("⚠️  Could not clean old data, proceeding...");
  }

  // 2. Seed Admin
  await prisma.adminProfile.upsert({
    where: { username: 'security' },
    update: {},
    create: {
      id: 'admin_security_01',
      username: 'security',
      email: 'security@uniz.com',
    }
  });

  const admins = [
    { username: 'dean', role: 'dean' },
    { username: 'warden_male', role: 'warden_male' },
    { username: 'warden_female', role: 'warden_female' },
    { username: 'caretaker_male', role: 'caretaker_male' },
    { username: 'caretaker_female', role: 'caretaker_female' },
    { username: 'webmaster', role: 'webmaster' },
    { username: 'director', role: 'director' },
    { username: 'swo', role: 'swo' },
    { username: 'librarian', role: 'librarian' }
  ];

  for(const admin of admins) {
      await prisma.adminProfile.upsert({
        where: { username: admin.username },
        update: {},
        create: {
            id: `admin_${admin.username}_01`,
            username: admin.username,
            email: `${admin.username}@uniz.com`,
            role: admin.role
        }
      });
  }
  console.log('✅ Seeded Admins: security, dean, wardens, caretakers, director, swo, librarian');

  // 3. Seed Students
  const students = [
    { id: 'O210008', name: 'Desu Sreecharan', branch: 'CSE', year: 'E2', section: 'C', email: 'o210008@rguktong.ac.in', gender: "Male" },
    { id: 'O210329', name: 'Alahari Bhanu Prakash', branch: 'CSE', year: 'E2', section: 'C', email: 'o210329@rguktong.ac.in', gender: "Male" },
    { id: 'O210139', name: 'Damarla Seetha Ram Praveen', branch: 'CSE', year: 'E2', section: 'D', email: 'o210139@rguktong.ac.in', gender: "Male" },
    { id: 'O210829', name: 'Anand Velpuri', branch: 'CSE', year: 'E2', section: 'D', email: 'o210829@rguktong.ac.in', gender: "Male" }
  ];

  for (const s of students) {
    await prisma.studentProfile.upsert({
      where: { username: s.id },
      update: s,
      create: {
        ...s,
        username: s.id // Map ID to username explicitly
      }
    });
  }
  console.log(`✅ Seeded ${students.length} students.`);

  console.log('✅ User Service Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
