// 川輝AI助理 Help 指令
// 收到 help 時，用「私訊」單獨傳教學給使用者，不在群組內回覆

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

/**
 * 發送使用教學給使用者（私訊，不在群組內）
 * @param {string} userId - LINE User ID（私訊對象）
 * @param {string} replyToken - 回覆 token（用來在群組簡短回覆）
 * @param {string} topic - 可選的特定主題（meeting, email, qa, file, setup, all）
 */
export async function handleHelpCommand(userId, replyToken, topic = '') {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !userId) {
    console.warn('無法發送 help：缺少 token 或 userId');
    return;
  }

  // 先在群組簡短回覆，告知教學已私訊
  if (replyToken) {
    await replyToGroup(replyToken, '📖 使用教學已私訊給你囉！請查看與川輝AI助理的對話。');
  }

  // 判斷要發哪些主題
  const t = topic.toLowerCase().trim();
  const messages = [];

  if (!t || t === 'all' || t === '全部' || t === 'help') {
    // 發送完整教學（分多則訊息，LINE 單則上限 5000 字）
    messages.push(buildOverviewMessage());
    messages.push(buildMeetingMessage());
    messages.push(buildOtherCommandsMessage());
    messages.push(buildTipsMessage());
  } else if (t.includes('會議') || t.includes('meeting') || t.includes('meet')) {
    messages.push(buildMeetingMessage());
  } else if (t.includes('email') || t.includes('綁定') || t.includes('bind')) {
    messages.push(buildEmailMessage());
  } else if (t.includes('問') || t.includes('qa') || t.includes('問答') || t.includes('知識')) {
    messages.push(buildQAMessage());
  } else if (t.includes('檔案') || t.includes('file') || t.includes('取回') || t.includes('取檔')) {
    messages.push(buildFileMessage());
  } else if (t.includes('設定') || t.includes('setup')) {
    messages.push(buildSetupMessage());
  } else if (t.includes('提醒') || t.includes('remind')) {
    messages.push(buildReminderMessage());
  } else {
    // 不認識的主題，發全部
    messages.push(buildOverviewMessage());
    messages.push(buildMeetingMessage());
    messages.push(buildOtherCommandsMessage());
  }

  // 用 push message 私訊給使用者（不是群組）
  for (const msg of messages) {
    await pushPrivateMessage(userId, msg);
    // 避免發太快被 LINE 限速
    await sleep(300);
  }

  console.log(`📖 已私訊 ${messages.length} 則教學給 ${userId}`);
}

// ========== 教學訊息內容 ==========

function buildOverviewMessage() {
  return `📖 川輝AI助理 使用教學

嗨！我是川輝AI助理，你的智慧工作助手 👋

我可以在 LINE 群組裡幫你：

📅 會議管理
  建立、修改、取消 Google Meet 會議
  自動發日曆邀請、自動提醒

⏰ 任務提醒
  建立定時提醒，時間到了 @ 你

📧 Email 綁定
  幫群組成員綁定 Email

❓ 知識問答
  回答群組過去討論過的事情

📎 檔案取回
  找回 LINE 已過期的檔案

⚙️ 群組設定
  設定負責人、關聯專案

💡 輸入指令不需要死背格式，用自然語言說就行！

👇 接下來會傳各功能的詳細教學給你`;
}

function buildMeetingMessage() {
  return `📅 會議管理教學

▎建立會議
直接在群組輸入：

  /建立會議 明天 15:00 所有人
  /建立會議 4/15 14:00~15:30 王經理 Andy
  /會議 下周三 10:00

或用自然語言：
  「幫我建一個明天下午三點的會議」
  「約禮拜五早上10點開會 跟王經理」

▎參與者怎麼標記？

• 「所有人」「大家」「全部」
  → 群組內所有已登記的成員都會收到提醒

• 指定人名（空格分開）
  /建立會議 明天 15:00 王經理 Andy
  → 系統會自動模糊比對找到對應的人

• 不寫參與者
  /建立會議 明天 15:00
  → 預設等同「所有人」

📌 名字不用完全精確！系統支援：
  暱稱、部分名字、不分大小寫
  例如打「王經理」可以找到「王小明」
  打「andy」可以找到「Andy Yang」

📌 如果某個人名找不到：
  會議照常建立，只是那個人不會被 @ 提醒
  建議先用 /綁定 或後台「聯絡人管理」登記成員

▎建立後系統自動做什麼？
✅ 建立 Google Calendar 事件 + Meet 連結
✅ 有 Email 的參與者收到日曆邀請
✅ 前一天在群組 @ 所有參與者提醒（附待辦事項）
✅ 前一小時在群組 @ 所有參與者提醒（附 Meet 連結）

▎修改會議
  /修改會議 週三會議 改時間 4/16 14:00
  /修改會議 客戶會議 改標題 需求確認

或說：「把明天的會議延後一小時」

→ Google Calendar 會同步更新
→ 受邀者收到更新通知

▎取消會議
  /取消會議 週三會議
  /取消會議 客戶會議 原因：客戶有事

或說：「取消明天那個會議」

→ Google Calendar 事件會刪除
→ 受邀者收到取消通知

📌 日期：今天、明天、後天、下周一~日、4/15
📌 時間：15:00、下午3點、9點半、15:00~16:00`;
}

function buildEmailMessage() {
  return `📧 Email 綁定教學

綁定 Email 後，建立會議時就能自動收到 Google Calendar 邀請。

▎綁定自己的 Email
  /綁定 your@email.com

▎幫別人綁（需要管理者權限）
  /綁定 @王經理 wang@company.com

📌 綁定後的好處：
• 建立會議自動收到日曆邀請
• 會議提醒會同步到你的 Google Calendar
• 系統可以識別你的身份`;
}

function buildQAMessage() {
  return `❓ 知識問答教學

在群組裡標記我，我會根據群組歷史訊息、會議記錄、專案資料來回答。

▎使用方式
  @川輝AI助理 上次討論的結論是什麼？
  @川輝AI助理 王經理之前說的報價多少？
  /問 這個專案目前卡在哪裡？
  /問 上次會議的待辦事項

📌 我搜尋的資料來源：
• 群組近 100 則訊息
• 會議記錄（摘要、決議、待辦）
• 關聯的專案/商機資訊
• AI 自動摘要

📌 我不會瞎編答案。如果找不到，會直接說「找不到」。
📌 回答會標注來源（日期或文件名稱）。`;
}

function buildFileMessage() {
  return `📎 檔案取回教學

LINE 的檔案連結 7 天後會過期，但系統已經備份。

▎取回方式
1. 長按群組裡那則已過期的檔案訊息
2. 選「回覆」
3. 輸入：取回

就這樣！我會自動找到備份，傳下載連結給你。

也可以輸入「取檔」或「找檔」，效果一樣。

📌 注意：只有系統部署後的檔案才有備份。`;
}

function buildSetupMessage() {
  return `⚙️ 群組設定教學

設定群組的負責人和關聯的商機或專案。設定好之後，知識問答和會議功能會更準確。

▎設定負責人
  /設定 負責人=王小明
  /設定 @王小明

▎關聯商機
  /設定 洽談=ABC公司

▎關聯專案
  /設定 專案=PRJ001

▎設定群組類型
  /設定 類型=prospect

📌 可同時設定多項：
  /設定 負責人=王小明 洽談=ABC公司`;
}

function buildOtherCommandsMessage() {
  return `📋 其他功能教學

▎建立提醒
  /提醒 明天下午3點 跟客戶確認需求
  /提醒 下周五前 提供合約
  提醒我 今天18:00 寄報價單
  → 時間到了會在群組 @ 你提醒

▎查看提醒
  /查看提醒
  → 列出所有待發送的提醒

▎取消提醒
  /取消提醒 合約
  → 取消包含「合約」的提醒

▎綁定 Email
  /綁定 your@email.com
  → 讓建立會議時能自動寄日曆邀請

▎知識問答
  @川輝AI助理 [你的問題]
  /問 [你的問題]
  → 根據群組歷史回答問題

▎取回過期檔案
  （回覆已過期的檔案）取回
  → 從備份找回並傳下載連結

▎群組設定
  /設定 負責人=姓名 洽談=客戶名
  → 設定負責人和關聯專案`;
}

function buildTipsMessage() {
  return `💡 使用小技巧

1️⃣ 不用背指令格式
所有指令都支援自然語言，例如：
  「幫我建一個明天下午三點的會議」
  「取消明天的會議 客戶有事」
  「把會議改到後天」
  「提醒我明天要交報告」

2️⃣ 先綁 Email
綁好 Email 後建立會議才會收到日曆邀請。
  /綁定 your@email.com

3️⃣ 先設定群組
設定好關聯的商機/專案，知識問答會更準確。
  /設定 洽談=客戶名

4️⃣ 取回檔案要「回覆」
長按過期檔案 → 回覆 → 輸入「取回」

5️⃣ 遇到問題？
在群組輸入：@川輝AI助理 help
我會再私訊教學給你 📖

有特定主題的問題也可以：
  @川輝AI助理 help 會議
  @川輝AI助理 help email
  @川輝AI助理 help 問答
  @川輝AI助理 help 檔案
  @川輝AI助理 help 設定
  @川輝AI助理 help 提醒`;
}

function buildReminderMessage() {
  return `⏰ 任務提醒教學

在群組裡建立提醒，時間到了會自動在群組 @ 你。

▎建立提醒
  /提醒 明天下午3點 跟客戶確認需求
  /提醒 下周五前 提供合約
  /提醒 今天18:00 提供發票

或用自然語言：
  「提醒我明天要交報告」
  「記得下周一準備會議資料」
  「下周五前提醒提供合約」

▎提醒指定對象
  /提醒 @王經理 明天下午3點 確認需求
  /提醒 大家 明天交週報

▎查看提醒
  /查看提醒
  → 列出群組所有待發送的提醒

▎取消提醒
  /取消提醒 合約
  → 取消包含「合約」的提醒

  /取消提醒
  → 列出所有提醒，再用關鍵字取消

📌 時間到了系統會在群組推播提醒訊息
📌 支援自然語言，不用死背格式`;
}

// ========== LINE API 工具 ==========

async function replyToGroup(replyToken, text) {
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }]
      })
    });
  } catch (e) {
    console.error('群組回覆失敗:', e.message);
  }
}

async function pushPrivateMessage(userId, text) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,  // 直接推給個人，不是群組
        messages: [{ type: 'text', text: text.substring(0, 5000) }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('私訊推送失敗:', err.message || response.status);
    }
  } catch (e) {
    console.error('私訊推送錯誤:', e.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
