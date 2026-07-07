/**
 * Interface representing a row in the unpaid schedule input.
 */
export interface DueDetail {
  slabName: string;
  dueDate: string | Date;
  percentage: number;
}

/**
 * Interface representing the inputs for the dynamic FPV calculation.
 */
export interface FPVInput {
  agreementValue: number;
  computationDate: string | Date;
  discountRate: number;
  dueDetails: DueDetail[];
}

/**
 * Interface representing a row in the processed FPV schedule output.
 */
export interface ProcessedDueDetail extends DueDetail {
  amount: number;
  days: number;
  discountFactor: number;
  presentValue: number;
  benefitAmount: number;
}

/**
 * Interface representing the aggregated totals of the FPV calculation.
 */
export interface FPVTotals {
  totalFV: number;
  totalPV: number;
  totalBenefit: number;
}

/**
 * Interface representing the final output structure of the FPV calculation.
 */
export interface FPVOutput {
  processedSchedule: ProcessedDueDetail[];
  totals: FPVTotals;
}

/**
 * Parses a Date or string input to a Date object, resetting time to midnight (local time)
 * to avoid timezone shift inconsistencies when comparing days.
 * 
 * @param dateInput - The Date object or date string to parse.
 * @returns A Date object set to local midnight.
 */
function parseDate(dateInput: Date | string): Date {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  
  if (typeof dateInput === "string") {
    // Attempt to match YYYY-MM-DD
    const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed month
      const day = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
    
    // Fallback parsing
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date string: ${dateInput}`);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  
  throw new Error(`Unsupported date type: ${typeof dateInput}`);
}

/**
 * Calculates the exact calendar day difference between start and end dates (end - start).
 * 
 * @param start - The starting Date.
 * @param end - The ending Date.
 * @returns The difference in days.
 */
function getDaysDifference(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / (1000 * 60 * 60 * 24));
}

/**
 * Calculates the Present Value (PV) and Discount Benefit for a given payment schedule.
 * 
 * Formula:
 * PV = Future Value / (1 + ((Discount Rate / 100) * (Days / 365)))
 * 
 * @param input - The FPV input parameters including agreementValue, computationDate, discountRate, and dueDetails.
 * @returns An object containing the processed schedule and calculated totals.
 */
export function calculateDynamicFPV(input: FPVInput): FPVOutput {
  const { agreementValue, computationDate, discountRate, dueDetails } = input;

  if (typeof agreementValue !== "number" || isNaN(agreementValue)) {
    throw new Error("Invalid agreementValue: must be a number");
  }
  if (typeof discountRate !== "number" || isNaN(discountRate)) {
    throw new Error("Invalid discountRate: must be a number");
  }
  if (!Array.isArray(dueDetails)) {
    throw new Error("Invalid dueDetails: must be an array");
  }

  const parsedComputationDate = parseDate(computationDate);

  const processedSchedule: ProcessedDueDetail[] = dueDetails.map((detail) => {
    // 1. Calculate Future Value (Amount)
    const fvRaw = agreementValue * (detail.percentage / 100);

    // 2. Calculate Delay/Early Days (n)
    const parsedDueDate = parseDate(detail.dueDate);
    let days = getDaysDifference(parsedComputationDate, parsedDueDate);
    
    // Edge case handling: If due date is in the past, days = 0
    if (days < 0) {
      days = 0;
    }

    // 3. Calculate Discount Factor
    const discountFactor = (discountRate / 100) * (days / 365);

    // 4. Calculate Present Value (PV)
    const pvRaw = fvRaw / (1 + discountFactor);

    // 5. Calculate Benefit Amount
    const benefitRaw = fvRaw - pvRaw;

    // Currency outputs rounded to the nearest whole integer
    const amount = Math.round(fvRaw);
    const presentValue = Math.round(pvRaw);
    const benefitAmount = Math.round(benefitRaw);

    return {
      ...detail,
      amount,
      days,
      discountFactor,
      presentValue,
      benefitAmount,
    };
  });

  // Calculate totals by summing the rounded currency values of the processed rows
  let totalFV = 0;
  let totalPV = 0;
  let totalBenefit = 0;

  for (const row of processedSchedule) {
    totalFV += row.amount;
    totalPV += row.presentValue;
    totalBenefit += row.benefitAmount;
  }

  return {
    processedSchedule,
    totals: {
      totalFV,
      totalPV,
      totalBenefit,
    },
  };
}
