import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const unitsData = [
  { unit_number: "A-101", type: "A1", floor: 1, bhk: "2 BHK", block: "Tower Serenity", class: "Premium", carpet: 890, sba: 1250, rate: 9850, caic: 1500000, maint: 300000 },
  { unit_number: "A-102", type: "A2", floor: 1, bhk: "3 BHK", block: "Tower Serenity", class: "Premium", carpet: 1190, sba: 1680, rate: 10200, caic: 1500000, maint: 300000 },
  { unit_number: "A-201", type: "A1", floor: 2, bhk: "2 BHK", block: "Tower Serenity", class: "Premium", carpet: 890, sba: 1250, rate: 9950, caic: 1500000, maint: 300000 },
  { unit_number: "A-202", type: "A2", floor: 2, bhk: "3 BHK", block: "Tower Serenity", class: "Premium", carpet: 1190, sba: 1680, rate: 10300, caic: 1500000, maint: 300000 },
  { unit_number: "A-301", type: "A1", floor: 3, bhk: "2 BHK", block: "Tower Serenity", class: "Premium", carpet: 910, sba: 1280, rate: 10050, caic: 1500000, maint: 300000 },
  { unit_number: "A-302", type: "A2", floor: 3, bhk: "3 BHK", block: "Tower Serenity", class: "Premium", carpet: 1220, sba: 1720, rate: 10450, caic: 1500000, maint: 300000 },

  { unit_number: "B-301", type: "B1", floor: 3, bhk: "3 BHK", block: "Tower Horizon", class: "Grand", carpet: 1320, sba: 1850, rate: 11200, caic: 1500000, maint: 300000 },
  { unit_number: "B-302", type: "B2", floor: 3, bhk: "3.5 BHK", block: "Tower Horizon", class: "Grand", carpet: 1540, sba: 2150, rate: 11500, caic: 1500000, maint: 300000 },
  { unit_number: "B-401", type: "B2", floor: 4, bhk: "3.5 BHK", block: "Tower Horizon", class: "Grand", carpet: 1540, sba: 2150, rate: 11650, caic: 1500000, maint: 300000 },
  { unit_number: "B-501", type: "B3", floor: 5, bhk: "4 BHK", block: "Tower Horizon", class: "Luxury", carpet: 1890, sba: 2650, rate: 12100, caic: 1500000, maint: 300000 },
  { unit_number: "B-601", type: "B3", floor: 6, bhk: "4 BHK", block: "Tower Horizon", class: "Luxury", carpet: 1910, sba: 2680, rate: 12350, caic: 1500000, maint: 300000 },

  { unit_number: "C-601", type: "C1", floor: 6, bhk: "4.5 BHK", block: "Tower Pinnacle", class: "Luxury", carpet: 2120, sba: 2980, rate: 13200, caic: 1500000, maint: 300000 },
  { unit_number: "C-701", type: "P1", floor: 7, bhk: "5 BHK Penthouse", block: "Tower Pinnacle", class: "Ultra Luxury", carpet: 2820, sba: 3850, rate: 14800, caic: 1800000, maint: 400000 },
  { unit_number: "C-702", type: "P2", floor: 7, bhk: "5 BHK Penthouse", block: "Tower Pinnacle", class: "Ultra Luxury", carpet: 2890, sba: 3920, rate: 14950, caic: 1800000, maint: 400000 },
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
        data: { project_id: project.id, block_code: u.block.replace(/\s+/g, '').toUpperCase(), block_name: u.block }
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
        caic_charges: u.caic || 1500000,
        maintenance_deposit: u.maint || 300000,
        gst_rate: 5,
        basic_sale_value: bsv,
        total_sale_value: total,
      },
      update: {
        classification: u.class,
        rate_per_sqft: u.rate,
        caic_charges: u.caic || 1500000,
        maintenance_deposit: u.maint || 300000,
        gst_rate: 5,
        basic_sale_value: bsv,
        total_sale_value: total,
      }
    });
    
    console.log(`Upserted unit ${u.unit_number} (${u.bhk}, ${u.block})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
