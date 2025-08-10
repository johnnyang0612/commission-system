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
 * Get current user role (mock function - replace with actual auth)
 * @returns {string}
 */
export function getCurrentUserRole() {
  // In a real application, this would get the role from:
  // - JWT token
  // - Session storage
  // - API call to get current user
  // For now, we'll simulate based on some logic
  
  // This is a temporary simulation - replace with actual authentication
  return USER_ROLES.ADMIN; // Default to admin for development
}

/**
 * Mock function to get current user data
 * @returns {object}
 */
export function getCurrentUser() {
  // In a real application, this would fetch the current logged-in user
  return {
    id: 1,
    name: 'Admin User',
    email: 'admin@example.com',
    role: getCurrentUserRole()
  };
}