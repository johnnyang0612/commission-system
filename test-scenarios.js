// 戰情室功能測試腳本
// 請在瀏覽器控制台中執行這些測試

console.log('🚀 開始戰情室功能測試...');

// 測試1: 檢查三分區布局
function testLayout() {
  console.log('📐 測試1: 檢查三分區布局');
  
  const leftPanel = document.querySelector('.warRoomContainer .leftPanel');
  const rightTop = document.querySelector('.warRoomContainer .rightTop');
  const rightBottom = document.querySelector('.warRoomContainer .rightBottom');
  
  console.log('左側面板:', leftPanel ? '✅ 存在' : '❌ 缺失');
  console.log('右上面板:', rightTop ? '✅ 存在' : '❌ 缺失');
  console.log('右下面板:', rightBottom ? '✅ 存在' : '❌ 缺失');
  
  return leftPanel && rightTop && rightBottom;
}

// 測試2: 檢查通知系統
function testNotificationSystem() {
  console.log('🔔 測試2: 檢查通知系統');
  
  const bellButton = document.querySelector('.bellButton');
  const notificationBadge = document.querySelector('.notificationBadge');
  
  console.log('通知鈴鐺:', bellButton ? '✅ 存在' : '❌ 缺失');
  console.log('通知徽章:', notificationBadge ? '✅ 存在' : '❌ 缺失');
  
  // 模擬點擊通知鈴鐺
  if (bellButton) {
    bellButton.click();
    setTimeout(() => {
      const dropdown = document.querySelector('.notificationDropdown');
      console.log('通知下拉選單:', dropdown ? '✅ 顯示正常' : '❌ 未顯示');
    }, 100);
  }
  
  return bellButton && notificationBadge;
}

// 測試3: 檢查案件卡片
function testProspectCards() {
  console.log('📋 測試3: 檢查案件卡片');
  
  const cards = document.querySelectorAll('.prospectCard');
  console.log(`案件卡片數量: ${cards.length}`);
  
  if (cards.length > 0) {
    const firstCard = cards[0];
    const closeRateTag = firstCard.querySelector('.closeRateTag');
    const clientName = firstCard.querySelector('.clientName');
    const amount = firstCard.querySelector('.amount');
    
    console.log('成交率標籤:', closeRateTag ? '✅ 存在' : '❌ 缺失');
    console.log('客戶名稱:', clientName ? '✅ 存在' : '❌ 缺失');
    console.log('預估金額:', amount ? '✅ 存在' : '❌ 缺失');
    
    return closeRateTag && clientName && amount;
  }
  
  return false;
}

// 測試4: 檢查行動追蹤系統
function testActionTracking() {
  console.log('⏱️ 測試4: 檢查行動追蹤系統');
  
  const timeline = document.querySelector('.timeline');
  const addActionButton = document.querySelector('.addActionButton');
  
  console.log('時間軸:', timeline ? '✅ 存在' : '❌ 缺失');
  console.log('新增行動按鈕:', addActionButton ? '✅ 存在' : '❌ 缺失');
  
  return timeline && addActionButton;
}

// 測試5: 檢查協助請求系統
function testAssistanceRequest() {
  console.log('🆘 測試5: 檢查協助請求系統');
  
  const requestButton = document.querySelector('.requestAssistanceButton');
  
  console.log('協助請求按鈕:', requestButton ? '✅ 存在' : '❌ 缺失');
  
  // 模擬點擊協助請求按鈕
  if (requestButton) {
    requestButton.click();
    setTimeout(() => {
      const modal = document.querySelector('.assistanceModal');
      console.log('協助請求模態框:', modal ? '✅ 顯示正常' : '❌ 未顯示');
    }, 100);
  }
  
  return requestButton;
}

// 測試6: 檢查檔案上傳系統
function testFileUpload() {
  console.log('📎 測試6: 檢查檔案上傳系統');
  
  const fileInput = document.querySelector('input[type="file"]');
  const fileList = document.querySelector('.fileList');
  
  console.log('檔案輸入:', fileInput ? '✅ 存在' : '❌ 缺失');
  console.log('檔案列表:', fileList ? '✅ 存在' : '❌ 缺失');
  
  return fileInput && fileList;
}

// 測試7: 檢查篩選功能
function testFilterSystem() {
  console.log('🔍 測試7: 檢查篩選功能');
  
  const filterSection = document.querySelector('.filterSection');
  const closeRateFilter = document.querySelector('select[value*="closeRate"]');
  const assigneeFilter = document.querySelector('select[value*="assignee"]');
  
  console.log('篩選區域:', filterSection ? '✅ 存在' : '❌ 缺失');
  console.log('成交率篩選:', closeRateFilter ? '✅ 存在' : '❌ 缺失');
  console.log('負責人篩選:', assigneeFilter ? '✅ 存在' : '❌ 缺失');
  
  return filterSection;
}

// 執行所有測試
function runAllTests() {
  console.log('===============================');
  console.log('🧪 戰情室功能完整測試開始');
  console.log('===============================');
  
  const results = {
    layout: testLayout(),
    notification: testNotificationSystem(),
    cards: testProspectCards(),
    actions: testActionTracking(),
    assistance: testAssistanceRequest(),
    files: testFileUpload(),
    filters: testFilterSystem()
  };
  
  console.log('===============================');
  console.log('📊 測試結果總覽');
  console.log('===============================');
  
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${test}: ${result ? '✅ 通過' : '❌ 失敗'}`);
  });
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  console.log(`===============================`);
  console.log(`總測試: ${totalTests}, 通過: ${passedTests}, 失敗: ${totalTests - passedTests}`);
  console.log(`成功率: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('===============================');
  
  return results;
}

// 自動執行測試
setTimeout(runAllTests, 2000);

// 手動測試說明
console.log(`
📖 手動測試說明:
1. 確認頁面載入完成後執行 runAllTests()
2. 測試案件選擇: 點擊左側任意案件卡片
3. 測試新增行動: 點擊右下方新增行動按鈕
4. 測試檔案上傳: 選擇檔案並上傳
5. 測試協助請求: 點擊協助請求按鈕並填寫表單
6. 測試通知系統: 點擊右上角鈴鐺圖示
7. 測試篩選功能: 使用左側篩選控制項

🔧 除錯指令:
- console.log('當前 prospects:', window.prospects)
- console.log('當前 notifications:', window.notifications)
- console.log('選中的案件:', window.selectedProspect)
`);