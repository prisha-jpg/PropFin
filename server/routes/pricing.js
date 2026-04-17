import express from "express";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

// Get Unit Master Price List (Units + their pricing)
router.get("/master", async (req, res) => {
  try {
    const units = await prisma.units.findMany({
      include: {
        unitPricing: true,
        projects: { select: { project_name: true } },
        blocks: { select: { block_name: true } }
      },
      orderBy: { unit_number: "asc" }
    });
    
    res.json(units);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upsert Unit Pricing
router.post("/master", async (req, res) => {
  try {
    const { prices } = req.body;
    
    await prisma.$transaction(async (tx) => {
      for (const p of prices) {
        await tx.unitPricing.upsert({
          where: { unit_id: p.unit_id },
          create: {
            unit_id: p.unit_id,
            rate_per_sqft: p.rate_per_sqft,
            classification: p.classification,
            caic_charges: p.caic_charges,
            maintenance_deposit: p.maintenance_deposit,
            basic_sale_value: p.basic_sale_value,
            total_sale_value: p.total_sale_value
          },
          update: {
            rate_per_sqft: p.rate_per_sqft,
            classification: p.classification,
            caic_charges: p.caic_charges,
            maintenance_deposit: p.maintenance_deposit,
            basic_sale_value: p.basic_sale_value,
            total_sale_value: p.total_sale_value
          }
        });
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Payment Schedule Master per project/block
router.get("/schedule-master", async (req, res) => {
  try {
    const schedules = await prisma.payment_schedule_master.findMany({
      include: { 
        projects: { select: { project_name: true } },
        blocks: { select: { block_name: true } }
      },
      orderBy: [
        { project_id: 'asc' },
        { display_order: 'asc' }
      ]
    });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save Payment Schedule Master
router.post("/schedule-master", async (req, res) => {
  try {
    const { schedules } = req.body; // Expects full replacement per project usually, or upserts
    
    await prisma.$transaction(async (tx) => {
      for (const s of schedules) {
        if (s.id) {
          await tx.payment_schedule_master.update({
            where: { id: s.id },
            data: {
              milestone_name: s.milestone_name,
              percentage_of_total: s.percentage_of_total,
              display_order: s.display_order
            }
          });
        } else {
          await tx.payment_schedule_master.create({
             data: {
               project_id: s.project_id,
               block_id: s.block_id || null,
               milestone_name: s.milestone_name,
               percentage_of_total: s.percentage_of_total,
               display_order: s.display_order
             }
          });
        }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Schedule Master
router.delete("/schedule-master/:id", async (req, res) => {
  try {
    await prisma.payment_schedule_master.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save a Quotation
router.post("/quotations", async (req, res) => {
  try {
    const quote = await prisma.quotations.create({
       data: {
         ...req.body,
         quotation_number: `QT${Date.now().toString(36).toUpperCase()}`
       }
    });
    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
