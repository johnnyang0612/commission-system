// Permission utility functions
export const USER_ROLES = {
  ADMIN: 'admin',
  FINANCE: 'finance', 
  SALES: 'sales',
  LEADER: 'leader'
};

export const PERMISSIONS = {
  VIEW_COSTS: 'view_costs',
  EDIT_COSTS: 'edit_costs',
  VIEW_PROFITS: 'view_profits',
  MANAGE_USERS: 'manage_users',
  DELETE_PROJECTS: 'delete_projects',
  VIEW_ALL_PROJECTS: 'view_all_projects'
};

// Role-based permission mapping
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.VIEW_COSTS,
    PERMISSIONS.EDIT_COSTS,
    PERMISSIONS.VIEW_PROFITS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.DELETE_PROJECTS,
    PERMISSIONS.VIEW_ALL_PROJECTS
  ],
  [USER_ROLES.FINANCE]: [
    PERMISSIONS.VIEW_COSTS,
    PERMISSIONS.EDIT_COSTS,
    PERMISSIONS.VIEW_PROFITS,
    PERMISSIONS.VIEW_ALL_PROJECTS
  ],
  [USER_ROLES.LEADER]: [
    PERMISSIONS.VIEW_ALL_PROJECTS
  ],
  [USER_ROLES.SALES]: [
    // Sales can only view their own projects and commissions
  ]
};

/**
 * Check if user has specific permission
 * @param {string} userRole - User's role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(userRole, permission) {
  if (!userRole || !permission) return false;
  return ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
}

/**
 * Check if user can view financial data (costs and profits)
 * @param {string} userRole - User's role
 * @returns {boolean}
 */
export function canViewFinancialData(userRole) {
  return hasPermission(userRole, PERMISSIONS.VIEW_COSTS) || 
         hasPermission(userRole, PERMISSIONS.VIEW_PROFITS);
}

/**
 * Check if user can edit costs
 * @param {string} userRole - User's role
 * @returns {boolean}
 */
export function canEditCosts(userRole) {
  return hasPermission(userRole, PERMISSIONS.EDIT_COSTS);
}

/**
 * Check if user is admin or finance
 * @param {string} userRole - User's role
 * @returns {boolean}
 */
export function isFinancialRole(userRole) {
  return userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.FINANCE;
}

/**
 * Get current user role from Supabase auth
 * @returns {string}
 */
export function getCurrentUserRole() {
  // 暫時返回 admin，在有真實用戶資料後會自動更新
  return USER_ROLES.ADMIN;
}

/**
 * Get current user data from Supabase auth
 * @returns {object}
 */
export function getCurrentUser() {
  // 暫時返回模擬用戶，在有真實用戶資料後會自動更新
  return {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Current User',
    email: 'user@example.com',
    role: getCurrentUserRole()
  };
}