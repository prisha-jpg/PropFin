/**
 * Parse an arbitrary Date string or object to a clean UTC Date object set to midnight
 * to prevent timezone-related day offset mismatches.
 */
function parseDateToUtc(d) {
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date provided: ${d}`);
  }
  return new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
}

/**
 * Formats a Date object to DD/MM/YYYY string in UTC.
 */
function formatUtcDMY(d) {
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Checks if a given year is a leap year.
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Calculates month-by-month delayed payment interest for a milestone.
 *
 * @param {Object} params - The calculation parameters.
 * @param {number} params.milestoneDemand - The total amount requested in the demand letter.
 * @param {number} params.amountPaid - The total amount the customer has paid.
 * @param {string|Date} params.dueDate - The date the milestone was originally due.
 * @param {string|Date} params.calculationEndDate - The calculation end date.
 * @param {number} params.annualInterestRate - The APR percentage (e.g. 18.0).
 * @returns {Array<Object>} An array of objects representing month-by-month ledger entries.
 */
export function calculateMonthlyDelayedInterest({
  milestoneDemand,
  amountPaid,
  dueDate,
  calculationEndDate,
  annualInterestRate
}) {
  const principal = Number(milestoneDemand || 0) - Number(amountPaid || 0);

  // 1. Outstanding Principal: principal <= 0 returns empty array
  if (principal <= 0) {
    return [];
  }

  if (annualInterestRate === undefined || annualInterestRate === null) {
    throw new Error("Annual interest rate is required.");
  }
  const rate = Number(annualInterestRate);
  if (isNaN(rate) || rate < 0) {
    throw new Error("Annual interest rate must be a non-negative number.");
  }

  // Parse dates to UTC
  const dueUtc = parseDateToUtc(dueDate);
  const endUtc = parseDateToUtc(calculationEndDate);

  // 2. Date Boundaries: If dueDate is in the future relative to calculationEndDate
  if (dueUtc >= endUtc) {
    return [];
  }

  // Overdue starts the calendar day AFTER the due date
  const overdueStart = new Date(dueUtc.getTime() + 24 * 60 * 60 * 1000);
  const overdueEnd = endUtc;

  const results = [];

  let currentYear = overdueStart.getUTCFullYear();
  let currentMonth = overdueStart.getUTCMonth(); // 0-indexed

  const endYear = overdueEnd.getUTCFullYear();
  const endMonth = overdueEnd.getUTCMonth();

  // Loop through calendar months starting from overdueStart's month up to overdueEnd's month
  while (
    currentYear < endYear || 
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
    const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

    // Intersection range of overdue period with this calendar month
    const rangeStart = overdueStart > firstDayOfMonth ? overdueStart : firstDayOfMonth;
    const rangeEnd = overdueEnd < lastDayOfMonth ? overdueEnd : lastDayOfMonth;

    if (rangeStart <= rangeEnd) {
      // Calculate exact days overdue inside this month
      const timeDiff = rangeEnd.getTime() - rangeStart.getTime();
      const daysOverdue = Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;

      // Handle leap years dynamically based on the current year being calculated
      const daysInYear = isLeapYear(currentYear) ? 366 : 365;

      // Simple Interest formula: P * R * T
      const interestCalculated = (principal * rate * daysOverdue) / (daysInYear * 100);
      const roundedInterest = Math.round((interestCalculated + Number.EPSILON) * 100) / 100;

      const monthStr = (currentMonth + 1).toString().padStart(2, '0');
      const monthYear = `${monthStr}-${currentYear}`;

      const narration = `Delayed payment interest for the period of ${formatUtcDMY(rangeStart)} to ${formatUtcDMY(rangeEnd)}`;

      results.push({
        monthYear,
        daysOverdue,
        principalAmount: Number(principal.toFixed(2)),
        interestAmount: roundedInterest,
        narration
      });
    }

    // Move to next calendar month
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
  }

  return results;
}
