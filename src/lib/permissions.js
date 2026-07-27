/**
 * PropFin Role-Based Access Control (RBAC) Permission Helper
 * 
 * Roles in system:
 * - admin: Administrator (Full Access)
 * - manager: Sales Manager (Full Operational & Approval Access)
 * - sales_exec: Sales Executive (Can create entries/bookings/receipts, cannot approve cancellations/handovers)
 * - finance: Finance Manager (Can manage ledgers/receipts, cannot approve cancellations)
 * - approver: Compliance Approver (Can review & approve workflow requests)
 * - viewer: Read Only Viewer (Cannot modify or approve)
 */

export const canApprove = (user) => {
  if (!user) return false;
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "manager" || role === "approver";
};

export const canManageTeam = (user) => {
  if (!user) return false;
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "manager";
};

export const canManageSetup = (user) => {
  if (!user) return false;
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "manager";
};

export const isReadOnly = (user) => {
  if (!user) return false;
  const role = (user.role || "").toLowerCase();
  return role === "viewer";
};
