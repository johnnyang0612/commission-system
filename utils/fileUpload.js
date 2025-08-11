// Supabase 檔案上傳工具
import { supabase } from './supabaseClient';

// 允許的檔案類型
export const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  all: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
};

// 最大檔案大小 (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 上傳檔案到 Supabase Storage
 * @param {File} file - 要上傳的檔案
 * @param {string} bucket - 儲存桶名稱 ('invoices', 'receipts', 'documents')
 * @param {string} folder - 資料夾路徑 (例如: 'costs/2024', 'payments/2024')
 * @param {Array} allowedTypes - 允許的檔案類型陣列
 * @returns {Object} { success, filePath, error, publicUrl }
 */
export async function uploadFile(file, bucket = 'documents', folder = '', allowedTypes = ALLOWED_FILE_TYPES.all) {
  try {
    // 檢查檔案是否存在
    if (!file) {
      return { success: false, error: '請選擇要上傳的檔案' };
    }

    // 檢查檔案大小
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `檔案大小不能超過 ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }

    // 檢查檔案類型
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: '不支援的檔案類型' };
    }

    // 生成唯一檔案名稱
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${randomString}.${fileExtension}`;
    
    // 建立完整路徑
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // 上傳檔案
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false // 不覆蓋現有檔案
      });

    if (error) {
      console.error('上傳失敗:', error);
      return { success: false, error: error.message };
    }

    // 取得公開 URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      success: true,
      filePath: filePath,
      publicUrl: urlData.publicUrl,
      fileName: fileName,
      originalName: file.name,
      fileSize: file.size,
      fileType: file.type
    };

  } catch (error) {
    console.error('上傳過程發生錯誤:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 刪除檔案
 * @param {string} bucket - 儲存桶名稱
 * @param {string} filePath - 檔案路徑
 * @returns {Object} { success, error }
 */
export async function deleteFile(bucket, filePath) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('刪除失敗:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('刪除過程發生錯誤:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 取得檔案下載 URL
 * @param {string} bucket - 儲存桶名稱  
 * @param {string} filePath - 檔案路徑
 * @param {number} expiresIn - 過期時間（秒），預設 1 小時
 * @returns {Object} { success, url, error }
 */
export async function getDownloadUrl(bucket, filePath, expiresIn = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('取得下載連結失敗:', error);
      return { success: false, error: error.message };
    }

    return { success: true, url: data.signedUrl };
  } catch (error) {
    console.error('取得下載連結過程發生錯誤:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 檔案上傳元件的輔助函數
 * @param {Function} onUploadProgress - 上傳進度回調
 * @param {Function} onUploadComplete - 上傳完成回調
 * @returns {Function} 處理檔案選擇的函數
 */
export function createFileUploadHandler(onUploadProgress, onUploadComplete) {
  return async (file, bucket, folder, allowedTypes) => {
    if (onUploadProgress) onUploadProgress(0);
    
    const result = await uploadFile(file, bucket, folder, allowedTypes);
    
    if (onUploadProgress) onUploadProgress(100);
    if (onUploadComplete) onUploadComplete(result);
    
    return result;
  };
}

// 預設的儲存桶配置
export const STORAGE_BUCKETS = {
  INVOICES: 'invoices',        // 發票
  RECEIPTS: 'receipts',        // 收據  
  DOCUMENTS: 'documents',      // 一般文件
  CONTRACTS: 'contracts',      // 合約
  PHOTOS: 'photos'            // 照片
};

// 預設的檔案夾結構
export const FOLDER_STRUCTURE = {
  COSTS: 'costs',              // 成本相關
  PAYMENTS: 'payments',        // 付款相關
  MAINTENANCE: 'maintenance',  // 維護相關
  USERS: 'users',             // 使用者相關
  PROJECTS: 'projects'        // 專案相關
};