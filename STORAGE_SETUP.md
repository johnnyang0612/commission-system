# 檔案儲存設定指南

## 📋 總結
我為您的川輝科技分潤管理系統實作了完整的檔案上傳和管理功能！

## 🚀 已實作功能
✅ **Supabase Storage 整合**  
✅ **檔案上傳元件**（支援拖拽、多檔案）  
✅ **檔案類型限制**（圖片、PDF、Word、Excel）  
✅ **檔案大小限制**（10MB）  
✅ **檔案預覽和下載**  
✅ **檔案刪除功能**  
✅ **成本管理整合**（發票/收據上傳）  

## 📁 檔案儲存架構
```
Supabase Storage Buckets:
├── invoices/           # 發票
│   └── costs/2024/專案ID/  # 按年份和專案分類
├── receipts/           # 收據  
├── documents/          # 一般文件
├── contracts/          # 合約
└── photos/            # 照片
```

## ⚙️ 設定步驟

### 1. Supabase Storage 設定
1. 登入 [Supabase Dashboard](https://app.supabase.com)
2. 選擇您的專案
3. 到 **Storage** → **Create Bucket**
4. 建立以下儲存桶：
   - `invoices` (公開)
   - `receipts` (公開) 
   - `documents` (公開)
   - `contracts` (公開)
   - `photos` (公開)

### 2. 執行 SQL 腳本
1. 到 **SQL Editor**
2. 執行 `supabase/setup_storage.sql`
3. 執行 `supabase/expand_users_table.sql`
4. 執行 `supabase/add_invoice_management.sql`

### 3. RLS 政策設定
Storage 會自動設定以下權限：
- ✅ 已認證用戶可上傳檔案
- ✅ 已認證用戶可檢視檔案
- ✅ 已認證用戶可刪除檔案
- ✅ 已認證用戶可更新檔案

## 💡 使用方式

### 在成本管理中上傳發票
1. 新增成本項目時，填寫發票資訊
2. 在「發票/單據上傳」區塊選擇檔案
3. 支援最多 5 個檔案
4. 檔案會自動分類到 `invoices/costs/2024/專案ID/` 資料夾

### 檔案命名規則
- 自動生成唯一檔名：`時間戳_隨機碼.副檔名`
- 保留原始檔名供顯示
- 避免檔名衝突

### 檔案存取
- **檢視**：點擊表格中的檔案連結
- **下載**：右鍵另存新檔
- **刪除**：在檔案列表中點擊刪除按鈕

## 🔧 技術說明

### 檔案上傳流程
```javascript
選擇檔案 → 驗證類型/大小 → 上傳到 Supabase → 取得 URL → 存入資料庫
```

### 資料庫儲存格式
```json
{
  "file_attachments": [
    {
      "fileName": "1642234567_abc123.pdf",
      "originalName": "發票001.pdf",
      "filePath": "costs/2024/123/1642234567_abc123.pdf", 
      "publicUrl": "https://xxx.supabase.co/storage/v1/object/public/invoices/...",
      "fileSize": 1024000,
      "fileType": "application/pdf",
      "uploadedAt": "2024-01-15T10:30:00Z",
      "bucket": "invoices"
    }
  ]
}
```

## 💸 費用說明

### Supabase Storage 價格 (2024)
- **免費額度**：1GB 儲存 + 2GB 傳輸
- **超額費用**：$0.021/GB/月 儲存 + $0.09/GB 傳輸
- 以一般中小企業使用量，每月費用約 $5-20 USD

### vs Google Drive API 比較
| 項目 | Supabase Storage | Google Drive API |
|-----|------------------|------------------|
| 整合難度 | ⭐⭐ 簡單 | ⭐⭐⭐⭐ 複雜 |
| 權限控制 | ⭐⭐⭐⭐⭐ 優秀 | ⭐⭐⭐ 普通 |
| 存取速度 | ⭐⭐⭐⭐⭐ 很快 | ⭐⭐⭐ 普通 |
| 費用 | ⭐⭐⭐⭐ 合理 | ⭐⭐⭐⭐⭐ 便宜 |

## 🔍 故障排除

### 常見問題
1. **上傳失敗**
   - 檢查 Supabase 連線
   - 確認 Storage Buckets 已建立
   - 檢查 RLS 政策設定

2. **檔案無法顯示**
   - 確認 bucket 設為公開
   - 檢查檔案 URL 格式

3. **權限錯誤**
   - 確認用戶已登入
   - 檢查 RLS 政策

### 開發者工具
- 在瀏覽器 Console 查看詳細錯誤
- Supabase Dashboard → Storage → 檢查檔案是否上傳成功

## 📈 未來擴充

可考慮加入的功能：
- 📄 PDF 預覽器
- 🖼️ 圖片縮圖生成
- 📊 檔案使用統計
- 🔍 檔案搜尋功能
- 📱 手機拍照上傳

---

**完成！** 您現在擁有一個功能完整的發票/單據管理系統，支援安全的檔案上傳和儲存！