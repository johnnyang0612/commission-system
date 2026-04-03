import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

const DOCUMENT_TYPES = [
  { value: 'proposal', label: '提案書', icon: '📋', description: '完整的商業提案，包含方案說明、時程、報價' },
  { value: 'specification', label: '規格書', icon: '📊', description: '技術規格與功能需求文件' },
  { value: 'quotation', label: '報價單', icon: '💰', description: '詳細的價格與項目報價' }
];

const TABS = [
  { id: 'generator', label: 'AI 文件生成', icon: '📝' },
  { id: 'smart-project', label: '智能建案', icon: '🚀' }
];

export default function AIGenerator() {
  const router = useRouter();
  const { user } = useSimpleAuth();
  const [activeTab, setActiveTab] = useState('generator');
  const fileInputRef = useRef(null);

  // 文件生成表單
  const [formData, setFormData] = useState({
    document_type: 'proposal',
    client_name: '',
    project_name: '',
    requirements: '',
    budget_range: '',
    additional_context: ''
  });

  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [references, setReferences] = useState([]);
  const [error, setError] = useState('');

  // 智能建案狀態
  const [uploadedFile, setUploadedFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [users, setUsers] = useState([]);
  const [projectForm, setProjectForm] = useState({
    client_name: '',
    project_name: '',
    amount: '',
    payment_template: 'custom',
    assigned_to: '',
    project_type: 'new',
    note: ''
  });

  // 知識庫統計
  const [stats, setStats] = useState({ total: 0, by_type: {} });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchUsers();
    // 檢查 URL 參數決定預設 tab
    if (router.query.tab === 'smart-project') {
      setActiveTab('smart-project');
    }
  }, [router.query]);

  async function fetchUsers() {
    if (!supabase) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .order('name');
    setUsers(data || []);
  }

  async function fetchStats() {
    try {
      const { data, error } = await supabase
        .from('document_embeddings')
        .select('document_type');

      if (!error && data) {
        const byType = data.reduce((acc, doc) => {
          acc[doc.document_type] = (acc[doc.document_type] || 0) + 1;
          return acc;
        }, {});

        setStats({ total: data.length, by_type: byType });
      }
    } catch (err) {
      console.error('獲取統計失敗:', err);
    } finally {
      setLoadingStats(false);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError('');
    setGeneratedContent('');
    setReferences([]);

    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '生成失敗');
      }

      setGeneratedContent(data.generated_content);
      setReferences(data.reference_documents || []);

    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(generatedContent);
    alert('已複製到剪貼簿！');
  }

  function downloadAsText() {
    const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formData.project_name || '文件'}_${DOCUMENT_TYPES.find(t => t.value === formData.document_type)?.label || '文件'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===== 智能建案功能 =====

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setAnalysisResult(null);
      setAnalysisError('');
    }
  }

  async function handleAnalyzeProposal() {
    if (!uploadedFile) {
      setAnalysisError('請先上傳提案書文件');
      return;
    }

    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const response = await fetch('/api/documents/analyze-proposal', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '分析失敗');
      }

      setAnalysisResult(data.analysis);

      // Save extraction result and redirect to confirmation page
      if (data.analysis && supabase) {
        const { data: extraction, error: insertError } = await supabase
          .from('contract_extraction_results')
          .insert([{
            raw_extraction: data.analysis,
            normalized_data: data.analysis,
            confidence_scores: data.analysis.confidence_scores || null,
            status: 'pending'
          }])
          .select()
          .single();

        if (extraction && !insertError) {
          router.push(`/contract-confirm?extraction_id=${extraction.id}`);
          return;
        }
        // If save failed, fall back to inline display
        if (insertError) {
          console.error('儲存抽取結果失敗:', insertError);
        }
      }

      // Fallback: auto-fill form if redirect didn't happen
      if (data.analysis) {
        setProjectForm({
          client_name: data.analysis.client_name || '',
          project_name: data.analysis.project_name || '',
          amount: data.analysis.amount || '',
          payment_template: 'custom',
          assigned_to: user?.id || '',
          project_type: data.analysis.project_type || 'new',
          note: data.analysis.scope_summary || ''
        });
      }
    } catch (err) {
      setAnalysisError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreateProject() {
    if (!projectForm.client_name || !projectForm.project_name) {
      alert('請填寫客戶名稱和專案名稱');
      return;
    }

    setCreatingProject(true);

    try {
      // 建立專案
      const { data: project, error } = await supabase
        .from('projects')
        .insert([{
          client_name: projectForm.client_name,
          project_name: projectForm.project_name,
          amount: parseFloat(projectForm.amount) || 0,
          payment_template: projectForm.payment_template,
          assigned_to: projectForm.assigned_to || user?.id,
          project_type: projectForm.project_type,
          status: 'active',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      // 如果有分期付款資訊，建立 installments
      if (analysisResult?.payment_installments?.length > 0) {
        const installments = analysisResult.payment_installments.map((inst, index) => ({
          project_id: project.id,
          installment_number: index + 1,
          installment_name: inst.name || `第 ${index + 1} 期`,
          percentage: inst.percentage || 0,
          amount: inst.amount || 0,
          status: 'pending'
        }));

        await supabase.from('project_installments').insert(installments);
      }

      alert('專案建立成功！');
      router.push(`/projects/${project.id}`);

    } catch (err) {
      alert('建立失敗: ' + err.message);
    } finally {
      setCreatingProject(false);
    }
  }

  function resetSmartProject() {
    setUploadedFile(null);
    setAnalysisResult(null);
    setAnalysisError('');
    setProjectForm({
      client_name: '',
      project_name: '',
      amount: '',
      payment_template: 'custom',
      assigned_to: '',
      project_type: 'new',
      note: ''
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🤖 AI 工具
        </h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          智能文件生成與自動建案工具
        </p>
      </div>

      {/* Tab 切換 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: activeTab === tab.id ? '#2563eb' : '#f1f5f9',
              color: activeTab === tab.id ? 'white' : '#64748b',
              transition: 'all 0.2s'
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== AI 文件生成 Tab ===== */}
      {activeTab === 'generator' && (
        <>
          {/* 知識庫狀態 */}
          <div style={{
            backgroundColor: '#e8f4fd',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            border: '1px solid #b8daff'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#004085' }}>📚 知識庫狀態</h4>
            {loadingStats ? (
              <p style={{ margin: 0, color: '#666' }}>載入中...</p>
            ) : stats.total === 0 ? (
              <p style={{ margin: 0, color: '#856404' }}>
                ⚠️ 知識庫目前是空的。請先到「專案詳情」頁面上傳文件，然後到「知識庫管理」處理文件。
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <span>總計: <strong>{stats.total}</strong> 個文件區塊</span>
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <span key={type}>
                    {DOCUMENT_TYPES.find(t => t.value === type)?.label || type}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* 左側：輸入表單 */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 1.5rem 0', color: '#2c3e50' }}>輸入需求資訊</h3>

          <form onSubmit={handleGenerate}>
            {/* 文件類型選擇 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                文件類型 *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {DOCUMENT_TYPES.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, document_type: type.value })}
                    style={{
                      padding: '1rem',
                      border: formData.document_type === type.value ? '2px solid #3498db' : '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: formData.document_type === type.value ? '#ebf5ff' : 'white',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{type.icon}</div>
                    <div style={{ fontWeight: 'bold' }}>{type.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                      {type.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 客戶資訊 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  客戶名稱
                </label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="例：台灣科技公司"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案名稱
                </label>
                <input
                  type="text"
                  value={formData.project_name}
                  onChange={e => setFormData({ ...formData, project_name: e.target.value })}
                  placeholder="例：企業官網改版專案"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>

            {/* 需求描述 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                需求描述 *
              </label>
              <textarea
                value={formData.requirements}
                onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                placeholder="請詳細描述客戶的需求，例如：&#10;- 需要建立一個電商網站&#10;- 包含會員系統、購物車、金流串接&#10;- 支援手機版響應式設計&#10;- 預計上線時間為 3 個月後"
                rows={6}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* 預算範圍 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                預算範圍
              </label>
              <input
                type="text"
                value={formData.budget_range}
                onChange={e => setFormData({ ...formData, budget_range: e.target.value })}
                placeholder="例：50-80萬"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            {/* 補充資訊 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                補充資訊
              </label>
              <textarea
                value={formData.additional_context}
                onChange={e => setFormData({ ...formData, additional_context: e.target.value })}
                placeholder="任何其他需要考慮的資訊，例如技術限制、競爭對手、特殊需求等"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* 生成按鈕 */}
            <button
              type="submit"
              disabled={generating || !formData.requirements}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: generating ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: generating ? 'not-allowed' : 'pointer'
              }}
            >
              {generating ? '🔄 AI 正在生成中...' : '✨ 生成文件'}
            </button>
          </form>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px'
            }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* 右側：生成結果 */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>生成結果</h3>
            {generatedContent && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  📋 複製
                </button>
                <button
                  onClick={downloadAsText}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#9b59b6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  💾 下載
                </button>
              </div>
            )}
          </div>

          {/* 參考文件 */}
          {references.length > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px'
            }}>
              <strong>📚 參考了 {references.length} 份歷史文件：</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {references.map((ref, i) => (
                  <span key={i} style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    fontSize: '0.85rem'
                  }}>
                    {ref.document_name} ({ref.similarity})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 生成的內容 */}
          {generatedContent ? (
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '8px',
              maxHeight: '600px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: '1.8'
            }}>
              {generatedContent}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              color: '#666',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
              <p>在左側填寫需求資訊後</p>
              <p>點擊「生成文件」按鈕</p>
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#999' }}>
                AI 將根據您的需求和歷史文件自動生成專業文件
              </p>
            </div>
          )}
        </div>
          </div>
        </>
      )}

      {/* ===== 智能建案 Tab ===== */}
      {activeTab === 'smart-project' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* 左側：上傳與分析 */}
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>上傳簽約提案書</h3>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '14px' }}>
              上傳已簽約的提案書或合約，AI 將自動分析並提取專案資訊
            </p>

            {/* 上傳區 */}
            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                marginBottom: '1.5rem',
                background: uploadedFile ? '#f0fdf4' : '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {uploadedFile ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📄</div>
                  <div style={{ fontWeight: 600, color: '#16a34a' }}>{uploadedFile.name}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                    {(uploadedFile.size / 1024).toFixed(1)} KB · 點擊更換文件
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📤</div>
                  <div style={{ fontWeight: 500, color: '#475569' }}>點擊或拖曳上傳文件</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                    支援 PDF、Word、TXT 格式
                  </div>
                </>
              )}
            </div>

            {/* 分析按鈕 */}
            <button
              onClick={handleAnalyzeProposal}
              disabled={!uploadedFile || analyzing}
              style={{
                width: '100%',
                padding: '14px',
                background: !uploadedFile || analyzing ? '#94a3b8' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: !uploadedFile || analyzing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {analyzing ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                  AI 分析中...
                </>
              ) : (
                <>
                  🔍 開始分析
                </>
              )}
            </button>

            {/* 錯誤訊息 */}
            {analysisError && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                borderRadius: '8px',
                fontSize: '14px'
              }}>
                ❌ {analysisError}
              </div>
            )}

            {/* 分析結果預覽 */}
            {analysisResult && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #86efac'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ✅ 分析完成
                  <span style={{
                    fontSize: '12px',
                    padding: '2px 8px',
                    background: analysisResult.confidence === 'high' ? '#dcfce7' : analysisResult.confidence === 'medium' ? '#fef9c3' : '#fee2e2',
                    color: analysisResult.confidence === 'high' ? '#16a34a' : analysisResult.confidence === 'medium' ? '#ca8a04' : '#dc2626',
                    borderRadius: '12px'
                  }}>
                    信心度: {analysisResult.confidence === 'high' ? '高' : analysisResult.confidence === 'medium' ? '中' : '低'}
                  </span>
                </h4>
                <div style={{ fontSize: '14px', color: '#475569' }}>
                  <p><strong>客戶：</strong>{analysisResult.client_name || '未識別'}</p>
                  <p><strong>專案：</strong>{analysisResult.project_name || '未識別'}</p>
                  <p><strong>金額：</strong>{analysisResult.amount ? `NT$ ${Number(analysisResult.amount).toLocaleString()}` : '未識別'}</p>
                  {analysisResult.payment_terms && (
                    <p><strong>付款：</strong>{analysisResult.payment_terms}</p>
                  )}
                  {analysisResult.scope_summary && (
                    <p><strong>範圍：</strong>{analysisResult.scope_summary}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右側：建立專案表單 */}
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>確認專案資訊</h3>
              {analysisResult && (
                <button
                  onClick={resetSmartProject}
                  style={{
                    padding: '6px 12px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  重新開始
                </button>
              )}
            </div>

            {!analysisResult ? (
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                color: '#94a3b8',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📋</div>
                <p>上傳並分析提案書後</p>
                <p>將自動填入專案資訊</p>
              </div>
            ) : (
              <div>
                {/* 客戶名稱 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    客戶名稱 *
                  </label>
                  <input
                    type="text"
                    value={projectForm.client_name}
                    onChange={e => setProjectForm({ ...projectForm, client_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 專案名稱 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    專案名稱 *
                  </label>
                  <input
                    type="text"
                    value={projectForm.project_name}
                    onChange={e => setProjectForm({ ...projectForm, project_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 合約金額 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    合約金額
                  </label>
                  <input
                    type="number"
                    value={projectForm.amount}
                    onChange={e => setProjectForm({ ...projectForm, amount: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* 專案類型 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    專案類型
                  </label>
                  <select
                    value={projectForm.project_type}
                    onChange={e => setProjectForm({ ...projectForm, project_type: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="new">新專案</option>
                    <option value="renewal">續約</option>
                  </select>
                </div>

                {/* 負責業務 */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    負責業務
                  </label>
                  <select
                    value={projectForm.assigned_to}
                    onChange={e => setProjectForm({ ...projectForm, assigned_to: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">選擇業務...</option>
                    {users.filter(u => ['sales', 'leader', 'pm', 'admin'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>

                {/* 備註 */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    備註
                  </label>
                  <textarea
                    value={projectForm.note}
                    onChange={e => setProjectForm({ ...projectForm, note: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* 分期付款預覽 */}
                {analysisResult.payment_installments?.length > 0 && (
                  <div style={{
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px'
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '14px', color: '#475569' }}>
                      📅 付款期程（將自動建立）
                    </h4>
                    {analysisResult.payment_installments.map((inst, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < analysisResult.payment_installments.length - 1 ? '1px solid #e2e8f0' : 'none',
                        fontSize: '14px'
                      }}>
                        <span>{inst.name}</span>
                        <span style={{ color: '#2563eb', fontWeight: 500 }}>
                          {inst.percentage}% · NT$ {Number(inst.amount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 建立按鈕 */}
                <button
                  onClick={handleCreateProject}
                  disabled={creatingProject || !projectForm.client_name || !projectForm.project_name}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: creatingProject ? '#94a3b8' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: creatingProject ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {creatingProject ? '建立中...' : '✅ 建立專案'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 動畫樣式 */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '1fr 1fr'"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
