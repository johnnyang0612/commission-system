import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSimpleAuth } from '../utils/simpleAuth';

const quickActions = [
  { label: '查詢本月收款', prompt: '查詢本月收款狀況' },
  { label: '待請款案件', prompt: '查詢待請款案件' },
  { label: '分潤統計', prompt: '分潤統計總覽' },
  { label: '產生提案書', prompt: '產生提案書草稿' },
  { label: '建立新專案', prompt: '幫我建立一個新專案' },
  { label: '建立新商機', prompt: '幫我建立一個新商機' },
];

// 操作類型中文名稱
const ACTION_LABELS = {
  create_project: '建立專案',
  create_prospect: '建立商機',
  update_project_status: '更新專案狀態',
  update_milestone_status: '更新里程碑',
  generate_proposal: '產生文件',
  query_data: '資料查詢',
};

export default function AiChatPage() {
  const { user, loading } = useSimpleAuth();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // 自動捲動到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 頁面載入後聚焦輸入框
  useEffect(() => {
    if (!loading && user && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, user]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>載入中...</div>;
  if (!user) return null;

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isStreaming) return;

    const userMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // 加入空的 AI 訊息作為串流目標
    const aiMessage = { role: 'assistant', content: '', actionResult: null };
    setMessages([...updatedMessages, aiMessage]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages, // 傳送之前的歷史（不含當前訊息）
          userId: user.id
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API 錯誤 (${res.status})`);
      }

      // 讀取 SSE 串流
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (parsed.type === 'delta' && parsed.text) {
                fullText += parsed.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: fullText };
                  return copy;
                });
              } else if (parsed.type === 'action_result') {
                // 收到操作執行結果
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    ...copy[copy.length - 1],
                    content: fullText,
                    actionResult: {
                      success: parsed.success,
                      action: parsed.action,
                      message: parsed.message || null,
                      error: parsed.error || null,
                      data: parsed.data || null,
                    },
                  };
                  return copy;
                });
              } else if (parsed.type === 'error') {
                fullText += '\n\n[錯誤: ' + (parsed.error || '未知錯誤') + ']';
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: fullText };
                  return copy;
                });
              }
            } catch (e) {
              // 忽略
            }
          }
        }
      }

      // 若串流結束但沒有任何文字
      if (!fullText) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: '抱歉，AI 沒有回應。請稍後再試。' };
          return copy;
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('AI Chat error:', error);
      setMessages(prev => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'assistant') {
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: '抱歉，發生錯誤：' + error.message };
        } else {
          copy.push({ role: 'assistant', content: '抱歉，發生錯誤：' + error.message });
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (messages.length === 0) return;
    if (confirm('確定要清除所有對話紀錄？')) {
      setMessages([]);
    }
  };

  return (
    <div style={{
      maxWidth: 900,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 160px)',
      minHeight: 400,
    }}>
      {/* 標題區 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
            川輝 AI 助理
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
            詢問任何關於專案、付款、分潤的問題
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            style={{
              padding: '8px 16px',
              background: '#f1f5f9',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            清除對話
          </button>
        )}
      </div>

      {/* 快速操作按鈕 */}
      {messages.length === 0 && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10, fontWeight: 500 }}>
            快速操作
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(action.prompt)}
                disabled={isStreaming}
                style={{
                  padding: '8px 16px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  borderRadius: 20,
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  opacity: isStreaming ? 0.5 : 1,
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 對話區域 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        padding: 20,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 0,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            gap: 12,
          }}>
            <div style={{ fontSize: 48, opacity: 0.5 }}>AI</div>
            <div style={{ fontSize: 15, textAlign: 'center' }}>
              你好，{user.name || ''}！我是川輝AI助理。
              <br />
              有什麼我可以幫忙的嗎？
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 8,
            }}
          >
            {/* AI 頭像 */}
            {msg.role === 'assistant' && (
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
                marginTop: 2,
                fontWeight: 700,
                color: '#475569',
              }}>
                AI
              </div>
            )}

            {/* 訊息泡泡 */}
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user' ? '#2563eb' : '#f1f5f9',
                color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {/* 隱藏 action 區塊，只顯示自然語言部分 */}
                {msg.role === 'assistant'
                  ? msg.content.replace(/```action\s*\n[\s\S]*?\n```/g, '').trim()
                  : msg.content}
                {/* 串流中的游標 */}
                {isStreaming && idx === messages.length - 1 && msg.role === 'assistant' && (
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 16,
                    background: '#94a3b8',
                    marginLeft: 2,
                    verticalAlign: 'text-bottom',
                    animation: 'blink 1s step-end infinite',
                  }} />
                )}
              </div>
              {/* 操作執行結果卡片 */}
              {msg.actionResult && (
                <div style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: msg.actionResult.success
                    ? '1px solid #a7f3d0'
                    : '1px solid #fca5a5',
                  background: msg.actionResult.success
                    ? '#ecfdf5'
                    : '#fef2f2',
                  color: msg.actionResult.success
                    ? '#065f46'
                    : '#991b1b',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {msg.actionResult.success ? '✅' : '❌'}{' '}
                    {msg.actionResult.success ? '操作已執行' : '操作失敗'}
                    {msg.actionResult.action && (
                      <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>
                        ({ACTION_LABELS[msg.actionResult.action] || msg.actionResult.action})
                      </span>
                    )}
                  </div>
                  {msg.actionResult.success && msg.actionResult.message && (
                    <div>{msg.actionResult.message}</div>
                  )}
                  {!msg.actionResult.success && msg.actionResult.error && (
                    <div>{msg.actionResult.error}</div>
                  )}
                </div>
              )}
            </div>

            {/* 使用者頭像 */}
            {msg.role === 'user' && (
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                flexShrink: 0,
                marginTop: 2,
                color: 'white',
                fontWeight: 600,
              }}>
                {(user.name || 'U').charAt(0)}
              </div>
            )}
          </div>
        ))}

        {/* 思考中指示器 */}
        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 40 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'bounce 1.4s ease-in-out infinite', animationDelay: '0s' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>AI 思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 輸入區域 */}
      <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入訊息... (Enter 發送，Shift+Enter 換行)"
            disabled={isStreaming}
            rows={1}
            style={{
              width: '100%',
              padding: '12px 20px',
              border: '1px solid #d1d5db',
              borderRadius: 24,
              fontSize: 14,
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: 'auto',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
              background: isStreaming ? '#f9fafb' : 'white',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#2563eb'; }}
            onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; }}
            onInput={(e) => {
              // 自動調整高度
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
        </div>
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || isStreaming}
          style={{
            padding: '12px 24px',
            background: !input.trim() || isStreaming ? '#94a3b8' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 24,
            cursor: !input.trim() || isStreaming ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            transition: 'all 0.2s',
            flexShrink: 0,
            height: 46,
          }}
        >
          {isStreaming ? '回應中...' : '發送'}
        </button>
      </div>

      {/* 動畫 */}
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        textarea::placeholder {
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
