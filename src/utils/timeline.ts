/**
 * Interface representing a master milestone template.
 */
export interface MasterMilestoneTemplate {
  milestone_id: string;
  description: string;
  default_allocation_percent: number;
  offset_days: number; // Offset in days from the anchor booking date
}

/**
 * Interface representing an active/computed customer milestone.
 */
export interface ActiveMilestone extends MasterMilestoneTemplate {
  id?: string | number; // React UI identifier key
  name?: string; // description mapping
  percent?: string | number; // allocation percent string mapping
  dueDate?: string; // dueDate string
  computed_target_date: string; // computed target date YYYY-MM-DD
  is_manually_overridden: boolean; // flag to detect sales rep overrides
}

/**
 * Safely parses a date string or Date object to a local date at midnight.
 */
function parseLocalDate(dateInput: Date | string): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Automatically computes Target Dates for a milestone template based on offset days from an anchor date.
 * 
 * - If anchorDate is not defined or invalid, returns placeholders with empty dates.
 * - Supports positive and negative offset days.
 * - Sunday Collision: If a computed target date lands on a Sunday (day 0), it is pushed to Monday (+1 day).
 * 
 * @param anchorDate - The base start date (e.g. Booking Date).
 * @param milestones - The array of milestones with offset_days.
 * @returns The computed active milestones.
 */
export function calculateMilestoneDates(
  anchorDate: Date | string,
  milestones: any[]
): any[] {
  const baseDate = parseLocalDate(anchorDate);
  
  if (!baseDate) {
    return milestones.map((m) => ({
      ...m,
      computed_target_date: "",
      dueDate: "",
    }));
  }

  return milestones.map((m) => {
    // If the date was manually overridden by the user, keep it as-is
    if (m.is_manually_overridden && (m.dueDate || m.computed_target_date)) {
      return m;
    }

    const offset = parseInt(m.offset_days || 0, 10);
    const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);

    // Sunday collision bonus check (Sunday = 0)
    if (target.getDay() === 0) {
      target.setDate(target.getDate() + 1);
    }

    const y = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    const computed_target_date = `${y}-${month}-${d}`;

    return {
      ...m,
      computed_target_date,
      dueDate: computed_target_date,
      expectedDate: computed_target_date,
    };
  });
}
