import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

const teamData = [
  {
    employee_code: "EMP-1001",
    full_name: "Prisha Birla",
    email: "prishaa.birla@gmail.com",
    phone: "09834816412",
    role: "admin",
    is_active: true
  },
  {
    employee_code: "EMP-1002",
    full_name: "Rajesh Verma",
    email: "rajesh.verma@propfin.com",
    phone: "+91 9823011223",
    role: "manager",
    is_active: true
  },
  {
    employee_code: "EMP-1003",
    full_name: "Ananya Deshmukh",
    email: "ananya.d@propfin.com",
    phone: "+91 9765432109",
    role: "finance",
    is_active: true
  },
  {
    employee_code: "EMP-1004",
    full_name: "Vikram Malhotra",
    email: "vikram.m@propfin.com",
    phone: "+91 9819283746",
    role: "sales_exec",
    is_active: true
  }
];

async function main() {
  for (const member of teamData) {
    await prisma.users.upsert({
      where: { email: member.email },
      create: {
        employee_code: member.employee_code,
        full_name: member.full_name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        is_active: member.is_active,
        password_hash: hashPassword("PropFin@2026")
      },
      update: {
        employee_code: member.employee_code,
        full_name: member.full_name,
        phone: member.phone,
        role: member.role,
        is_active: member.is_active
      }
    });
    console.log(`Upserted team member ${member.full_name} (${member.role})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
