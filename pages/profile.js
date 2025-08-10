import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Layout from '../components/Layout';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    extension: '',
    bank_name: '',
    bank_code: '',
    bank_account: '',
    bank_branch: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  async function fetchUserProfile() {
    if (!supabase) return;
    
    // 暫時使用模擬的當前用戶資料
    // 在實際應用中，這裡應該根據登錄狀態獲取當前用戶
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@example.com') // 使用admin用戶作為示例
      .single();
    
    if (error) {
      console.error('獲取用戶資料失敗:', error);
      setLoading(false);
      return;
    }

    setUser(data);
    setFormData({
      full_name: data.full_name || data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      extension: data.extension || '',
      bank_name: data.bank_name || '',
      bank_code: data.bank_code || '',
      bank_account: data.bank_account || '',
      bank_branch: data.bank_branch || ''
    });
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase || !user) return;

    const { error } = await supabase
      .from('users')
      .update({
        full_name: formData.full_name,
        phone: formData.phone,
        extension: formData.extension,
        bank_name: formData.bank_name,
        bank_code: formData.bank_code,
        bank_account: formData.bank_account,
        bank_branch: formData.bank_branch
      })
      .eq('id', user.id);

    if (error) {
      console.error('更新失敗:', error);
      alert('更新失敗: ' + error.message);
    } else {
      alert('個人資料更新成功！');
      setIsEditing(false);
      fetchUserProfile();
    }
  }

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>個人資料管理</h2>
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: isEditing ? '#6c757d' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {isEditing ? '取消編輯' : '編輯資料'}
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* 基本資料 */}
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>基本資料</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    姓名 *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                    disabled
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      backgroundColor: '#f8f9fa',
                      color: '#6c757d'
                    }}
                  />
                  <small style={{ color: '#6c757d' }}>Email 綁定 Google 登入，不可修改</small>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    電話
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="例如：0912-345-678"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    分機
                  </label>
                  <input
                    type="text"
                    value={formData.extension}
                    onChange={(e) => setFormData({...formData, extension: e.target.value})}
                    placeholder="例如：123"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              {/* 帳戶資訊 */}
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>帳戶資訊</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    銀行名稱
                  </label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                    placeholder="例如：台灣銀行"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    銀行代碼
                  </label>
                  <input
                    type="text"
                    value={formData.bank_code}
                    onChange={(e) => setFormData({...formData, bank_code: e.target.value})}
                    placeholder="例如：004"
                    maxLength="3"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    帳號
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account}
                    onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    分行
                  </label>
                  <input
                    type="text"
                    value={formData.bank_branch}
                    onChange={(e) => setFormData({...formData, bank_branch: e.target.value})}
                    placeholder="例如：台北分行"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold'
                }}
              >
                儲存資料
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          /* 顯示模式 */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>基本資料</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <strong>姓名：</strong>{formData.full_name || '-'}
                </div>
                <div>
                  <strong>Email：</strong>{formData.email || '-'}
                </div>
                <div>
                  <strong>電話：</strong>{formData.phone || '-'}
                </div>
                <div>
                  <strong>分機：</strong>{formData.extension || '-'}
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>帳戶資訊</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <strong>銀行名稱：</strong>{formData.bank_name || '-'}
                </div>
                <div>
                  <strong>銀行代碼：</strong>{formData.bank_code || '-'}
                </div>
                <div>
                  <strong>帳號：</strong>{formData.bank_account || '-'}
                </div>
                <div>
                  <strong>分行：</strong>{formData.bank_branch || '-'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}