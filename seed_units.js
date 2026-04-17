import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const unitsData = [
  { unit_number: "L-3011", type: "L", floor: 1, bhk: "4.5 BHK", block: "Block 3", class: "Luxury", carpet: 1890, sba: 2987, rate: 11640, maint: 300000 },
  { unit_number: "M-3012", type: "M", floor: 1, bhk: "3.5 BHK", block: "Block 3", class: "Luxury", carpet: 1503, sba: 2490, rate: 11640, maint: 300000 },
  { unit_number: "N-3013", type: "N", floor: 1, bhk: "3 BHK", block: "Block 3", class: "Grand", carpet: 1381, sba: 2147, rate: 11340, maint: 300000 },
  { unit_number: "P-3014", type: "P", floor: 1, bhk: "3 BHK", block: "Block 3", class: "Grand", carpet: 1241, sba: 2134, rate: 11340, maint: 300000 },
  { unit_number: "Q-3015", type: "Q", floor: 1, bhk: "3 BHK", block: "Block 3", class: "Grand", carpet: 1368, sba: 2257, rate: 11640, maint: 300000 },
  { unit_number: "L1-3021", type: "L1", floor: 2, bhk: "4.5 BHK", block: "Block 3", class: "Luxury", carpet: 1890, sba: 2981, rate: 11690, maint: 300000 },
  { unit_number: "M1-3022", type: "M1", floor: 2, bhk: "3.5 BHK", block: "Block 3", class: "Luxury", carpet: 1503, sba: 2423, rate: 11690, maint: 300000 },
  { unit_number: "N2-3023", type: "N2", floor: 2, bhk: "3 BHK", block: "Block 3", class: "Grand", carpet: 1381, sba: 2147, rate: 11390, maint: 300000 },
  { unit_number: "P2-3024", type: "P2", floor: 2, bhk: "3 BHK", block: "Block 3", class: "Grand", carpet: 1241, sba: 2059, rate: 11390, maint: 300000 },
];

async function main() {
  // 1. Get or create project
  let project = await prisma.projects.findFirst();
  if (!project) {
    project = await prisma.projects.create({
      data: { project_code: "PRJ001", project_name: "PropFin Residency" }
    });
  }

  // 2. Process units
  for (const u of unitsData) {
    // get or create block
    let block = await prisma.blocks.findFirst({ where: { project_id: project.id, block_name: u.block } });
    if (!block) {
      block = await prisma.blocks.create({
        data: { project_id: project.id, block_code: u.block.replace(' ', ''), block_name: u.block }
      });
    }

    // Upsert unit
    const unit = await prisma.units.upsert({
      where: { project_id_unit_number: { project_id: project.id, unit_number: u.unit_number } },
      create: {
        project_id: project.id,
        block_id: block.id,
        unit_number: u.unit_number,
        floor_number: u.floor,
        unit_type: u.bhk,
        carpet_area: u.carpet,
        super_built_up_area: u.sba,
        base_price: u.rate
      },
      update: {
        floor_number: u.floor,
        unit_type: u.bhk,
        carpet_area: u.carpet,
        super_built_up_area: u.sba,
        base_price: u.rate
      }
    });

    const bsv = u.sba * u.rate;
    const total = bsv * 1.05;

    // Upsert pricing
    await prisma.unit_pricing.upsert({
      where: { unit_id: unit.id },
      create: {
        unit_id: unit.id,
        classification: u.class,
        rate_per_sqft: u.rate,
        maintenance_deposit: u.maint,
        basic_sale_value: bsv,
        total_sale_value: total,
        caic_charges: 0,
      },
      update: {
        classification: u.class,
        rate_per_sqft: u.rate,
        maintenance_deposit: u.maint,
        basic_sale_value: bsv,
        total_sale_value: total,
      }
    });
    
    console.log(`Upserted unit ${u.unit_number}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
