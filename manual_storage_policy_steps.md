# 手動設定 Storage 政策步驟

如果 SQL 腳本中的政策創建失敗，請按照以下步驟手動設定：

## 對每個 Bucket 設定政策

需要為以下 5 個 buckets 設定政策：
- `invoices`
- `receipts`
- `documents`
- `contracts`
- `photos`

## 步驟：

### 1. 進入 Supabase Dashboard
- 登入 [Supabase Dashboard](https://supabase.com/dashboard)
- 選擇您的專案

### 2. 進入 Storage 設定
- 點擊左側選單的 **Storage**
- 您應該會看到剛才創建的 5 個 buckets

### 3. 為每個 Bucket 設定政策
對 **每個 bucket** 重複以下步驟：

1. 點擊 bucket 名稱（如 `invoices`）
2. 點擊 **Policies** 標籤
3. 點擊 **New Policy** 或 **Add Policy**
4. 選擇 **For full customization**
5. 填入以下設定：

```
Policy Name: Allow authenticated users full access
Operation: All
Target roles: authenticated
USING expression: true
WITH CHECK expression: true
```

6. 點擊 **Save** 或 **Create Policy**

### 4. 重複步驟 3
對剩下的 4 個 buckets 重複相同步驟：
- `receipts`
- `documents` 
- `contracts`
- `photos`

## 完成後測試
設定完成後，回到系統測試文件上傳功能，應該就能正常運作了。

## 替代方案：設為公開
如果上述步驟仍有問題，可以將每個 bucket 設為完全公開：
1. 在每個 bucket 的設定中
2. 找到 **Public** 選項
3. 啟用公開訪問

但這樣所有人都能訪問文件，較不安全。