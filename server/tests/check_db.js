import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ledger = await prisma.ledger.findMany();
  console.log("Ledger entries:");
  console.log(JSON.stringify(ledger, null, 2));

  const interest = await prisma.interest_entries.findMany();
  console.log("\nInterest entries:");
  console.log(JSON.stringify(interest, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
