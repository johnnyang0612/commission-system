# 資料庫設置指南

## 問題說明
新增成本功能出現錯誤是因為 `project_costs` 表尚未在 Supabase 資料庫中建立。

## 解決方案

### 步驟 1: 執行完整資料庫設置

1. 登入您的 **Supabase Dashboard**
2. 選擇您的專案
3. 點選左側選單的 **SQL Editor**
4. 建立新查詢並複製貼上 `migrations/setup_complete_database.sql` 的完整內容
5. 點選 **RUN** 執行

### 步驟 2: 驗證表格建立

執行以下查詢確認所有表格都已建立：

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

應該看到以下表格：
- `users`
- `projects` 
- `project_installments`
- `project_costs` ← 這是缺少的表格
- `payments`
- `commissions`

### 步驟 3: 測試成本新增功能

執行資料庫設置後，重新載入專案詳細頁面並測試新增成本功能。

## 注意事項

- 設置腳本使用 `IF NOT EXISTS` 確保不會重複建立已存在的表格
- 如果有現有資料，不會被影響
- 預設會建立 Admin 和 Finance 使用者帳號

## 如果仍有問題

請檢查 Supabase 專案的：
1. **Table Editor** 確認 `project_costs` 表格存在
2. **API Settings** 確認表格權限設定
3. 瀏覽器 Console 查看詳細錯誤訊息