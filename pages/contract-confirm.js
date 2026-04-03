import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

export default function ContractConfirm() {
  const router = useRouter();
  const { user, loading: authLoading } = useSimpleAuth();
  const { extraction_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);

  // Form state
  const [basicInfo, setBasicInfo] = useState({
    client_name: '',
    project_name: '',
    amount: '',
    currency: 'TWD',
    tax_rate: 0.05,
    is_tax_included: true,
    signed_date: '',
    client_tax_id: '',
    project_type: 'new',
    assigned_to: '',
    commission_rate: 25,
    scope_summary: '',
    contact_person: '',
    contact_email: '',
  });

  const [paymentSchedules, setPaymentSchedules] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [warranty, setWarranty] = useState({
    warranty_days: 30,
    start_trigger: 'acceptance',
    scope: '',
  });
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    monthly_fee: '',
    start_rule: 'warranty_end',
    billing_cycle: 'monthly',
  });
  const [confidenceScores, setConfidenceScores] = useState({});

  useEffect(() => {
    if (extraction_id) {
      loadExtraction();
    }
    fetchUsers();
  }, [extraction_id]);

  async function fetchUsers() {
    if (!supabase) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .order('name');
    setUsers(data || []);
  }

  async function loadExtraction() {
    if (!supabase) return;
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('contract_extraction_results')
        .select('*')
        .eq('id', extraction_id)
        .single();

      if (fetchError || !data) {
        setError('找不到抽取結果，請重新上傳合約');
        setLoading(false);
        return;
      }

      if (data.status === 'confirmed') {
        setError('此抽取結果已確認建案');
        setLoading(false);
        return;
      }

      const result = data.normalized_data || data.raw_extraction || {};
      const scores = data.confidence_scores || result.confidence_scores || {};
      setConfidenceScores(scores);

      // Populate basic info
      setBasicInfo({
        client_name: result.client_name || '',
        project_name: result.project_name || '',
        amount: result.amount || '',
        currency: result.currency || 'TWD',
        tax_rate: result.tax_rate != null ? result.tax_rate : 0.05,
        is_tax_included: result.is_tax_included != null ? result.is_tax_included : true,
        signed_date: result.signed_date || '',
        client_tax_id: result.client_tax_id || '',
        project_type: result.project_type || 'new',
        assigned_to: '',
        commission_rate: 25,
        scope_summary: result.scope_summary || '',
        contact_person: result.contact_person || '',
        contact_email: result.contact_email || '',
      });

      // Populate payment schedules
      if (result.payment_schedules && result.payment_schedules.length > 0) {
        setPaymentSchedules(result.payment_schedules.map((ps, i) => ({
          sequence_no: ps.sequence_no || i + 1,
          label: ps.label || '',
          percentage: ps.percentage || 0,
          trigger_description: ps.trigger_description || '',
        })));
      } else if (result.payment_installments && result.payment_installments.length > 0) {
        // Fallback to old format
        setPaymentSchedules(result.payment_installments.map((pi, i) => ({
          sequence_no: i + 1,
          label: pi.name || '',
          percentage: pi.percentage || 0,
          trigger_description: '',
        })));
      }

      // Populate milestones
      if (result.milestones && result.milestones.length > 0) {
        setMilestones(result.milestones.map((m, i) => ({
          title: m.title || '',
          acceptance_criteria: m.acceptance_criteria || '',
          sequence_order: m.sequence_order || i + 1,
        })));
      }

      // Populate warranty
      if (result.warranty) {
        setWarranty({
          warranty_days: result.warranty.warranty_days || 30,
          start_trigger: result.warranty.start_trigger || 'acceptance',
          scope: result.warranty.scope || '',
        });
      }

      // Populate maintenance
      if (result.maintenance) {
        setMaintenance({
          enabled: result.maintenance.enabled || false,
          monthly_fee: result.maintenance.monthly_fee || '',
          start_rule: result.maintenance.start_rule || 'warranty_end',
          billing_cycle: result.maintenance.billing_cycle || 'monthly',
        });
      }
    } catch (err) {
      setError('載入失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Payment schedule helpers
  function addPaymentSchedule() {
    setPaymentSchedules([...paymentSchedules, {
      sequence_no: paymentSchedules.length + 1,
      label: '',
      percentage: 0,
      trigger_description: '',
    }]);
  }

  function updatePaymentSchedule(index, field, value) {
    const updated = [...paymentSchedules];
    updated[index] = { ...updated[index], [field]: value };
    setPaymentSchedules(updated);
  }

  function removePaymentSchedule(index) {
    const updated = paymentSchedules.filter((_, i) => i !== index);
    // Re-sequence
    setPaymentSchedules(updated.map((ps, i) => ({ ...ps, sequence_no: i + 1 })));
  }

  // Milestone helpers
  function addMilestone() {
    setMilestones([...milestones, {
      title: '',
      acceptance_criteria: '',
      sequence_order: milestones.length + 1,
    }]);
  }

  function updateMilestone(index, field, value) {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  }

  function removeMilestone(index) {
    const updated = milestones.filter((_, i) => i !== index);
    setMilestones(updated.map((m, i) => ({ ...m, sequence_order: i + 1 })));
  }

  // Get confidence-based background color
  function getConfidenceBg(field) {
    const score = confidenceScores[field];
    if (score == null) return 'transparent';
    if (score < 0.5) return '#fef2f2';
    if (score < 0.7) return '#fefce8';
    return 'transparent';
  }

  function getConfidenceLabel(field) {
    const score = confidenceScores[field];
    if (score == null) return null;
    if (score < 0.5) return { text: 'AI 信心低', color: '#dc2626' };
    if (score < 0.7) return { text: 'AI 信心中', color: '#ca8a04' };
    return null;
  }

  async function handleConfirm() {
    if (!basicInfo.client_name || !basicInfo.project_name) {
      alert('請填寫客戶名稱和專案名稱');
      return;
    }
    if (!supabase) return;

    setSaving(true);
    setError('');

    try {
      const amount = parseFloat(basicInfo.amount) || 0;

      // 1. Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert([{
          client_name: basicInfo.client_name,
          project_name: basicInfo.project_name,
          amount: amount,
          type: basicInfo.project_type,
          payment_template: 'custom',
          assigned_to: basicInfo.assigned_to || user?.id || null,
          status: 'active',
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (projectError) throw new Error('建立專案失敗: ' + projectError.message);
      const projectId = project.id;

      // 2. Create contract
      const { error: contractError } = await supabase
        .from('contracts')
        .insert([{
          project_id: projectId,
          client_name: basicInfo.client_name,
          client_tax_id: basicInfo.client_tax_id || null,
          contact_person: basicInfo.contact_person || null,
          contact_email: basicInfo.contact_email || null,
          contract_amount: amount,
          tax_rate: parseFloat(basicInfo.tax_rate) || 0.05,
          currency: basicInfo.currency || 'TWD',
          is_tax_included: basicInfo.is_tax_included,
          signed_date: basicInfo.signed_date || null,
          notes: basicInfo.scope_summary || null,
        }]);

      if (contractError) {
        console.error('建立合約失敗:', contractError);
      }

      // 3. Update extraction status
      if (extraction_id) {
        await supabase
          .from('contract_extraction_results')
          .update({
            status: 'confirmed',
            reviewed_by: user?.id || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', extraction_id);
      }

      // 4. Create payment schedules
      let paymentScheduleRecords = [];
      if (paymentSchedules.length > 0) {
        const schedulesToInsert = paymentSchedules.map(ps => {
          const pct = parseFloat(ps.percentage) || 0;
          const grossAmount = amount * pct / 100;
          const taxRate = parseFloat(basicInfo.tax_rate) || 0.05;
          const netAmount = basicInfo.is_tax_included
            ? grossAmount / (1 + taxRate)
            : grossAmount;
          return {
            project_id: projectId,
            sequence_no: ps.sequence_no,
            payment_label: ps.label,
            percentage: pct,
            gross_amount: Math.round(grossAmount * 100) / 100,
            net_amount: Math.round(netAmount * 100) / 100,
            trigger_type: 'milestone',
            trigger_description: ps.trigger_description || null,
            status: 'pending',
          };
        });

        const { data: scheduleData, error: scheduleError } = await supabase
          .from('project_payment_schedules')
          .insert(schedulesToInsert)
          .select();

        if (scheduleError) {
          console.error('建立付款期程失敗:', scheduleError);
        } else {
          paymentScheduleRecords = scheduleData || [];
        }
      }

      // 5. Create milestones
      let milestoneRecords = [];
      if (milestones.length > 0) {
        const milestonesToInsert = milestones.map(m => ({
          project_id: projectId,
          title: m.title,
          acceptance_criteria: m.acceptance_criteria || null,
          sequence_order: m.sequence_order,
          status: 'pending',
        }));

        const { data: milestoneData, error: milestoneError } = await supabase
          .from('project_milestones')
          .insert(milestonesToInsert)
          .select();

        if (milestoneError) {
          console.error('建立里程碑失敗:', milestoneError);
        } else {
          milestoneRecords = milestoneData || [];
        }
      }

      // 6. Create milestone-payment links (match by sequence)
      if (milestoneRecords.length > 0 && paymentScheduleRecords.length > 0) {
        const links = [];
        milestoneRecords.forEach((milestone, i) => {
          // Link milestone to payment schedule with matching index
          if (i < paymentScheduleRecords.length) {
            links.push({
              milestone_id: milestone.id,
              payment_schedule_id: paymentScheduleRecords[i].id,
            });
          }
        });

        if (links.length > 0) {
          const { error: linkError } = await supabase
            .from('milestone_payment_links')
            .insert(links);

          if (linkError) {
            console.error('建立里程碑-付款關聯失敗:', linkError);
          }
        }
      }

      // 7. Create warranty
      if (warranty.warranty_days && warranty.warranty_days > 0) {
        const { error: warrantyError } = await supabase
          .from('project_warranties')
          .insert([{
            project_id: projectId,
            warranty_days: parseInt(warranty.warranty_days) || 30,
            start_trigger: warranty.start_trigger || 'acceptance',
            scope: warranty.scope || null,
            status: 'pending',
          }]);

        if (warrantyError) {
          console.error('建立保固條件失敗:', warrantyError);
        }
      }

      // 8. Create maintenance plan
      if (maintenance.enabled) {
        const { error: maintError } = await supabase
          .from('project_maintenance_plans')
          .insert([{
            project_id: projectId,
            enabled: true,
            monthly_fee: parseFloat(maintenance.monthly_fee) || 0,
            start_rule: maintenance.start_rule || 'warranty_end',
            billing_cycle: maintenance.billing_cycle || 'monthly',
            status: 'pending',
          }]);

        if (maintError) {
          console.error('建立維護計畫失敗:', maintError);
        }
      }

      // 9. Create commission rule
      const assignedUserId = basicInfo.assigned_to || user?.id;
      if (assignedUserId) {
        const { error: commError } = await supabase
          .from('commission_rules')
          .insert([{
            project_id: projectId,
            user_id: assignedUserId,
            commission_rate: (parseFloat(basicInfo.commission_rate) || 25) / 100,
            basis_type: 'net_received',
            tax_rate_for_deduction: parseFloat(basicInfo.tax_rate) || 0.05,
            notes: 'AI 合約建案自動建立',
          }]);

        if (commError) {
          console.error('建立分潤規則失敗:', commError);
        }
      }

      // Success - redirect to project detail
      alert('建案成功！');
      router.push(`/projects/${projectId}`);

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Styles
  const cardStyle = {
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    marginBottom: '1.5rem',
  };

  const cardTitleStyle = {
    margin: '0 0 1rem 0',
    fontSize: 18,
    fontWeight: 600,
    color: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const labelStyle = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'auto',
  };

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginBottom: '1rem',
  };

  const btnPrimary = {
    padding: '14px 28px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };

  const btnSecondary = {
    padding: '14px 28px',
    background: '#f1f5f9',
    color: '#64748b',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
  };

  const addBtnStyle = {
    padding: '8px 16px',
    background: '#f0f9ff',
    color: '#2563eb',
    border: '1px dashed #93c5fd',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  };

  const removeBtnStyle = {
    padding: '4px 10px',
    background: '#fef2f2',
    color: '#dc2626',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    flexShrink: 0,
  };

  const thStyle = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 600,
    color: '#64748b',
    borderBottom: '2px solid #e2e8f0',
  };

  const tdStyle = {
    padding: '8px 6px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle',
  };

  const tdInputStyle = {
    ...inputStyle,
    padding: '8px 10px',
    fontSize: 13,
  };

  // Render confidence badge
  function ConfidenceBadge({ field }) {
    const info = getConfidenceLabel(field);
    if (!info) return null;
    return (
      <span style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 10,
        backgroundColor: info.color === '#dc2626' ? '#fef2f2' : '#fefce8',
        color: info.color,
        marginLeft: 8,
        fontWeight: 500,
      }}>
        {info.text}
      </span>
    );
  }

  if (authLoading || loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>...</div>
        <div>載入中...</div>
      </div>
    );
  }

  if (!user) return null;

  // Role guard: only admin/finance/leader can confirm contracts
  if (!['admin', 'finance', 'leader'].includes(user.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>{'🔒'}</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{'無權限'}</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>{'合約建案確認僅限管理層使用'}</div>
      </div>
    );
  }

  if (error && !basicInfo.client_name) {
    return (
      <div style={{ padding: '2rem', maxWidth: 600, margin: '2rem auto', textAlign: 'center' }}>
        <div style={{
          ...cardStyle,
          padding: '3rem',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>!</div>
          <h2 style={{ color: '#dc2626', marginBottom: 8 }}>{error}</h2>
          <button
            onClick={() => router.push('/ai-generator?tab=smart-project')}
            style={{ ...btnSecondary, marginTop: 16 }}
          >
            返回智能建案
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, color: '#1e293b', fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          合約建案確認
        </h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14 }}>
          以下資訊由 AI 自動抽取，請確認或修改後建案
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          borderRadius: 8,
          marginBottom: '1rem',
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* === Basic Info Card === */}
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>
          專案基本資訊
        </h3>

        <div style={rowStyle}>
          <div style={{ background: getConfidenceBg('client_name'), padding: 4, borderRadius: 6 }}>
            <label style={labelStyle}>
              客戶名稱 *
              <ConfidenceBadge field="client_name" />
            </label>
            <input
              type="text"
              value={basicInfo.client_name}
              onChange={e => setBasicInfo({ ...basicInfo, client_name: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>專案名稱 *</label>
            <input
              type="text"
              value={basicInfo.project_name}
              onChange={e => setBasicInfo({ ...basicInfo, project_name: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={rowStyle}>
          <div style={{ background: getConfidenceBg('amount'), padding: 4, borderRadius: 6 }}>
            <label style={labelStyle}>
              合約金額
              <ConfidenceBadge field="amount" />
            </label>
            <input
              type="number"
              value={basicInfo.amount}
              onChange={e => setBasicInfo({ ...basicInfo, amount: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>稅率</label>
            <select
              value={basicInfo.tax_rate}
              onChange={e => setBasicInfo({ ...basicInfo, tax_rate: parseFloat(e.target.value) })}
              style={selectStyle}
            >
              <option value={0.05}>5% (營業稅)</option>
              <option value={0}>0% (免稅)</option>
              <option value={0.1}>10%</option>
            </select>
          </div>
        </div>

        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={basicInfo.is_tax_included}
              onChange={e => setBasicInfo({ ...basicInfo, is_tax_included: e.target.checked })}
              id="tax-included"
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="tax-included" style={{ fontSize: 14, color: '#374151', cursor: 'pointer' }}>
              金額含稅
            </label>
          </div>
          <div>
            <label style={labelStyle}>簽約日期</label>
            <input
              type="date"
              value={basicInfo.signed_date}
              onChange={e => setBasicInfo({ ...basicInfo, signed_date: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>統一編號</label>
            <input
              type="text"
              value={basicInfo.client_tax_id}
              onChange={e => setBasicInfo({ ...basicInfo, client_tax_id: e.target.value })}
              style={inputStyle}
              placeholder="選填"
            />
          </div>
          <div>
            <label style={labelStyle}>專案類型</label>
            <select
              value={basicInfo.project_type}
              onChange={e => setBasicInfo({ ...basicInfo, project_type: e.target.value })}
              style={selectStyle}
            >
              <option value="new">新專案</option>
              <option value="renewal">續約</option>
            </select>
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>負責業務</label>
            <select
              value={basicInfo.assigned_to}
              onChange={e => setBasicInfo({ ...basicInfo, assigned_to: e.target.value })}
              style={selectStyle}
            >
              <option value="">選擇業務...</option>
              {users.filter(u => ['sales', 'leader', 'pm', 'admin'].includes(u.role)).map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>分潤比例 (%)</label>
            <input
              type="number"
              value={basicInfo.commission_rate}
              onChange={e => setBasicInfo({ ...basicInfo, commission_rate: e.target.value })}
              style={inputStyle}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </div>

        <div style={{ marginBottom: 0 }}>
          <label style={labelStyle}>專案範圍摘要</label>
          <textarea
            value={basicInfo.scope_summary}
            onChange={e => setBasicInfo({ ...basicInfo, scope_summary: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* === Payment Schedules Card === */}
      <div style={{
        ...cardStyle,
        background: getConfidenceBg('payment_schedules') || 'white',
      }}>
        <h3 style={cardTitleStyle}>
          付款期程
          <ConfidenceBadge field="payment_schedules" />
          {paymentSchedules.length > 0 && (
            <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', marginLeft: 'auto' }}>
              合計: {paymentSchedules.reduce((sum, ps) => sum + (parseFloat(ps.percentage) || 0), 0)}%
            </span>
          )}
        </h3>

        {paymentSchedules.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 50 }}>#</th>
                  <th style={thStyle}>名稱</th>
                  <th style={{ ...thStyle, width: 100 }}>比例 (%)</th>
                  <th style={thStyle}>觸發條件</th>
                  <th style={{ ...thStyle, width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {paymentSchedules.map((ps, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                      {ps.sequence_no}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={ps.label}
                        onChange={e => updatePaymentSchedule(i, 'label', e.target.value)}
                        style={tdInputStyle}
                        placeholder="例：簽約款"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        value={ps.percentage}
                        onChange={e => updatePaymentSchedule(i, 'percentage', e.target.value)}
                        style={{ ...tdInputStyle, textAlign: 'center' }}
                        min={0}
                        max={100}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={ps.trigger_description}
                        onChange={e => updatePaymentSchedule(i, 'trigger_description', e.target.value)}
                        style={tdInputStyle}
                        placeholder="例：合約簽訂後 7 日內"
                      />
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removePaymentSchedule(i)} style={removeBtnStyle}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: 14 }}>
            尚未設定付款期程
          </div>
        )}

        <button onClick={addPaymentSchedule} style={addBtnStyle}>
          + 新增一期
        </button>
      </div>

      {/* === Milestones Card === */}
      <div style={{
        ...cardStyle,
        background: getConfidenceBg('milestones') || 'white',
      }}>
        <h3 style={cardTitleStyle}>
          驗收里程碑
          <ConfidenceBadge field="milestones" />
        </h3>

        {milestones.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 50 }}>#</th>
                  <th style={thStyle}>名稱</th>
                  <th style={thStyle}>驗收條件</th>
                  <th style={{ ...thStyle, width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                      {m.sequence_order}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={m.title}
                        onChange={e => updateMilestone(i, 'title', e.target.value)}
                        style={tdInputStyle}
                        placeholder="例：需求確認"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={m.acceptance_criteria}
                        onChange={e => updateMilestone(i, 'acceptance_criteria', e.target.value)}
                        style={tdInputStyle}
                        placeholder="例：客戶簽核需求文件"
                      />
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removeMilestone(i)} style={removeBtnStyle}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: 14 }}>
            尚未設定驗收里程碑
          </div>
        )}

        <button onClick={addMilestone} style={addBtnStyle}>
          + 新增里程碑
        </button>
      </div>

      {/* === Warranty Card === */}
      <div style={{
        ...cardStyle,
        background: getConfidenceBg('warranty') || 'white',
      }}>
        <h3 style={cardTitleStyle}>
          保固條件
          <ConfidenceBadge field="warranty" />
        </h3>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>保固天數</label>
            <input
              type="number"
              value={warranty.warranty_days}
              onChange={e => setWarranty({ ...warranty, warranty_days: e.target.value })}
              style={inputStyle}
              min={0}
            />
          </div>
          <div>
            <label style={labelStyle}>起算時機</label>
            <select
              value={warranty.start_trigger}
              onChange={e => setWarranty({ ...warranty, start_trigger: e.target.value })}
              style={selectStyle}
            >
              <option value="acceptance">驗收後</option>
              <option value="delivery">交付後</option>
              <option value="sign_date">簽約日</option>
              <option value="custom">自訂</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>保固範圍</label>
          <textarea
            value={warranty.scope}
            onChange={e => setWarranty({ ...warranty, scope: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="例：系統功能缺陷修復"
          />
        </div>
      </div>

      {/* === Maintenance Card === */}
      <div style={{
        ...cardStyle,
        background: getConfidenceBg('maintenance') || 'white',
      }}>
        <h3 style={cardTitleStyle}>
          維護計畫
          <ConfidenceBadge field="maintenance" />
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={maintenance.enabled}
            onChange={e => setMaintenance({ ...maintenance, enabled: e.target.checked })}
            id="maint-enabled"
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor="maint-enabled" style={{ fontSize: 14, color: '#374151', cursor: 'pointer' }}>
            啟用維護計畫
          </label>
        </div>

        {maintenance.enabled && (
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>月費</label>
              <input
                type="number"
                value={maintenance.monthly_fee}
                onChange={e => setMaintenance({ ...maintenance, monthly_fee: e.target.value })}
                style={inputStyle}
                min={0}
              />
            </div>
            <div>
              <label style={labelStyle}>起算規則</label>
              <select
                value={maintenance.start_rule}
                onChange={e => setMaintenance({ ...maintenance, start_rule: e.target.value })}
                style={selectStyle}
              >
                <option value="warranty_end">保固結束後</option>
                <option value="fixed_date">固定日期</option>
                <option value="custom">自訂</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>計費週期</label>
              <select
                value={maintenance.billing_cycle}
                onChange={e => setMaintenance({ ...maintenance, billing_cycle: e.target.value })}
                style={selectStyle}
              >
                <option value="monthly">月繳</option>
                <option value="quarterly">季繳</option>
                <option value="yearly">年繳</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* === Action Buttons === */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: '0.5rem',
        paddingBottom: '2rem',
      }}>
        <button
          onClick={() => router.push('/ai-generator?tab=smart-project')}
          style={btnSecondary}
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || !basicInfo.client_name || !basicInfo.project_name}
          style={{
            ...btnPrimary,
            opacity: saving || !basicInfo.client_name || !basicInfo.project_name ? 0.5 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '建案中...' : '確認建案'}
        </button>
      </div>
    </div>
  );
}
