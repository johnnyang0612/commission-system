import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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
      .in('role', ['sales', 'leader', 'pm'])
      .order('name');
    if (error) console.error(error);
    else setUsers(data || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;

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
      alert('新增失敗');
    } else {
      await generateInstallments(projectData.id, formData.payment_template, parseFloat(formData.amount), formData.tax_last, formData.first_payment_date, formData.type, formData.assigned_to, formData.use_fixed_commission, formData.fixed_commission_percentage);
      alert('新增成功');
      setShowAddForm(false);
      resetForm();
      fetchProjects();
    }
  }

  function resetForm() {
    setFormData({
      client_name: '', project_name: '', contact_person: '', contact_phone: '',
      contact_email: '', tax_id: '', amount: '', type: 'new', payment_template: '6/4',
      tax_last: false, assigned_to: '', sign_date: new Date().toISOString().split('T')[0],
      first_payment_date: '', expected_completion_date: '', use_fixed_commission: false,
      fixed_commission_percentage: ''
    });
    setIsCustomTemplate(false);
  }

  async function generateInstallments(projectId, template, baseAmount, taxLast, firstPaymentDate, projectType, assignedTo, useFixedCommission, fixedCommissionPercentage) {
    if (!supabase) return;
    const ratios = template.split('/').map(r => parseInt(r.trim()));
    const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);
    const taxAmount = baseAmount * 0.05;
    const totalAmount = baseAmount + taxAmount;

    let totalCommissionAmount = 0;
    let effectivePercentage = 0;

    if (useFixedCommission && fixedCommissionPercentage) {
      effectivePercentage = parseFloat(fixedCommissionPercentage);
      totalCommissionAmount = baseAmount * (effectivePercentage / 100);
    } else if (projectType === 'new') {
      let remainingAmount = baseAmount;
      if (remainingAmount > 0) { const tierAmount = Math.min(remainingAmount, 100000); totalCommissionAmount += tierAmount * 0.35; remainingAmount -= tierAmount; }
      if (remainingAmount > 0) { const tierAmount = Math.min(remainingAmount, 200000); totalCommissionAmount += tierAmount * 0.30; remainingAmount -= tierAmount; }
      if (remainingAmount > 0) { const tierAmount = Math.min(remainingAmount, 300000); totalCommissionAmount += tierAmount * 0.25; remainingAmount -= tierAmount; }
      if (remainingAmount > 0) { const tierAmount = Math.min(remainingAmount, 400000); totalCommissionAmount += tierAmount * 0.20; remainingAmount -= tierAmount; }
      if (remainingAmount > 0) { totalCommissionAmount += remainingAmount * 0.10; }
      effectivePercentage = (totalCommissionAmount / baseAmount) * 100;
    } else {
      effectivePercentage = 15;
      totalCommissionAmount = baseAmount * 0.15;
    }

    const installments = [];
    let currentDate = new Date(firstPaymentDate || new Date());
    let runningTotal = 0;

    for (let i = 0; i < ratios.length; i++) {
      const ratio = ratios[i];
      const isLast = i === ratios.length - 1;
      let installmentAmount;
      if (taxLast) {
        installmentAmount = isLast ? (baseAmount * ratio / totalRatio) + taxAmount : baseAmount * ratio / totalRatio;
      } else {
        installmentAmount = totalAmount * ratio / totalRatio;
      }
      if (isLast) installmentAmount = totalAmount - runningTotal;
      runningTotal += installmentAmount;

      installments.push({
        project_id: projectId, installment_number: i + 1, amount: Math.round(installmentAmount),
        ratio: ratio, due_date: new Date(currentDate).toISOString().split('T')[0], status: 'unpaid'
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    if (assignedTo) {
      await supabase.from('commissions').insert([{
        project_id: projectId, user_id: assignedTo, percentage: effectivePercentage,
        amount: totalCommissionAmount, status: 'pending'
      }]);
    }
    await supabase.from('project_installments').insert(installments);
  }

  async function deleteProject(projectId, projectCode) {
    if (!confirm(`確定要刪除專案「${projectCode}」嗎？`)) return;
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) alert('刪除失敗');
    else { alert('刪除成功'); fetchProjects(); }
  }

  const getTypeLabel = (type) => ({ 'new': '新簽', 'renewal': '續簽', 'maintenance': '維護費' }[type] || type);
  const getTypeBadge = (type) => ({ 'new': 'badge-success', 'renewal': 'badge-primary', 'maintenance': 'badge-warning' }[type] || '');

  const filteredProjects = projects.filter(p =>
    !searchTerm ||
    p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.project_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const styles = {
    page: { maxWidth: '100%' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
    searchBox: { flex: 1, minWidth: 200, maxWidth: 300, position: 'relative' },
    searchInput: { width: '100%', padding: '10px 14px 10px 40px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14 },
    searchIcon: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' },
    addBtn: { padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, fontWeight: 500, cursor: 'pointer', fontSize: 14 },
    card: { background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12, overflow: 'hidden' },
    cardHeader: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    cardBody: { padding: 16 },
    cardRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 14 },
    cardLabel: { color: '#64748b' },
    cardValue: { color: '#1e293b', fontWeight: 500 },
    cardActions: { display: 'flex', gap: 8, padding: '12px 16px', background: '#f8fafc' },
    projectName: { fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 4 },
    clientName: { fontSize: 13, color: '#64748b' },
    amount: { fontSize: 18, fontWeight: 700, color: '#2563eb' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, padding: 0 },
    modalContent: { background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' },
    modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 },
    modalBody: { padding: 20 },
    formGroup: { marginBottom: 16 },
    label: { display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 },
    input: { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 15 },
    grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 },
    submitBtn: { width: '100%', padding: 14, background: '#10b981', color: 'white', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', marginTop: 8 },
    badge: { display: 'inline-flex', padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20 },
    empty: { textAlign: 'center', padding: 60, color: '#64748b' }
  };

  return (
    <div style={styles.page}>
      {/* 頁面標題 */}
      <div style={styles.header}>
        <h1 style={styles.title}>專案管理</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={styles.searchBox}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="搜尋專案..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <button onClick={() => setShowAddForm(true)} style={styles.addBtn}>+ 新增專案</button>
        </div>
      </div>

      {/* 專案列表（卡片式） */}
      {filteredProjects.length === 0 ? (
        <div style={{ ...styles.card, ...styles.empty }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>尚無專案</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>點擊上方按鈕新增第一個專案</div>
        </div>
      ) : (
        filteredProjects.map(project => (
          <div key={project.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.projectName}>{project.project_name}</div>
                <div style={styles.clientName}>{project.client_name} · {project.project_code}</div>
              </div>
              <span className={getTypeBadge(project.type)} style={styles.badge}>
                {getTypeLabel(project.type)}
              </span>
            </div>
            <div style={styles.cardBody}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>含稅金額</div>
                  <div style={styles.amount}>NT$ {(project.amount * 1.05)?.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>付款模板</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{project.payment_template}</div>
                </div>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>負責業務</span>
                <span style={styles.cardValue}>{users.find(u => u.id === project.assigned_to)?.name || '-'}</span>
              </div>
              <div style={{ ...styles.cardRow, borderBottom: 'none' }}>
                <span style={styles.cardLabel}>建立日期</span>
                <span style={styles.cardValue}>{new Date(project.created_at).toLocaleDateString('zh-TW')}</span>
              </div>
            </div>
            <div style={styles.cardActions}>
              <button
                onClick={() => router.push(`/projects/${project.id}`)}
                style={{ flex: 1, padding: 10, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer' }}
              >
                查看詳情
              </button>
              <button
                onClick={() => deleteProject(project.id, project.project_code)}
                style={{ padding: '10px 16px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer' }}
              >
                刪除
              </button>
            </div>
          </div>
        ))
      )}

      {/* 新增專案 Modal */}
      {showAddForm && (
        <div style={styles.modal} onClick={() => setShowAddForm(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>新增專案</h2>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={styles.modalBody}>
              <div style={styles.grid2}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>客戶名稱 *</label>
                  <input type="text" value={formData.client_name} onChange={e => setFormData({...formData, client_name: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>專案名稱 *</label>
                  <input type="text" value={formData.project_name} onChange={e => setFormData({...formData, project_name: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>聯絡人 *</label>
                  <input type="text" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>電話 *</label>
                  <input type="tel" value={formData.contact_phone} onChange={e => setFormData({...formData, contact_phone: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email *</label>
                  <input type="email" value={formData.contact_email} onChange={e => setFormData({...formData, contact_email: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>統編/身分證 *</label>
                  <input type="text" value={formData.tax_id} onChange={e => setFormData({...formData, tax_id: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>金額 (未稅) *</label>
                  <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>專案類型 *</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={styles.input}>
                    <option value="new">新簽</option>
                    <option value="renewal">續簽</option>
                    <option value="maintenance">維護費</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>付款模板 *</label>
                  <select
                    value={isCustomTemplate ? 'custom' : formData.payment_template}
                    onChange={e => {
                      if (e.target.value === 'custom') { setIsCustomTemplate(true); setFormData({...formData, payment_template: ''}); }
                      else { setIsCustomTemplate(false); setFormData({...formData, payment_template: e.target.value}); }
                    }}
                    style={styles.input}
                  >
                    <option value="6/4">6/4</option>
                    <option value="6/2/2">6/2/2</option>
                    <option value="3/2/3/2">3/2/3/2</option>
                    <option value="10">一次付清</option>
                    <option value="custom">自訂</option>
                  </select>
                  {isCustomTemplate && (
                    <input type="text" value={formData.payment_template} onChange={e => setFormData({...formData, payment_template: e.target.value})}
                      placeholder="例如: 5/3/2" required style={{ ...styles.input, marginTop: 8 }} />
                  )}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>負責業務 *</label>
                  <select value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})} required style={styles.input}>
                    <option value="">選擇業務人員</option>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>簽約日期 *</label>
                  <input type="date" value={formData.sign_date} onChange={e => setFormData({...formData, sign_date: e.target.value})} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>首期收款日</label>
                  <input type="date" value={formData.first_payment_date} onChange={e => setFormData({...formData, first_payment_date: e.target.value})} style={styles.input} />
                </div>
              </div>

              <div style={{ ...styles.formGroup, marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.tax_last} onChange={e => setFormData({...formData, tax_last: e.target.checked})} />
                  <span style={{ fontWeight: 500 }}>稅金最後一期付</span>
                </label>
              </div>

              <div style={{ ...styles.formGroup, background: '#f0fdf4', padding: 16, borderRadius: 10, marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={formData.use_fixed_commission} onChange={e => setFormData({...formData, use_fixed_commission: e.target.checked})} />
                  <span style={{ fontWeight: 600 }}>使用固定分潤比例</span>
                </label>
                {formData.use_fixed_commission && (
                  <div>
                    <label style={styles.label}>固定分潤比例 (%)</label>
                    <input type="number" step="0.1" min="0" max="100" value={formData.fixed_commission_percentage}
                      onChange={e => setFormData({...formData, fixed_commission_percentage: e.target.value})}
                      placeholder="例如: 25" required style={styles.input} />
                  </div>
                )}
              </div>

              <button type="submit" style={styles.submitBtn}>確認新增</button>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .badge-success { background: rgba(16,185,129,0.1); color: #10b981; }
        .badge-primary { background: rgba(37,99,235,0.1); color: #2563eb; }
        .badge-warning { background: rgba(245,158,11,0.1); color: #f59e0b; }
        @media (max-width: 640px) {
          .grid2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
