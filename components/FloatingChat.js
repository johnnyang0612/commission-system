import { useState, useEffect, useRef } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';
import { supabase } from '../utils/supabaseClient';

export default function FloatingChat() {
  const { user } = useSimpleAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!user) return null;

  async function sendMessage(text) {
    if (!text.trim() || loading) return;

    const userMsg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10),
          userId: user.id
        })
      });

      // SSE streaming
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = '';
      let actionResult = null;

      setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.type === 'delta') {
              aiText += data.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: aiText, streaming: true };
                return updated;
              });
            } else if (data.type === 'action_result') {
              actionResult = data;
            }
          } catch (e) {}
        }
      }

      // Finalize
      const cleanText = aiText.replace(/```action[\s\S]*?```/g, '').trim();
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: cleanText, actionResult, streaming: false };
        return updated;
      });

    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '回應失敗，請稍後再試。' }]);
    }

    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const quickActions = [
    { label: '本月收款', prompt: '查詢本月收款狀況' },
    { label: '待請款', prompt: '查詢待請款案件' },
    { label: '分潤統計', prompt: '分潤統計總覽' },
  ];

  return (
    <>
      {/* 浮動按鈕 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            color: 'white', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, transition: 'transform 0.2s'
          }}
          onMouseEnter={e => e.target.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.target.style.transform = 'scale(1)'}
        >
          🤖
        </button>
      )}

      {/* 聊天視窗 */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 380, height: 520, maxHeight: 'calc(100vh - 48px)',
          background: 'white', borderRadius: 16,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>川輝 AI 助理</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>有什麼可以幫你的？</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setMessages([]); }}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
              >清除</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>嗨 {user.name}！有什麼可以幫你的？</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {quickActions.map(q => (
                    <button
                      key={q.label}
                      onClick={() => sendMessage(q.prompt)}
                      style={{
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20,
                        padding: '6px 12px', fontSize: 12, color: '#475569', cursor: 'pointer'
                      }}
                    >{q.label}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#2563eb' : '#f1f5f9',
                  color: msg.role === 'user' ? 'white' : '#1e293b',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}>
                  {msg.content || (msg.streaming ? '...' : '')}
                </div>
                {msg.actionResult && (
                  <div style={{
                    maxWidth: '85%', marginTop: 4, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                    background: msg.actionResult.success ? '#ecfdf5' : '#fef2f2',
                    color: msg.actionResult.success ? '#065f46' : '#991b1b',
                    border: `1px solid ${msg.actionResult.success ? '#a7f3d0' : '#fecaca'}`
                  }}>
                    {msg.actionResult.success ? '✅' : '❌'} {msg.actionResult.message || (msg.actionResult.success ? '操作成功' : '操作失敗')}
                  </div>
                )}
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ background: '#f1f5f9', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 13 }}>
                  <span style={{ animation: 'pulse 1.5s infinite' }}>思考中...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息..."
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0',
                borderRadius: 24, fontSize: 13, outline: 'none'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: input.trim() && !loading ? '#2563eb' : '#e2e8f0',
                color: 'white', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
              }}
            >↑</button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}
