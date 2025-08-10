import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Layout from '../components/Layout';

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    client_name: '',
    project_name: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    tax_id: '',
    amount: '',
    type: 'new',
    payment_template: '6/4',
    tax_last: false,
    assigned_to: '',
    sign_date: new Date().toISOString().split('T')[0],
    first_payment_date: '',
    expected_completion_date: ''
  });
  const [isCustomTemplate, setIsCustomTemplate] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchProjects();
    fetchUsers();
  }, []);

  async function fetchProjects() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        users:assigned_to (name, email)
      `)
      .order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else setProjects(data || []);
  }

  async function fetchUsers() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('role', ['sales', 'leader'])
      .order('name');
    
    if (error) console.error(error);
    else setUsers(data || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    
    // Generate project code from tax_id and sign_date
    const signDateFormatted = formData.sign_date.replace(/-/g, '');
    const projectCode = `${formData.tax_id}-${signDateFormatted}`;
    
    const { error } = await supabase
      .from('projects')
      .insert([{
        ...formData,
        project_code: projectCode,
        amount: parseFloat(formData.amount)
      }]);
    
    if (error) {
      console.error(error);
      alert('新增失敗');
    } else {
      alert('新增成功');
      setShowAddForm(false);
      setFormData({
        client_name: '',
        project_name: '',
        contact_person: '',
        contact_phone: '',
        contact_email: '',
        tax_id: '',
        amount: '',
        type: 'new',
        payment_template: '6/4',
        tax_last: false,
        assigned_to: '',
        sign_date: new Date().toISOString().split('T')[0],
        first_payment_date: '',
        expected_completion_date: ''
      });
      setIsCustomTemplate(false);
      fetchProjects();
    }
  }

  const getTypeLabel = (type) => {
    const labels = {
      'new': '新簽',
      'renewal': '續簽',
      'maintenance': '維護費'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type) => {
    const colors = {
      'new': '#27ae60',
      'renewal': '#3498db',
      'maintenance': '#95a5a6'
    };
    return colors[type] || '#95a5a6';
  };

  return (
    <Layout>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>專案管理</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {showAddForm ? '取消' : '新增專案'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#2c3e50' }}>客戶資訊</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  客戶名稱 *
                </label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案名稱 *
                </label>
                <input
                  type="text"
                  value={formData.project_name}
                  onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  聯絡人 *
                </label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  聯絡電話 *
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  聯絡 Email *
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  統一編號/身分證 *
                </label>
                <input
                  type="text"
                  value={formData.tax_id}
                  onChange={(e) => setFormData({...formData, tax_id: e.target.value})}
                  required
                  placeholder="公司統編或個人身分證"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>

            <h3 style={{ marginBottom: '1rem', color: '#2c3e50' }}>專案資訊</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  簽約日期 *
                </label>
                <input
                  type="date"
                  value={formData.sign_date}
                  onChange={(e) => setFormData({...formData, sign_date: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  第一筆款項付款日期 *
                </label>
                <input
                  type="date"
                  value={formData.first_payment_date}
                  onChange={(e) => setFormData({...formData, first_payment_date: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  預計完成日期 *
                </label>
                <input
                  type="date"
                  value={formData.expected_completion_date}
                  onChange={(e) => setFormData({...formData, expected_completion_date: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  未稅總額 *
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
                {formData.amount && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                    含稅總額 (5%): NT$ {(parseFloat(formData.amount) * 1.05).toLocaleString()}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案編號 (自動產生)
                </label>
                <input
                  type="text"
                  value={formData.tax_id && formData.sign_date ? `${formData.tax_id}-${formData.sign_date.replace(/-/g, '')}` : '請先填寫統編與簽約日期'}
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#f8f9fa',
                    color: '#6c757d'
                  }}
                />
              </div>
            </div>

            <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#2c3e50' }}>付款設定</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案類型 *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="new">新簽</option>
                  <option value="renewal">續簽</option>
                  <option value="maintenance">維護費</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  付款模板 *
                </label>
                <select
                  value={isCustomTemplate ? 'custom' : formData.payment_template}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomTemplate(true);
                      setFormData({...formData, payment_template: ''});
                    } else {
                      setIsCustomTemplate(false);
                      setFormData({...formData, payment_template: e.target.value});
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="6/4">6/4</option>
                  <option value="6/2/2">6/2/2</option>
                  <option value="3/2/3/2">3/2/3/2</option>
                  <option value="10">一次付清</option>
                  <option value="custom">自訂模板</option>
                </select>
                {isCustomTemplate && (
                  <input
                    type="text"
                    value={formData.payment_template}
                    onChange={(e) => setFormData({...formData, payment_template: e.target.value})}
                    placeholder="例如: 5/3/2 或 4/4/2"
                    required={isCustomTemplate}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      marginTop: '0.5rem'
                    }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  稅金付款時機
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={!formData.tax_last}
                      onChange={() => setFormData({...formData, tax_last: false})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    分期含稅
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={formData.tax_last}
                      onChange={() => setFormData({...formData, tax_last: true})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    稅最後付
                  </label>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                  {formData.tax_last ? '稅金將與最後一期款項一起支付' : '每期款項包含稅金'}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  負責業務 *
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">選擇業務人員</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              style={{
                marginTop: '1rem',
                padding: '0.75rem 2rem',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              確認新增
            </button>
          </form>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案編號</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>客戶名稱</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>類型</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>未稅金額</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>含稅金額</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>付款模板</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>稅金</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>負責業務</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>建立時間</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => (
                <tr key={project.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>{project.project_code}</td>
                  <td style={{ padding: '1rem' }}>{project.client_name}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      backgroundColor: getTypeColor(project.type),
                      color: 'white',
                      fontSize: '0.875rem'
                    }}>
                      {getTypeLabel(project.type)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    NT$ {project.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                    NT$ {(project.amount * 1.05)?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{project.payment_template}</td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: project.tax_last ? '#e74c3c' : '#3498db',
                      color: 'white',
                      fontSize: '0.75rem'
                    }}>
                      {project.tax_last ? '稅最後付' : '分期含稅'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>{project.users?.name || '-'}</td>
                  <td style={{ padding: '1rem' }}>
                    {new Date(project.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => window.open(`/projects/${project.id}`, '_blank')}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      查看詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {projects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
              暫無專案資料
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}