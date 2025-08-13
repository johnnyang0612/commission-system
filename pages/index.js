import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

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
    expected_completion_date: '',
    use_fixed_commission: false,
    fixed_commission_percentage: ''
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
      .select('*')
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
    
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .insert([{
        ...formData,
        project_code: projectCode,
        amount: parseFloat(formData.amount)
      }])
      .select()
      .single();
    
    if (projectError) {
      console.error(projectError);
      alert('新增失敗');
    } else {
      // Generate installments based on payment template
      await generateInstallments(projectData.id, formData.payment_template, parseFloat(formData.amount), formData.tax_last, formData.first_payment_date, formData.type, formData.assigned_to, formData.use_fixed_commission, formData.fixed_commission_percentage);
      
      alert('新增成功並自動生成付款期數');
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
        expected_completion_date: '',
        use_fixed_commission: false,
        fixed_commission_percentage: ''
      });
      setIsCustomTemplate(false);
      fetchProjects();
    }
  }

  async function generateInstallments(projectId, template, baseAmount, taxLast, firstPaymentDate, projectType, assignedTo, useFixedCommission, fixedCommissionPercentage) {
    if (!supabase) return;
    
    // Parse payment template (e.g., "3/3/2/2" or "6/4")
    const ratios = template.split('/').map(r => parseInt(r.trim()));
    const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);
    
    const taxAmount = baseAmount * 0.05;
    const totalAmount = baseAmount + taxAmount;
    
    // 分潤計算：固定分潤 vs 階梯式分潤
    let totalCommissionAmount = 0;
    let effectivePercentage = 0;
    
    if (useFixedCommission && fixedCommissionPercentage) {
      // 使用固定分潤比例
      effectivePercentage = parseFloat(fixedCommissionPercentage);
      totalCommissionAmount = baseAmount * (effectivePercentage / 100);
    } else if (projectType === 'new') {
      // 階梯式分潤計算
      let remainingAmount = baseAmount;
      
      // 第一階：10萬以下 35%
      if (remainingAmount > 0) {
        const tierAmount = Math.min(remainingAmount, 100000);
        totalCommissionAmount += tierAmount * 0.35;
        remainingAmount -= tierAmount;
      }
      
      // 第二階：10-30萬 30%
      if (remainingAmount > 0) {
        const tierAmount = Math.min(remainingAmount, 200000);
        totalCommissionAmount += tierAmount * 0.30;
        remainingAmount -= tierAmount;
      }
      
      // 第三階：30-60萬 25%
      if (remainingAmount > 0) {
        const tierAmount = Math.min(remainingAmount, 300000);
        totalCommissionAmount += tierAmount * 0.25;
        remainingAmount -= tierAmount;
      }
      
      // 第四階：60-100萬 20%
      if (remainingAmount > 0) {
        const tierAmount = Math.min(remainingAmount, 400000);
        totalCommissionAmount += tierAmount * 0.20;
        remainingAmount -= tierAmount;
      }
      
      // 第五階：100萬以上 10%
      if (remainingAmount > 0) {
        totalCommissionAmount += remainingAmount * 0.10;
      }
      
      effectivePercentage = (totalCommissionAmount / baseAmount) * 100;
    } else if (projectType === 'renewal') {
      totalCommissionAmount = baseAmount * 0.15;
      effectivePercentage = 15;
    }
    const commissionPerInstallment = totalCommissionAmount / ratios.length;
    
    const installments = [];
    let currentDate = new Date(firstPaymentDate);
    
    ratios.forEach((ratio, index) => {
      const isLastInstallment = index === ratios.length - 1;
      let installmentAmount;
      
      if (taxLast) {
        // 稅最後付：前面期數不含稅，最後一期加上稅金
        const baseInstallmentAmount = (baseAmount * ratio) / totalRatio;
        installmentAmount = isLastInstallment ? baseInstallmentAmount + taxAmount : baseInstallmentAmount;
      } else {
        // 分期含稅：每期按比例分配含稅總額
        installmentAmount = (totalAmount * ratio) / totalRatio;
      }
      
      installments.push({
        project_id: projectId,
        installment_number: index + 1,
        due_date: currentDate.toISOString().split('T')[0],
        amount: Math.round(installmentAmount),
        commission_amount: Math.round(commissionPerInstallment),
        commission_status: 'pending',
        status: 'pending'
      });
      
      // 下一期付款日期（每月遞增）
      currentDate.setMonth(currentDate.getMonth() + 1);
    });
    
    // 建立分潤記錄
    if (effectivePercentage > 0) {
      await supabase
        .from('commissions')
        .insert([{
          project_id: projectId,
          user_id: assignedTo,
          percentage: effectivePercentage,
          amount: totalCommissionAmount,
          status: 'pending'
        }]);
    }
    
    const { error } = await supabase
      .from('project_installments')
      .insert(installments);
    
    if (error) {
      console.error('生成付款期數失敗:', error);
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

  async function deleteProject(projectId, projectCode) {
    if (!supabase) return;
    
    const confirmed = confirm(`確定要刪除專案「${projectCode}」嗎？此操作將同時刪除所有相關的付款期數和分潤記錄。`);
    if (!confirmed) return;
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (error) {
      console.error(error);
      alert('刪除失敗');
    } else {
      alert('刪除成功');
      fetchProjects();
    }
  }

  return (
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

            <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#2c3e50', backgroundColor: '#fff3cd', padding: '0.5rem' }}>
              分潤設定 (Debug: {formData.use_fixed_commission ? 'Fixed' : 'Tiered'})
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '1rem', 
              marginBottom: '1.5rem',
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              border: '2px solid #28a745',
              borderRadius: '8px'
            }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.use_fixed_commission}
                    onChange={(e) => {
                      console.log('Fixed commission checkbox changed:', e.target.checked);
                      setFormData({...formData, use_fixed_commission: e.target.checked});
                    }}
                    style={{ marginRight: '0.5rem', transform: 'scale(1.2)' }}
                  />
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>使用固定分潤比例</span>
                </label>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                  {formData.use_fixed_commission ? '將使用固定比例計算分潤' : '將使用階梯式分潤計算'}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#28a745' }}>
                  Debug: use_fixed_commission = {formData.use_fixed_commission.toString()}
                </div>
              </div>
              
              {formData.use_fixed_commission && (
                <div style={{ backgroundColor: '#e8f5e9', padding: '0.5rem', borderRadius: '4px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    固定分潤比例 (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.fixed_commission_percentage}
                    onChange={(e) => {
                      console.log('Fixed commission percentage changed:', e.target.value);
                      setFormData({...formData, fixed_commission_percentage: e.target.value});
                    }}
                    required={formData.use_fixed_commission}
                    placeholder="例如: 25"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '2px solid #28a745',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              )}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '1350px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '140px' }}>專案編號</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '120px' }}>客戶名稱</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '150px' }}>專案名稱</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '80px' }}>類型</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '100px' }}>未稅金額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '100px' }}>含稅金額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '80px' }}>付款模板</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '90px' }}>稅金</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '100px' }}>負責業務</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '100px' }}>建立時間</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '150px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => (
                <tr key={project.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '0.75rem 0.5rem', wordBreak: 'break-all' }}>{project.project_code}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{project.client_name}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: '#2c3e50' }}>{project.project_name}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: getTypeColor(project.type),
                      color: 'white',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {getTypeLabel(project.type)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    NT$ {project.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    NT$ {(project.amount * 1.05)?.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{project.payment_template}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.4rem',
                      borderRadius: '4px',
                      backgroundColor: project.tax_last ? '#e74c3c' : '#3498db',
                      color: 'white',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {project.tax_last ? '稅最後付' : '分期含稅'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {users.find(user => user.id === project.assigned_to)?.name || '-'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {new Date(project.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => window.open(`/projects/${project.id}`, '_blank')}
                        style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        查看詳情
                      </button>
                      <button
                        onClick={() => deleteProject(project.id, project.project_code)}
                        style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        刪除
                      </button>
                    </div>
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
  );
}