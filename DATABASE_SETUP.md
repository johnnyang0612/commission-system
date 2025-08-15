# 戰情室資料庫設置指南

## 🚨 解決 "column close_rate does not exist" 錯誤

您遇到的錯誤表示現有的 `prospects` 表格缺少戰情室功能需要的新欄位。

## 📋 快速修復步驟

### 🔥 推薦方案 - 使用快速修復腳本

在 Supabase SQL 編輯器中執行 **`database-quick-fix.sql`** 檔案的全部內容。

這個腳本：
- ✅ 解決UUID類型錯誤
- ✅ 安全添加所有戰情室欄位
- ✅ 創建必要的關聯表格
- ✅ 自動驗證安裝結果

### ⚡ 緊急修復 - 最小化SQL

如果只需要解決 "column does not exist" 錯誤：

```sql
-- 添加戰情室必要欄位
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS close_rate VARCHAR DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS budget_status VARCHAR DEFAULT 'sufficient',
ADD COLUMN IF NOT EXISTS next_followup_date DATE,
ADD COLUMN IF NOT EXISTS expected_sign_date DATE,
ADD COLUMN IF NOT EXISTS owner_id UUID;

-- 更新現有記錄的預設值
UPDATE prospects 
SET close_rate = 'medium', 
    budget_status = 'sufficient' 
WHERE close_rate IS NULL OR budget_status IS NULL;

-- 驗證添加成功
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'prospects' 
AND column_name IN ('close_rate', 'budget_status');
```

### 🚀 完整遷移方案（包含測試資料）

如果需要完整的測試環境，執行 **`database-migration.sql`** 檔案（已修復UUID問題）。

這會：
- ✅ 安全添加所有戰情室欄位
- ✅ 創建相關表格 (action_records, assistance_requests, shared_files, users)
- ✅ 設置索引優化效能
- ✅ 插入測試資料
- ✅ 保留現有資料

## 🔍 驗證設置成功

執行後應該看到：

```sql
-- 檢查欄位是否存在
SELECT 'close_rate 欄位已添加' as status 
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'prospects' AND column_name = 'close_rate'
);
```

## ⚡ 設置完成後

1. 重新整理戰情室頁面
2. 所有功能應該正常運作
3. 可以開始使用智能排序、通知提醒等功能

## 📞 需要協助？

如果執行遇到問題：
1. 檢查 Supabase 連線狀態
2. 確認有足夠權限執行 ALTER TABLE
3. 查看 SQL 執行結果中的錯誤訊息