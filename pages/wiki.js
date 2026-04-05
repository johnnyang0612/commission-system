// 公司知識 Wiki — 瀏覽與管理 AI 自動維護的知識庫
import { useState, useEffect } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';

const CATEGORIES = [
  { key: 'all', label: '全部文章', icon: '📚' },
  { key: 'company', label: '公司知識', icon: '🏢' },
  { key: 'clients', label: '客戶資料', icon: '👥' },
  { key: 'playbooks', label: '應對策略', icon: '📖' },
  { key: 'projects', label: '專案紀錄', icon: '📁' },
  { key: 'tech', label: '技術知識', icon: '💻' },
  { key: 'lessons', label: '經驗教訓', icon: '💡' },
];

function simpleMarkdownToHtml(md) {
  if (!md) return '';
  let html = md
    // headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // wiki-style links [[path]]
    .replace(/\[\[([^\]]+)\]\]/g, '<code style="background:#e8f4fd;padding:2px 6px;border-radius:3px;color:#2563eb;cursor:pointer;">$1</code>')
    // unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // line breaks (must come after list processing)
    .replace(/\n/g, '<br/>');
  // wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li><br\/>?)+)/g, '<ul>$1</ul>');
  html = html.replace(/<br\/><\/ul>/g, '</ul>');
  html = html.replace(/<ul><br\/>/g, '<ul>');
  return html;
}

export default function WikiPage() {
  const { user, loading } = useSimpleAuth();
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleContent, setArticleContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchArticles();
  }, []);

  async function fetchArticles() {
    setLoadingArticles(true);
    setError('');
    try {
      const res = await fetch('/api/wiki/articles');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得文章失敗');
      setArticles(data.articles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingArticles(false);
    }
  }

  async function handleSelectArticle(article) {
    setSelectedArticle(article);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(article.path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得文章失敗');
      setArticleContent(data.article);
    } catch (err) {
      setArticleContent(null);
      setError(err.message);
    } finally {
      setLoadingContent(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>載入中...</div>;
  if (!user) return null;

  const filteredArticles = selectedCategory === 'all'
    ? articles
    : articles.filter(a => a.category === selectedCategory);

  const categoryCounts = articles.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  const lastUpdated = articles.length > 0
    ? new Date(Math.max(...articles.map(a => new Date(a.updated_at).getTime()))).toLocaleDateString('zh-TW')
    : '-';

  const uniqueCategories = [...new Set(articles.map(a => a.category))];

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          公司知識 Wiki
        </h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          AI 自動維護的公司知識庫
        </p>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex',
        gap: '2rem',
        marginBottom: '1.5rem',
        padding: '1rem 1.5rem',
        backgroundColor: '#e8f4fd',
        borderRadius: '8px',
        border: '1px solid #b8daff',
        flexWrap: 'wrap',
      }}>
        <div>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>總文章數</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{articles.length}</div>
        </div>
        <div>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>分類數</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{uniqueCategories.length}</div>
        </div>
        <div>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>最後更新</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>{lastUpdated}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <a
            href="/wiki-ingest"
            style={{
              padding: '8px 20px',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            + 投餵知識
          </a>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Left sidebar — category tree */}
        <div style={{
          width: '25%',
          minWidth: '220px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          padding: '1rem',
          flexShrink: 0,
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#2c3e50', fontSize: '1rem' }}>分類導覽</h3>
          {CATEGORIES.map(cat => {
            const count = cat.key === 'all' ? articles.length : (categoryCounts[cat.key] || 0);
            const isActive = selectedCategory === cat.key;
            return (
              <div
                key={cat.key}
                onClick={() => {
                  setSelectedCategory(cat.key);
                  setSelectedArticle(null);
                  setArticleContent(null);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isActive ? '#eff6ff' : 'transparent',
                  color: isActive ? '#2563eb' : '#374151',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  backgroundColor: isActive ? '#2563eb' : '#e5e7eb',
                  color: isActive ? 'white' : '#6b7280',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 500,
                }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right main area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loadingArticles ? (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              color: '#666',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}>
              載入文章中...
            </div>
          ) : articleContent ? (
            /* Article detail view */
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              padding: '2rem',
            }}>
              <button
                onClick={() => { setSelectedArticle(null); setArticleContent(null); }}
                style={{
                  padding: '6px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#374151',
                  marginBottom: '1rem',
                }}
              >
                &larr; 返回列表
              </button>

              <h2 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>
                {articleContent.title}
              </h2>

              {articleContent.summary && (
                <p style={{ color: '#64748b', margin: '0 0 1rem 0', fontStyle: 'italic' }}>
                  {articleContent.summary}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                }}>
                  {articleContent.category}
                </span>
                {(articleContent.tags || []).map(tag => (
                  <span key={tag} style={{
                    fontSize: '0.75rem',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    backgroundColor: '#f1f5f9',
                    color: '#64748b',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>

              <div style={{
                fontSize: '0.8rem',
                color: '#94a3b8',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #e2e8f0',
              }}>
                路徑：{articleContent.path} | 版本：{articleContent.version || 1} | 引用次數：{articleContent.usage_count || 0} | 更新：{new Date(articleContent.updated_at).toLocaleDateString('zh-TW')}
              </div>

              {loadingContent ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>載入內容中...</div>
              ) : (
                <div
                  style={{
                    lineHeight: 1.8,
                    color: '#334155',
                    fontSize: '0.95rem',
                  }}
                  dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(articleContent.content) }}
                />
              )}
            </div>
          ) : filteredArticles.length === 0 ? (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
              <h3 style={{ color: '#64748b', margin: '0 0 0.5rem 0' }}>
                {selectedCategory === 'all' ? 'Wiki 目前是空的' : '此分類尚無文章'}
              </h3>
              <p style={{ color: '#94a3b8', margin: 0 }}>
                前往<a href="/wiki-ingest" style={{ color: '#2563eb' }}>投餵知識</a>頁面，丟入內容讓 AI 自動分析歸檔
              </p>
            </div>
          ) : (
            /* Article list */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredArticles.map(article => (
                <div
                  key={article.path}
                  onClick={() => handleSelectArticle(article)}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    padding: '1.25rem 1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(37,99,235,0.15)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: '0 0 0.3rem 0', color: '#1e293b', fontSize: '1rem' }}>
                        {article.title}
                      </h4>
                      {article.summary && (
                        <p style={{
                          margin: '0 0 0.5rem 0',
                          color: '#64748b',
                          fontSize: '0.85rem',
                          lineHeight: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {article.summary}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '1px 8px',
                          borderRadius: '10px',
                          backgroundColor: '#eff6ff',
                          color: '#2563eb',
                        }}>
                          {article.category}
                        </span>
                        {(article.tags || []).slice(0, 3).map(tag => (
                          <span key={tag} style={{
                            fontSize: '0.7rem',
                            padding: '1px 8px',
                            borderRadius: '10px',
                            backgroundColor: '#f1f5f9',
                            color: '#64748b',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      whiteSpace: 'nowrap',
                      marginLeft: '1rem',
                    }}>
                      {new Date(article.updated_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
