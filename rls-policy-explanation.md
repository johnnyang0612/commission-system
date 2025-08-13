# RLS 政策說明文檔

## 當前政策結構

### 1. 查看權限 (SELECT)
```sql
CREATE POLICY "Authenticated users can view all" ON users
FOR SELECT TO authenticated USING (true);
```
- **作用**: 所有已認證用戶可以查看用戶列表
- **用途**: 用戶管理頁面、下拉選單、業務分配等

### 2. 管理員權限 (ALL)
```sql
CREATE POLICY "Admin full control" ON users
FOR ALL TO authenticated
USING (auth.email() IN ('johnny.yang@...', 'johnnyang0612@...', 'johnny19940612@...'))
```
- **作用**: 指定 email 的管理員可以進行所有操作
- **包含**: SELECT, INSERT, UPDATE, DELETE

### 3. 用戶自動創建 (INSERT)
```sql
CREATE POLICY "Allow user self creation" ON users
FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
```
- **作用**: 允許用戶為自己創建記錄（首次登入時）
- **限制**: 只能創建自己的記錄 (auth.uid() = id)

### 4. 用戶自我更新 (UPDATE)
```sql
CREATE POLICY "Users can update self" ON users
FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```
- **作用**: 用戶可以更新自己的資料
- **限制**: 只能更新自己的記錄

## 未來問題預防

### ✅ 新 Google 用戶登入
- 自動創建用戶記錄
- 立即出現在用戶管理列表
- 無需手動干預

### ✅ 權限管理
- 管理員: 完全控制
- 普通用戶: 只能管理自己
- 清晰的權限邊界

### ✅ 擴展性
- 新增管理員: 修改 email 列表
- 新增權限: 添加新政策
- 角色系統: 可基於 role 欄位擴展

## 可能的改進方向

1. **基於角色的權限**:
```sql
-- 未來可以改為基於 role 的權限
USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  OR auth.uid() = id
)
```

2. **更細緻的權限控制**:
- 財務只能查看，不能修改
- 主管可以查看下屬
- 業務只能看自己

3. **審計日誌**:
- 記錄誰修改了什麼
- 權限變更歷史

## 注意事項

- 政策按順序執行，第一個匹配的政策決定權限
- `USING` 用於 SELECT/UPDATE/DELETE 的條件檢查  
- `WITH CHECK` 用於 INSERT/UPDATE 的數據驗證
- 避免在政策中查詢同一個表（避免循環引用）