import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

export default function Meetings() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [meetings, setMeetings] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  // 上傳表單狀態
  const [uploadForm, setUploadForm] = useState({
    title: '',
    meeting_date: new Date().toISOString().slice(0, 16),
    participants: '',
    content: ''
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      fetchMeetings();
      fetchProspects();
    }
  }, [authLoading, user]);

  async function fetchMeetings() {
    setLoading(true);
    try {
      let query = supabase
        .from('meeting_records')
        .select(`
          *,
          prospects:prospect_id(id, client_name, project_name, stage),
          projects:project_id(id, client_name, project_name),
          users:user_id(id, name)
        `);

      // 業務角色只能看到自己的會議紀錄
      if (user && user.role === 'sales') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query.order('meeting_date', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (error) {
      console.error('取得會議紀錄錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProspects() {
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, client_name, project_name, stage')
        .in('stage', ['初談', '提案', '報價', '談判', '待簽約'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('取得洽談案錯誤:', error);
    }
  }

  // AI 分析會議內容
  async function handleAnalyze() {
    if (!uploadForm.content.trim()) {
      alert('請先貼上會議紀錄內容');
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      const response = await fetch('/api/meetings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: uploadForm.content,
          meeting_title: uploadForm.title,
          meeting_date: uploadForm.meeting_date,
          participants: uploadForm.participants
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '分析失敗');
      }

      setAnalysisResult(result.analysis);

      // 如果 AI 識別出標題，自動填入
      if (!uploadForm.title && result.analysis.matched_name) {
        setUploadForm(prev => ({
          ...prev,
          title: `${result.analysis.matched_name} 會議`
        }));
      }
    } catch (error) {
      console.error('AI 分析錯誤:', error);
      alert('AI 分析失敗: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  }

  // 儲存會議紀錄
  async function handleSave() {
    if (!uploadForm.title || !uploadForm.meeting_date) {
      alert('請填寫會議標題和日期');
      return;
    }

    setSaving(true);

    try {
      const meetingData = {
        title: uploadForm.title,
        meeting_date: uploadForm.meeting_date,
        participants: uploadForm.participants,
        raw_content: uploadForm.content,
        transcript: uploadForm.content,
        user_id: user?.id,
        source: 'manual',
        status: analysisResult ? 'analyzed' : 'pending'
      };

      // 如果有 AI 分析結果，加入
      if (analysisResult) {
        meetingData.summary = analysisResult.summary;
        meetingData.key_points = analysisResult.key_points;
        meetingData.action_items = analysisResult.action_items;
        meetingData.ai_matched_prospect_id = analysisResult.matched_type === 'prospect' ? analysisResult.matched_id : null;
        meetingData.ai_match_confidence = analysisResult.match_confidence;
        meetingData.ai_match_reason = analysisResult.match_reason;
        meetingData.ai_stage_suggestion = analysisResult.stage_suggestion;
        meetingData.ai_sentiment = analysisResult.sentiment;
        meetingData.ai_close_probability = analysisResult.close_probability;
        meetingData.ai_next_steps = analysisResult.next_steps;
        meetingData.ai_client_concerns = analysisResult.client_concerns;
        meetingData.ai_decisions = analysisResult.decisions;

        // 如果 AI 配對到洽談案，直接關聯
        if (analysisResult.matched_type === 'prospect' && analysisResult.matched_id) {
          meetingData.prospect_id = analysisResult.matched_id;
        }
      }

      const response = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meetingData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '儲存失敗');
      }

      alert('會議紀錄已儲存！');
      setShowUploadModal(false);
      resetForm();
      fetchMeetings();
    } catch (error) {
      console.error('儲存錯誤:', error);
      alert('儲存失敗: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setUploadForm({
      title: '',
      meeting_date: new Date().toISOString().slice(0, 16),
      participants: '',
      content: ''
    });
    setAnalysisResult(null);
  }

  // 格式化日期
  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 情緒標籤顏色
  function getSentimentColor(sentiment) {
    switch (sentiment) {
      case 'positive': return '#10b981';
      case 'negative': return '#ef4444';
      default: return '#6b7280';
    }
  }

  // 成交機率顏色
  function getProbabilityColor(probability) {
    switch (probability) {
      case 'high': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'low': return '#ef4444';
      default: return '#6b7280';
    }
  }

  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>;
  }

  return (
    <div style={{ padding: '0' }}>
      {/* 頁面標題 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📝 會議紀錄</h1>
          <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            上傳 Seameet 會議紀錄，AI 自動分析並配對洽談案
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500'
          }}
        >
          + 上傳會議紀錄
        </button>
      </div>

      {/* 會議紀錄列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          載入中...
        </div>
      ) : meetings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          color: '#666'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <p>還沒有會議紀錄</p>
          <p style={{ fontSize: '0.9rem' }}>點擊「上傳會議紀錄」開始使用</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {meetings.map(meeting => (
            <div
              key={meeting.id}
              onClick={() => setSelectedMeeting(meeting)}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
                border: '1px solid #e5e7eb'
              }}
              onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
              onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{meeting.title}</h3>
                    {meeting.ai_sentiment && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        backgroundColor: getSentimentColor(meeting.ai_sentiment) + '20',
                        color: getSentimentColor(meeting.ai_sentiment)
                      }}>
                        {meeting.ai_sentiment === 'positive' ? '😊 正面' :
                         meeting.ai_sentiment === 'negative' ? '😟 負面' : '😐 中性'}
                      </span>
                    )}
                    {meeting.ai_close_probability && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        backgroundColor: getProbabilityColor(meeting.ai_close_probability) + '20',
                        color: getProbabilityColor(meeting.ai_close_probability)
                      }}>
                        成交: {meeting.ai_close_probability === 'high' ? '高' :
                               meeting.ai_close_probability === 'medium' ? '中' : '低'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem' }}>
                    <span>📅 {formatDate(meeting.meeting_date)}</span>
                    {meeting.prospects && (
                      <span>🎯 {meeting.prospects.client_name} / {meeting.prospects.project_name}</span>
                    )}
                    {meeting.users && (
                      <span>👤 {meeting.users.name}</span>
                    )}
                  </div>

                  {meeting.summary && (
                    <p style={{
                      margin: 0,
                      fontSize: '0.9rem',
                      color: '#374151',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {meeting.summary}
                    </p>
                  )}
                </div>

                {meeting.ai_stage_suggestion && (
                  <div style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '500'
                  }}>
                    建議: {meeting.ai_stage_suggestion}
                  </div>
                )}
              </div>

              {/* 行動項目預覽 */}
              {meeting.action_items && meeting.action_items.length > 0 && (
                <div style={{
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#666' }}>
                    📋 {meeting.action_items.length} 個行動項目
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 上傳 Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '900px',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>📤 上傳會議紀錄</h2>
              <button
                onClick={() => { setShowUploadModal(false); resetForm(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: analysisResult ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
              {/* 左側: 輸入區 */}
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    會議標題
                  </label>
                  <input
                    type="text"
                    value={uploadForm.title}
                    onChange={e => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="例: ABC公司 專案討論會議"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      會議日期時間
                    </label>
                    <input
                      type="datetime-local"
                      value={uploadForm.meeting_date}
                      onChange={e => setUploadForm(prev => ({ ...prev, meeting_date: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      參與者
                    </label>
                    <input
                      type="text"
                      value={uploadForm.participants}
                      onChange={e => setUploadForm(prev => ({ ...prev, participants: e.target.value }))}
                      placeholder="例: 王經理, 李專員, Johnny"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    會議紀錄內容 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem' }}>
                    從 Seameet 複製會議紀錄貼上
                  </p>
                  <textarea
                    value={uploadForm.content}
                    onChange={e => setUploadForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="在此貼上 Seameet 的會議逐字稿或摘要..."
                    rows={12}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || !uploadForm.content.trim()}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: analyzing ? '#9ca3af' : '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: analyzing ? 'wait' : 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500'
                    }}
                  >
                    {analyzing ? '🔄 AI 分析中...' : '🤖 AI 分析'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !uploadForm.title || !uploadForm.meeting_date}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: saving ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500'
                    }}
                  >
                    {saving ? '儲存中...' : '💾 儲存'}
                  </button>
                </div>
              </div>

              {/* 右側: AI 分析結果 */}
              {analysisResult && (
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  overflowY: 'auto',
                  maxHeight: '600px'
                }}>
                  <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🤖 AI 分析結果
                  </h3>

                  {/* 配對結果 */}
                  <div style={{
                    backgroundColor: analysisResult.matched_id ? '#dcfce7' : '#fef3c7',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                      {analysisResult.matched_id
                        ? `✅ 配對到: ${analysisResult.matched_name}`
                        : analysisResult.is_new_client
                          ? '🆕 新客戶'
                          : '❓ 無法確定客戶'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                      {analysisResult.match_reason}
                    </div>
                    {analysisResult.match_confidence && (
                      <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                        信心度: {Math.round(analysisResult.match_confidence * 100)}%
                      </div>
                    )}
                  </div>

                  {/* 新客戶資訊 */}
                  {analysisResult.is_new_client && analysisResult.new_client_info && (
                    <div style={{
                      backgroundColor: '#dbeafe',
                      padding: '1rem',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>📋 新客戶資訊</div>
                      <div style={{ fontSize: '0.9rem' }}>
                        <div>公司: {analysisResult.new_client_info.company_name}</div>
                        <div>聯絡人: {analysisResult.new_client_info.contact_name} {analysisResult.new_client_info.contact_title}</div>
                        <div>聯絡方式: {analysisResult.new_client_info.contact_info}</div>
                      </div>
                    </div>
                  )}

                  {/* 摘要 */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>📝 會議摘要</div>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                      {analysisResult.summary}
                    </p>
                  </div>

                  {/* 重點 */}
                  {analysisResult.key_points && analysisResult.key_points.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>💡 重點</div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                        {analysisResult.key_points.map((point, i) => (
                          <li key={i} style={{ marginBottom: '0.25rem' }}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 行動項目 */}
                  {analysisResult.action_items && analysisResult.action_items.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>📋 行動項目</div>
                      {analysisResult.action_items.map((item, i) => (
                        <div key={i} style={{
                          backgroundColor: 'white',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          marginBottom: '0.5rem',
                          fontSize: '0.9rem'
                        }}>
                          <div style={{ fontWeight: '500' }}>{item.task}</div>
                          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                            負責: {item.assignee} {item.due_date && `| 期限: ${item.due_date}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 階段建議 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{
                      backgroundColor: '#dbeafe',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: '#1d4ed8' }}>建議階段</div>
                      <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{analysisResult.stage_suggestion}</div>
                    </div>
                    <div style={{
                      backgroundColor: getSentimentColor(analysisResult.sentiment) + '20',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: getSentimentColor(analysisResult.sentiment) }}>客戶情緒</div>
                      <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
                        {analysisResult.sentiment === 'positive' ? '😊 正面' :
                         analysisResult.sentiment === 'negative' ? '😟 負面' : '😐 中性'}
                      </div>
                    </div>
                  </div>

                  {/* 成交機率 */}
                  <div style={{
                    backgroundColor: getProbabilityColor(analysisResult.close_probability) + '20',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: getProbabilityColor(analysisResult.close_probability) }}>
                      成交機率
                    </div>
                    <div style={{
                      fontWeight: '600',
                      color: getProbabilityColor(analysisResult.close_probability)
                    }}>
                      {analysisResult.close_probability === 'high' ? '🔥 高' :
                       analysisResult.close_probability === 'medium' ? '⚡ 中' : '❄️ 低'}
                      {analysisResult.close_probability_reason && (
                        <span style={{ fontWeight: '400', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                          - {analysisResult.close_probability_reason}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 下一步建議 */}
                  {analysisResult.next_steps && (
                    <div style={{
                      backgroundColor: '#f0fdf4',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>➡️ 建議下一步</div>
                      <div style={{ fontSize: '0.9rem' }}>{analysisResult.next_steps}</div>
                    </div>
                  )}

                  {/* 風險提醒 */}
                  {analysisResult.risk_alerts && analysisResult.risk_alerts.length > 0 && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      padding: '0.75rem',
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#dc2626' }}>
                        ⚠️ 風險提醒
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: '#7f1d1d' }}>
                        {analysisResult.risk_alerts.map((alert, i) => (
                          <li key={i}>{alert}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 會議詳情 Modal */}
      {selectedMeeting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>{selectedMeeting.title}</h2>
              <button
                onClick={() => setSelectedMeeting(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {/* 基本資訊 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>日期時間</div>
                <div style={{ fontWeight: '500' }}>{formatDate(selectedMeeting.meeting_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>關聯洽談案</div>
                <div style={{ fontWeight: '500' }}>
                  {selectedMeeting.prospects
                    ? `${selectedMeeting.prospects.client_name} / ${selectedMeeting.prospects.project_name}`
                    : '-'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>上傳者</div>
                <div style={{ fontWeight: '500' }}>{selectedMeeting.users?.name || '-'}</div>
              </div>
            </div>

            {/* 摘要 */}
            {selectedMeeting.summary && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>📝 會議摘要</h3>
                <p style={{
                  margin: 0,
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  lineHeight: 1.6
                }}>
                  {selectedMeeting.summary}
                </p>
              </div>
            )}

            {/* 行動項目 */}
            {selectedMeeting.action_items && selectedMeeting.action_items.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>📋 行動項目</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedMeeting.action_items.map((item, i) => (
                    <div key={i} style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontWeight: '500' }}>{item.task}</div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          負責: {item.assignee}
                        </div>
                      </div>
                      {item.due_date && (
                        <div style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#dbeafe',
                          borderRadius: '12px',
                          fontSize: '0.8rem'
                        }}>
                          {item.due_date}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 原始內容 */}
            {selectedMeeting.raw_content && (
              <div>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>📄 完整紀錄</h3>
                <pre style={{
                  margin: 0,
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  {selectedMeeting.raw_content}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
