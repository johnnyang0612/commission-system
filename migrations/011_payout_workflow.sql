-- 分潤撥款工作流程
-- 支援：建立撥款 → 產生勞報單 → 員工簽名 → 會計審核 → 計入成本

-- 更新 labor_receipts 表，加入簽名流程欄位
ALTER TABLE labor_receipts
ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS signed_document_url TEXT,
ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS downloaded_by UUID,
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS payout_id UUID;

-- workflow_status 狀態說明:
-- pending: 待產生
-- pending_signature: 已產生，待簽名
-- downloaded: 員工已下載
-- signed: 已上傳簽名文件
-- approved: 會計審核通過，已計入成本
-- rejected: 會計駁回

COMMENT ON COLUMN labor_receipts.workflow_status IS '工作流程狀態: pending, pending_signature, downloaded, signed, approved, rejected';
COMMENT ON COLUMN labor_receipts.signed_document_url IS '已簽名文件的 Storage URL';
COMMENT ON COLUMN labor_receipts.downloaded_at IS '員工下載時間';
COMMENT ON COLUMN labor_receipts.signed_at IS '上傳簽名文件時間';
COMMENT ON COLUMN labor_receipts.approved_at IS '會計審核通過時間';
COMMENT ON COLUMN labor_receipts.approved_by IS '審核人';

-- 更新 commission_payouts 表，關聯勞報單和審核狀態
ALTER TABLE commission_payouts
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS counted_in_cost BOOLEAN DEFAULT false;

COMMENT ON COLUMN commission_payouts.is_approved IS '是否已審核通過';
COMMENT ON COLUMN commission_payouts.counted_in_cost IS '是否已計入專案成本';

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_labor_receipts_workflow ON labor_receipts(workflow_status);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_user ON labor_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_approved ON commission_payouts(is_approved);

-- 建立通知表（用於提醒員工有待簽收的勞報單）
CREATE TABLE IF NOT EXISTS payout_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    labor_receipt_id INTEGER REFERENCES labor_receipts(id),
    user_id UUID REFERENCES users(id),
    notification_type VARCHAR(50), -- pending_signature, reminder, approved
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_notifications_user ON payout_notifications(user_id, is_read);

ALTER TABLE payout_notifications DISABLE ROW LEVEL SECURITY;
