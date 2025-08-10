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
 * Get current user role from database
 * @param {string} userId - User ID
 * @returns {Promise<string>}
 */
export async function getCurrentUserRole(userId) {
  if (!userId) return USER_ROLES.SALES; // 預設為業務
  
  try {
    const { supabase } = await import('./supabaseClient');
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (error || !data) {
      console.error('無法獲取用戶角色:', error);
      return USER_ROLES.SALES; // 預設為業務
    }
    
    return data.role || USER_ROLES.SALES;
  } catch (err) {
    console.error('獲取角色錯誤:', err);
    return USER_ROLES.SALES;
  }
}

/**
 * Get current user data from database
 * @param {object} authUser - Auth user object
 * @returns {Promise<object>}
 */
export async function getCurrentUser(authUser) {
  if (!authUser) return null;
  
  try {
    const { supabase } = await import('./supabaseClient');
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();
    
    if (error || !data) {
      // 如果用戶不存在，返回基本資訊
      return {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
        role: USER_ROLES.SALES // 預設業務
      };
    }
    
    return data;
  } catch (err) {
    console.error('獲取用戶資料錯誤:', err);
    return null;
  }
}