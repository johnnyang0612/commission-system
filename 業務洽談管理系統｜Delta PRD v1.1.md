# 業務洽談管理系統｜Delta PRD v1.1

**版本：** v1.1  
**建立日期：** 2025-08-15  
**負責單位：** 川輝科技

## 更新目的

- 重新加入**拖曳改變狀態（Kanban）**並與戰情室共存
- 強化業務個人任務管理（行動、追蹤、提醒）
- 完成手機版優化（單手操作、快速追蹤）

## A. 新增/調整的「視圖架構」

### A-1 兩大主視圖（可在同頁切換）

**戰情室（Priority View）：** 你目前的右詳情＋左清單，用「成交率高 → 追蹤日近 → 金額大」排序，專攻今日該追誰。

**管道看板（Kanban View）：** 可拖曳依「洽談階段」分欄（初談/提案/報價/談判/待簽約/贏單/輸單）。拖動卡片＝更新stage與updated_at。

**導航：** 上方加入視圖切換 Segmented Control：戰情室 | 管道看板。

### A-2 我的視角（非主管/老闆預設）

- **我的案件**（僅顯示owner_id=me）
- **我的任務**（所有追蹤行動的待辦清單）
- **我的檔案**（我上傳/我負責案件的附件）

主管/老闆可全域切換成「全部/某業務」。

## B. Kanban View（拖曳改變狀態）規格

### B-1 欄位

**欄：** 各洽談階段（可由設定管理新增/排序/停用）

**卡片最小資訊：**
- 成交率徽章（高/中/低）
- 客戶名 — 專案名
- 金額（千分位）
- 下次追蹤日期（倒數/逾期紅字）
- 競爭狀態小圖標（如有）

### B-2 互動

- **拖曳卡片：** 更新stage；若拖至「贏單/輸單」→ 彈出對話框要求填結果原因與贏/輸單日期
- **卡片快速動作（Hover/長按）：** 加行動、改追蹤日、調成交率、上傳附件
- **卡片排序：** 預設按next_follow_up_at ASC；可手動排序，寫入manual_order（同欄以此優先）

### B-3 快速篩選

成交率、高價案（>X萬）、我負責、來源、預算狀態。

## C. 業務個人任務（行動/追蹤）強化

### C-1 任務模型（跟案件分離，綁定案子）

```
activity_id, deal_id, owner_id, type(phone/meet/demo/quote/send), 
note, due_at, done_at, result(next/none/lost/defer), 
next_follow_up_at, created_at, updated_at
```

### C-2 任務清單（我的任務）

**分組：** 今天 / 即將到來（7天內） / 逾期 / 未排程

**列表每行：** [完成勾選] 標籤(電話/面談...) 客戶/案名 期限(倒數) 快捷：「改期」「完成並建立下次」

**完成動作：** 必填「追蹤結果」＋可一鍵「建立下次追蹤」→ 寫入next_follow_up_at與新activity。

**批次操作：** 多選→改期、指派、設成交率。

### C-3 提醒

- 到期/逾期推播：站內通知＋（可選）Email/LINE
- 久未更新案件（14天）→ 提醒負責人與顯示黃牌

## D. 手機版（Responsive）規格

### D-1 版面

**底部導覽列：** 戰情室 | 看板 | 任務 | 搜尋 | 我的

**戰情室：** 改為雙層列表
- 上：今日/逾期/即將的卡片分頁
- 下：點卡片展開「核心資訊＋快捷動作」

**看板：** 橫向滑動欄、縱向列表卡片；長按拖曳換欄。

**任務：** 支援左滑快速動作（完成/改期）。

### D-2 快捷操作（單手）

- **卡片右上三點** → 改追蹤日（日期快捷鍵：+1、+3、下週一）、加行動、上傳附件
- **日期選擇器**改成底部抽屜式，單手可點

## E. 視覺與優先提示

- **成交率徽章：** 高=紅、中=橘、低=灰
- **追蹤倒數：**
  - 今日：橙色「今」
  - 逾期：紅色「逾期X天」
  - 3日內：顯示「3」「2」「1」
- **優先池：** 金額>門檻且成交率高 → 卡片右上星標
- **久未更新：** 卡片左側黃條（>14天）

## F. 後端資料結構增補

### F-1 deals（新增/補欄）
```
deal_id, customer_name, project_name, amount,
stage, stage_updated_at,
probability_label (high|mid|low),
budget_fit (fit|insufficient|too_low),
next_follow_up_at, last_activity_at,
owner_id, source, competitor, obstacles[],
payment_terms, expected_close_date,
opportunity_amount, manual_order, created_at, updated_at
```

### F-2 activities（見 C-1）

### F-3 attachments
```
attachment_id, deal_id, uploader_id, file_name, mime, size, url, created_at
```

## G. API 端點（示意）

- `GET /deals?view=priority|kanban&owner=me|all&filters=...`
- `PATCH /deals/:id`（允許：stage, probability_label, next_follow_up_at, manual_order…）
- `POST /activities` / `PATCH /activities/:id` / `GET /activities?owner=me&status=open`
- `POST /attachments`（multipart）
- 通知：`POST /notifications/test`（開發內測用）

## H. 權限

- **業務：** 讀寫自己的deals/activities/attachments；看板僅顯示自己
- **主管：** 讀寫所屬成員；可全域篩選
- **老闆：** 全域讀
- **財務：** 只讀amount/opportunity_amount/expected_close_date與報表

## I. 事件追蹤（前端埋點）

- view_switch（priority↔kanban）
- drag_stage（from_stage, to_stage）
- create_activity / complete_activity
- change_followup_date
- mobile_swipe_action

## J. 驗收條件（必過清單）

- **拖曳改變狀態：** 看板拖卡→後端stage與stage_updated_at更新成功
- **任務閉環：** 完成任務必可直接新建下次追蹤，列表即時更新
- **優先排序（戰情室）：** 相同條件時以next_follow_up_at→amount→updated_at
- **提醒送達：** 到期與逾期在1分鐘內觸發站內通知
- **手機單手可用：** 底部導覽、生效的長按拖曳、左滑操作
- **權限正確：** 業務不可見他人案件；主管可切換成員；老闆全域
- **附件：** 支援PDF/JPG/PNG/DOCX/XLSX，上傳後可於案件詳情下載/刪除（權限內）

## K. 發布策略

1. **先上** 看板視圖 + 任務清單（影響最大）
2. **第二波：** 手機版左滑/長按拖曳優化與提醒推播
3. **第三波：** 阻力/競爭對手報表與自動優先池策略

---

## JSON Schema 規格

### 1. Kanban 視圖 JSON Schema

```json
{
  "view": "kanban",
  "title": "洽談管道看板",
  "data_source": {
    "fetch": {
      "method": "GET",
      "url": "/deals?view=kanban&owner={owner}&filters={filters}"
    },
    "update_stage": {
      "method": "PATCH",
      "url": "/deals/{deal_id}",
      "body": { "stage": "{to_stage}" }
    },
    "update_manual_order": {
      "method": "PATCH",
      "url": "/deals/{deal_id}",
      "body": { "manual_order": "{index}" }
    }
  },
  "filters": [
    { "key": "probability_label", "type": "select", "options": ["high", "mid", "low"], "label": "成交率" },
    { "key": "budget_fit", "type": "select", "options": ["fit", "insufficient", "too_low"], "label": "預算" },
    { "key": "owner_id", "type": "user", "label": "負責人", "default": "me" },
    { "key": "source", "type": "select", "options": ["ads", "referral", "cold", "event"], "label": "來源" },
    { "key": "amount_min", "type": "number", "label": "最低金額" }
  ],
  "columns": [
    { "id": "lead", "title": "初談" },
    { "id": "proposal", "title": "提案" },
    { "id": "quote", "title": "報價" },
    { "id": "negotiation", "title": "談判" },
    { "id": "pending_sign", "title": "待簽約" },
    { "id": "won", "title": "贏單", "terminal": true },
    { "id": "lost", "title": "輸單", "terminal": true }
  ],
  "card": {
    "key": "deal_id",
    "primary": "{customer_name} - {project_name}",
    "badges": [
      { "type": "label", "field": "probability_label", "map": { "high": "高", "mid": "中", "low": "低" } },
      { "type": "money", "field": "amount", "prefix": "NT$ " },
      { "type": "countdown", "field": "next_follow_up_at", "label": "追蹤", "overdue_color": "red", "soon_threshold_days": 3 },
      { "type": "date", "field": "expected_close_date", "label": "簽約" },
      { "type": "icon", "field": "competitor", "icon": "target", "show_when_not_empty": true },
      { "type": "star", "condition": "amount>500000 && probability_label=='high'", "label": "優先" }
    ],
    "subtitle": "{stage_display}｜更新：{last_activity_at}",
    "quick_actions": [
      { "id": "new_activity", "label": "加行動", "icon": "plus", "action": { "open_drawer": "activity_form" } },
      { "id": "set_next_followup", "label": "改追蹤日", "icon": "calendar", "action": { "open_datepicker": "next_follow_up_at" } },
      { "id": "set_probability", "label": "調成交率", "icon": "gauge", "action": { "select": ["high", "mid", "low"] } },
      { "id": "upload_attachment", "label": "上傳附件", "icon": "paperclip", "action": { "upload_to": "/attachments?deal_id={deal_id}" } }
    ],
    "sort_in_column": [
      { "field": "next_follow_up_at", "order": "asc" },
      { "field": "amount", "order": "desc" },
      { "field": "updated_at", "order": "desc" }
    ]
  },
  "drag_rules": {
    "on_drop": {
      "default": { "update": "stage" },
      "to_terminal": {
        "open_modal": "closing_form",
        "require_fields": ["closing_result_reason", "closed_at"]
      }
    }
  },
  "forms": {
    "activity_form": {
      "title": "新增行動",
      "submit": { "method": "POST", "url": "/activities" },
      "fields": [
        { "name": "deal_id", "type": "hidden", "value": "{deal_id}" },
        { "name": "type", "type": "select", "options": ["phone", "meet", "demo", "quote", "send"] },
        { "name": "note", "type": "textarea", "placeholder": "行動內容…" },
        { "name": "due_at", "type": "datetime", "required": true },
        { "name": "next_follow_up_at", "type": "datetime", "helper": "完成後若需下次追蹤，請預約" },
        { "name": "attachments", "type": "file", "accept": ["pdf","jpg","png","docx","xlsx"], "multiple": true }
      ]
    },
    "closing_form": {
      "title": "結案資訊",
      "submit": { "method": "PATCH", "url": "/deals/{deal_id}" },
      "fields": [
        { "name": "stage", "type": "hidden", "value": "{to_stage}" },
        { "name": "closed_at", "type": "date", "required": true },
        { "name": "closing_result_reason", "type": "select", "options": ["price", "timeline", "feature", "budget", "no_need", "other"], "required": true },
        { "name": "note", "type": "textarea" }
      ]
    }
  }
}
```

### 2. 戰情室（優先清單）JSON Schema

```json
{
  "view": "priority",
  "title": "業務戰情室",
  "data_source": {
    "method": "GET",
    "url": "/deals?view=priority&owner={owner}&filters={filters}"
  },
  "kpis": [
    { "id": "pipeline_sum", "label": "總 PIPELINE 估值", "field": "sum(opportunity_amount)" },
    { "id": "expected_month", "label": "預估分潤", "field": "sum(opportunity_amount*commission_rate)" }
  ],
  "filters": [
    { "key": "probability_label", "type": "segmented", "options": ["all","high","mid","low"], "default": "all" },
    { "key": "owner_id", "type": "user", "default": "me" },
    { "key": "stage", "type": "select", "options": ["lead","proposal","quote","negotiation","pending_sign"] },
    { "key": "source", "type": "select", "options": ["ads","referral","cold","event"] }
  ],
  "list": {
    "item_key": "deal_id",
    "primary": "{customer_name} - {project_name}",
    "meta": [
      "NT$ {amount}",
      "簽約：{expected_close_date}",
      "追蹤：{next_follow_up_at}（{countdown}）"
    ],
    "badges": [
      { "type": "label", "field": "probability_label" },
      { "type": "flag", "condition": "amount>500000 && probability_label=='high'", "label": "優先" },
      { "type": "warning", "condition": "is_overdue(next_follow_up_at)", "label": "逾期" }
    ],
    "sort": [
      { "field": "probability_label", "order": "desc", "custom_order": ["high","mid","low"] },
      { "field": "next_follow_up_at", "order": "asc" },
      { "field": "amount", "order": "desc" },
      { "field": "updated_at", "order": "desc" }
    ],
    "selection": { "multi": true, "bulk_actions": ["reschedule","assign","set_probability"] },
    "on_select_show_panels": ["deal_detail","activity_timeline"]
  },
  "panels": {
    "deal_detail": {
      "title": "案件詳情",
      "sections": [
        { "title": "基本資訊", "fields": ["customer_name","project_name","probability_label","budget_fit","stage","amount","payment_terms","expected_close_date"] },
        { "title": "決策鏈", "fields": ["decision_maker","decision_maker_title","decision_maker_contact","influencers[]","decision_power"] },
        { "title": "阻力與需求", "fields": ["pain_points[]","obstacles[]","competitor","competitor_status"] }
      ],
      "actions": [
        { "id": "edit", "label": "編輯", "open_drawer": "deal_edit_form" },
        { "id": "new_activity", "label": "新增行動", "open_drawer": "activity_form" }
      ]
    },
    "activity_timeline": {
      "title": "行動追蹤紀錄",
      "data_source": { "method": "GET", "url": "/activities?deal_id={deal_id}" },
      "item_view": "{created_at}｜{type}｜{note}｜附件{attachments_count}",
      "quick": [
        { "id": "complete_and_next", "label": "完成並建立下次", "open_drawer": "activity_complete_form" }
      ]
    }
  }
}
```

### 3. 我的任務清單 JSON Schema

```json
{
  "view": "tasks",
  "title": "我的任務",
  "data_source": { "method": "GET", "url": "/activities?owner=me&status=open" },
  "groups": [
    { "id": "overdue", "title": "逾期", "condition": "is_overdue(due_at)" },
    { "id": "today", "title": "今天", "condition": "is_today(due_at)" },
    { "id": "soon", "title": "即將到來（7天內）", "condition": "in_days(due_at,7)" },
    { "id": "unscheduled", "title": "未排程", "condition": "is_null(due_at)" }
  ],
  "row_view": {
    "primary": "{deal.customer_name} - {deal.project_name}",
    "badges": [{ "type": "label", "field": "type" }],
    "meta": ["到期：{due_at}（{countdown}）", "{note}"],
    "swipe_actions_mobile": [
      { "id": "complete", "label": "完成", "method": "PATCH", "url": "/activities/{activity_id}", "body": { "done_at": "{now}" } },
      { "id": "reschedule", "label": "改期", "open_datepicker": "due_at" }
    ],
    "quick_actions_desktop": [
      { "id": "complete_and_next", "label": "完成+下次", "open_drawer": "activity_complete_form" },
      { "id": "edit", "label": "編輯", "open_drawer": "activity_edit_form" }
    ]
  },
  "bulk_actions": [
    { "id": "bulk_reschedule", "label": "批次改期", "open_datepicker": "due_at" },
    { "id": "bulk_assign", "label": "指派", "select_user": "owner_id" }
  ]
}
```

### 4. 事件／通知 & API 映射

```json
[
  { "event": "view_switch", "props": { "to": "kanban|priority|tasks" } },
  { "event": "drag_stage", "props": { "deal_id": "ID", "from": "stage", "to": "stage" } },
  { "event": "create_activity", "props": { "deal_id": "ID", "type": "phone|meet|..." } },
  { "event": "complete_activity", "props": { "activity_id": "ID" } },
  { "event": "change_followup_date", "props": { "deal_id": "ID", "next_follow_up_at": "ISO" } }
]
```

## 通知觸發（後端 Cron/Job）

- `next_follow_up_at <= now` → 通知 owner_id
- `expected_close_date - 7d == today` → 通知 owner_id
- `updated_at > 14d`（無活動）→ 黃牌通知 owner_id
- 高價案（`amount > threshold` 且 `probability_label='high'`）→ 標記優先

## 主要 API

- `GET /deals`
- `PATCH /deals/:id`
- `POST /activities`
- `PATCH /activities/:id`
- `GET /activities`
- `POST /attachments`
- `GET /attachments?deal_id=:id`

## 範例資料（可直接測試）

```json
{
  "deals": [
    {
      "deal_id": "D-1001",
      "customer_name": "宏達科技",
      "project_name": "LINE CRM 導入",
      "amount": 700000,
      "stage": "quote",
      "stage_updated_at": "2025-08-10T09:00:00Z",
      "probability_label": "high",
      "budget_fit": "fit",
      "next_follow_up_at": "2025-08-20T02:00:00Z",
      "last_activity_at": "2025-08-15T05:30:00Z",
      "owner_id": "u_amy",
      "source": "referral",
      "competitor": "VendorX",
      "obstacles": ["price"],
      "payment_terms": "3 terms",
      "expected_close_date": "2025-10-31",
      "opportunity_amount": 700000,
      "manual_order": 1,
      "created_at": "2025-08-01T02:00:00Z",
      "updated_at": "2025-08-15T05:30:00Z"
    }
  ],
  "activities": [
    {
      "activity_id": "A-9001",
      "deal_id": "D-1001",
      "owner_id": "u_amy",
      "type": "phone",
      "note": "客戶要求 5% 折扣，待主管回覆",
      "due_at": "2025-08-20T02:00:00Z",
      "done_at": null,
      "result": null,
      "next_follow_up_at": null,
      "created_at": "2025-08-15T03:00:00Z",
      "updated_at": "2025-08-15T03:00:00Z"
    }
  ]
}
```

