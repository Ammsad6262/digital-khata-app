import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const envContent = fs.readFileSync(".env", "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && m[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
}
const prisma = new PrismaClient();
(async () => {
  // Check the actual Setting table columns
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'Setting'
    ORDER BY ordinal_position
  `;
  console.log("Setting table columns:");
  for (const c of cols as any[]) {
    console.log(`  ${c.column_name}: ${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default}`);
  }
  await prisma.$disconnect();
})();
