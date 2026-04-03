import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';

// ── Style constants ──────────────────────────────────────────────
const styles = {
  section: {
    background: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionHeader: {
    padding: '14px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    borderBottom: '1px solid #f1f5f9',
    userSelect: 'none',
  },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  sectionBody: { padding: '16px 20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: '10px 16px',
    fontSize: 12,
    color: '#64748b',
    borderBottom: '2px solid #e2e8f0',
    fontWeight: 600,
  },
  td: {
    padding: '10px 16px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: 13,
  },
  badge: (bg, color) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: bg,
    color,
    cursor: 'pointer',
  }),
  addBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: '#fff',
  },
  cancelBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: '#fff',
    color: '#64748b',
    marginLeft: 8,
  },
  input: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    backgroundColor: '#fff',
  },
  formRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  formField: (flex = 1) => ({ flex, minWidth: 120 }),
  label: { display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 500 },
  emptyState: {
    padding: '24px 16px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  card: {
    flex: 1,
    minWidth: 260,
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '16px 20px',
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 },
  cardRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 },
  cardLabel: { color: '#64748b' },
  cardValue: { color: '#1e293b', fontWeight: 500 },
  progressBarOuter: {
    width: '100%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  chevron: (open) => ({
    transition: 'transform 0.2s',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    fontSize: 14,
    color: '#94a3b8',
  }),
};

// ── Status helpers ───────────────────────────────────────────────
const MILESTONE_STATUS = {
  pending: { label: '待處理', bg: '#f1f5f9', color: '#64748b' },
  in_progress: { label: '進行中', bg: '#dbeafe', color: '#2563eb' },
  completed: { label: '已完成', bg: '#dcfce7', color: '#16a34a' },
  skipped: { label: '略過', bg: '#ffedd5', color: '#ea580c' },
};
const MILESTONE_NEXT = { pending: 'in_progress', in_progress: 'completed', completed: 'pending', skipped: 'pending' };

const PAYMENT_STATUS = {
  pending: { label: '待請款', bg: '#f1f5f9', color: '#64748b' },
  invoiced: { label: '已開票', bg: '#dbeafe', color: '#2563eb' },
  paid: { label: '已收款', bg: '#dcfce7', color: '#16a34a' },
  overdue: { label: '逾期', bg: '#fee2e2', color: '#dc2626' },
};

const WARRANTY_STATUS = {
  pending: { label: '未啟動', bg: '#f1f5f9', color: '#64748b' },
  active: { label: '保固中', bg: '#dcfce7', color: '#16a34a' },
  expired: { label: '已到期', bg: '#fee2e2', color: '#dc2626' },
};

const MAINTENANCE_STATUS = {
  pending: { label: '待啟動', bg: '#f1f5f9', color: '#64748b' },
  active: { label: '運作中', bg: '#dcfce7', color: '#16a34a' },
  paused: { label: '暫停', bg: '#ffedd5', color: '#ea580c' },
  ended: { label: '已結束', bg: '#fee2e2', color: '#dc2626' },
};

const BASIS_TYPE_LABEL = {
  net_received: '依未稅實收',
  gross_received: '依含稅實收',
  contract_amount: '依合約金額',
};

const TRIGGER_LABEL = {
  acceptance: '驗收通過',
  delivery: '交付完成',
  sign_date: '簽約日',
  custom: '自訂',
};

const START_RULE_LABEL = {
  warranty_end: '保固結束後',
  fixed_date: '固定日期',
  custom: '自訂',
};

const BILLING_CYCLE_LABEL = {
  monthly: '月繳',
  quarterly: '季繳',
  yearly: '年繳',
};

// ── Badge component ──────────────────────────────────────────────
function StatusBadge({ statusMap, status, onClick }) {
  const s = statusMap[status] || { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={styles.badge(s.bg, s.color)} onClick={onClick} title={onClick ? '點擊切換狀態' : undefined}>
      {s.label}
    </span>
  );
}

// ── Collapsible section wrapper ──────────────────────────────────
function Section({ title, defaultOpen = true, count, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setOpen(!open)}>
        <span style={styles.sectionTitle}>
          {title}
          {typeof count === 'number' && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>({count})</span>}
        </span>
        <span style={styles.chevron(open)}>&#9660;</span>
      </div>
      {open && <div style={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function ProjectV2Sections({ projectId }) {
  const [milestones, setMilestones] = useState([]);
  const [paymentSchedules, setPaymentSchedules] = useState([]);
  const [warranty, setWarranty] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const [commissionRules, setCommissionRules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form visibility toggles
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddWarranty, setShowAddWarranty] = useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);

  // Form data
  const [milestoneForm, setMilestoneForm] = useState({ title: '', acceptance_criteria: '', due_date: '' });
  const [paymentForm, setPaymentForm] = useState({ payment_label: '', percentage: '', gross_amount: '', net_amount: '', trigger_type: 'milestone', trigger_description: '', due_date: '' });
  const [warrantyForm, setWarrantyForm] = useState({ warranty_days: '', start_trigger: 'acceptance', start_date: '', scope: '' });
  const [maintenanceForm, setMaintenanceForm] = useState({ monthly_fee: '', billing_cycle: 'monthly', start_rule: 'warranty_end', start_date: '', notes: '' });
  const [ruleForm, setRuleForm] = useState({ user_id: '', commission_rate: '', basis_type: 'net_received', tax_rate_for_deduction: '0.05', notes: '' });

  // ── Fetch helpers ────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    try {
      const [mRes, pRes, wRes, mtRes, crRes, uRes] = await Promise.all([
        supabase.from('project_milestones').select('*').eq('project_id', projectId).order('sequence_order', { ascending: true }),
        supabase.from('project_payment_schedules').select('*').eq('project_id', projectId).order('sequence_no', { ascending: true }),
        supabase.from('project_warranties').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('project_maintenance_plans').select('*').eq('project_id', projectId).maybeSingle(),
        supabase.from('commission_rules').select('*, users(id, name, email)').eq('project_id', projectId),
        supabase.from('users').select('id, name, email'),
      ]);
      if (mRes.data) setMilestones(mRes.data);
      if (pRes.data) setPaymentSchedules(pRes.data);
      setWarranty(wRes.data || null);
      setMaintenance(mtRes.data || null);
      if (crRes.data) setCommissionRules(crRes.data);
      if (uRes.data) setUsers(uRes.data);
    } catch (e) {
      console.error('ProjectV2Sections fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Milestone handlers ───────────────────────────────────────
  const toggleMilestoneStatus = async (m) => {
    const next = MILESTONE_NEXT[m.status] || 'pending';
    const updates = { status: next, updated_at: new Date().toISOString() };
    if (next === 'completed') updates.completed_date = new Date().toISOString().split('T')[0];
    else updates.completed_date = null;

    const { error } = await supabase.from('project_milestones').update(updates).eq('id', m.id);
    if (!error) setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x));
  };

  const addMilestone = async () => {
    if (!milestoneForm.title.trim()) return;
    const maxSeq = milestones.length > 0 ? Math.max(...milestones.map(m => m.sequence_order || 0)) : 0;
    const { data, error } = await supabase.from('project_milestones').insert({
      project_id: projectId,
      title: milestoneForm.title,
      acceptance_criteria: milestoneForm.acceptance_criteria || null,
      due_date: milestoneForm.due_date || null,
      sequence_order: maxSeq + 1,
      status: 'pending',
    }).select().single();
    if (!error && data) {
      setMilestones(prev => [...prev, data]);
      setMilestoneForm({ title: '', acceptance_criteria: '', due_date: '' });
      setShowAddMilestone(false);
    }
  };

  // ── Payment schedule handlers ────────────────────────────────
  const addPaymentSchedule = async () => {
    if (!paymentForm.payment_label.trim()) return;
    const maxSeq = paymentSchedules.length > 0 ? Math.max(...paymentSchedules.map(p => p.sequence_no || 0)) : 0;
    const { data, error } = await supabase.from('project_payment_schedules').insert({
      project_id: projectId,
      sequence_no: maxSeq + 1,
      payment_label: paymentForm.payment_label,
      percentage: paymentForm.percentage ? parseFloat(paymentForm.percentage) : null,
      gross_amount: paymentForm.gross_amount ? parseFloat(paymentForm.gross_amount) : null,
      net_amount: paymentForm.net_amount ? parseFloat(paymentForm.net_amount) : null,
      trigger_type: paymentForm.trigger_type,
      trigger_description: paymentForm.trigger_description || null,
      due_date: paymentForm.due_date || null,
      status: 'pending',
    }).select().single();
    if (!error && data) {
      setPaymentSchedules(prev => [...prev, data]);
      setPaymentForm({ payment_label: '', percentage: '', gross_amount: '', net_amount: '', trigger_type: 'milestone', trigger_description: '', due_date: '' });
      setShowAddPayment(false);
    }
  };

  // ── Warranty handler ─────────────────────────────────────────
  const saveWarranty = async () => {
    if (!warrantyForm.warranty_days) return;
    const payload = {
      project_id: projectId,
      warranty_days: parseInt(warrantyForm.warranty_days),
      start_trigger: warrantyForm.start_trigger,
      start_date: warrantyForm.start_date || null,
      scope: warrantyForm.scope || null,
      status: 'pending',
    };
    let result;
    if (warranty) {
      result = await supabase.from('project_warranties').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', warranty.id).select().single();
    } else {
      result = await supabase.from('project_warranties').insert(payload).select().single();
    }
    if (!result.error && result.data) {
      setWarranty(result.data);
      setShowAddWarranty(false);
    }
  };

  // ── Maintenance handler ──────────────────────────────────────
  const saveMaintenance = async () => {
    const payload = {
      project_id: projectId,
      enabled: true,
      monthly_fee: maintenanceForm.monthly_fee ? parseFloat(maintenanceForm.monthly_fee) : null,
      billing_cycle: maintenanceForm.billing_cycle,
      start_rule: maintenanceForm.start_rule,
      start_date: maintenanceForm.start_date || null,
      notes: maintenanceForm.notes || null,
      status: 'pending',
    };
    let result;
    if (maintenance) {
      result = await supabase.from('project_maintenance_plans').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', maintenance.id).select().single();
    } else {
      result = await supabase.from('project_maintenance_plans').insert(payload).select().single();
    }
    if (!result.error && result.data) {
      setMaintenance(result.data);
      setShowAddMaintenance(false);
    }
  };

  // ── Commission rule handler ──────────────────────────────────
  const addCommissionRule = async () => {
    if (!ruleForm.user_id || !ruleForm.commission_rate) return;
    const { data, error } = await supabase.from('commission_rules').insert({
      project_id: projectId,
      user_id: ruleForm.user_id,
      commission_rate: parseFloat(ruleForm.commission_rate) / 100,
      basis_type: ruleForm.basis_type,
      tax_rate_for_deduction: parseFloat(ruleForm.tax_rate_for_deduction),
      notes: ruleForm.notes || null,
    }).select('*, users(id, name, email)').single();
    if (!error && data) {
      setCommissionRules(prev => [...prev, data]);
      setRuleForm({ user_id: '', commission_rate: '', basis_type: 'net_received', tax_rate_for_deduction: '0.05', notes: '' });
      setShowAddRule(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
        載入 V2 資料中...
      </div>
    );
  }

  // ── Payment progress calculation ─────────────────────────────
  const totalGross = paymentSchedules.reduce((s, p) => s + (parseFloat(p.gross_amount) || 0), 0);
  const totalPaid = paymentSchedules.filter(p => p.status === 'paid').reduce((s, p) => s + (parseFloat(p.actual_paid_amount) || parseFloat(p.gross_amount) || 0), 0);
  const paymentPercent = totalGross > 0 ? Math.min(100, (totalPaid / totalGross * 100)).toFixed(1) : 0;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 4, height: 20, backgroundColor: '#3b82f6', borderRadius: 2, display: 'inline-block' }} />
        合約管理 V2
      </div>

      {/* ── Section 1: 驗收里程碑 ──────────────────────────────── */}
      <Section title="驗收里程碑" count={milestones.length}>
        {milestones.length === 0 && !showAddMilestone && (
          <div style={styles.emptyState}>尚未設定里程碑</div>
        )}
        {milestones.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>序號</th>
                  <th style={styles.th}>名稱</th>
                  <th style={styles.th}>驗收條件</th>
                  <th style={styles.th}>預計日期</th>
                  <th style={styles.th}>狀態</th>
                  <th style={styles.th}>完成日</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m, i) => (
                  <tr key={m.id}>
                    <td style={styles.td}>{m.sequence_order ?? i + 1}</td>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{m.title}</td>
                    <td style={{ ...styles.td, color: '#64748b', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.acceptance_criteria}>{m.acceptance_criteria || '-'}</td>
                    <td style={styles.td}>{m.due_date || '-'}</td>
                    <td style={styles.td}>
                      <StatusBadge statusMap={MILESTONE_STATUS} status={m.status} onClick={() => toggleMilestoneStatus(m)} />
                    </td>
                    <td style={styles.td}>{m.completed_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showAddMilestone && (
          <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={styles.formRow}>
              <div style={styles.formField(2)}>
                <label style={styles.label}>名稱 *</label>
                <input style={styles.input} value={milestoneForm.title} onChange={e => setMilestoneForm({ ...milestoneForm, title: e.target.value })} placeholder="例如：系統上線驗收" />
              </div>
              <div style={styles.formField(2)}>
                <label style={styles.label}>驗收條件</label>
                <input style={styles.input} value={milestoneForm.acceptance_criteria} onChange={e => setMilestoneForm({ ...milestoneForm, acceptance_criteria: e.target.value })} placeholder="驗收標準描述" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>預計日期</label>
                <input style={styles.input} type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} />
              </div>
            </div>
            <div>
              <button style={styles.addBtn} onClick={addMilestone}>確認新增</button>
              <button style={styles.cancelBtn} onClick={() => setShowAddMilestone(false)}>取消</button>
            </div>
          </div>
        )}
        {!showAddMilestone && (
          <div style={{ marginTop: 12 }}>
            <button style={styles.addBtn} onClick={() => setShowAddMilestone(true)}>+ 新增里程碑</button>
          </div>
        )}
      </Section>

      {/* ── Section 2: 付款期程 ────────────────────────────────── */}
      <Section title="付款期程" count={paymentSchedules.length}>
        {paymentSchedules.length === 0 && !showAddPayment && (
          <div style={styles.emptyState}>尚未設定付款期程</div>
        )}
        {paymentSchedules.length > 0 && (
          <>
            {/* Progress bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                <span>收款進度</span>
                <span>{paymentPercent}%（已收 NT$ {totalPaid.toLocaleString()} / 共 NT$ {totalGross.toLocaleString()}）</span>
              </div>
              <div style={styles.progressBarOuter}>
                <div style={{ width: `${paymentPercent}%`, height: '100%', backgroundColor: '#22c55e', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>期數</th>
                    <th style={styles.th}>名稱</th>
                    <th style={styles.th}>比例</th>
                    <th style={styles.th}>含稅金額</th>
                    <th style={styles.th}>未稅金額</th>
                    <th style={styles.th}>觸發條件</th>
                    <th style={styles.th}>狀態</th>
                    <th style={styles.th}>實付金額</th>
                    <th style={styles.th}>實付日期</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentSchedules.map(p => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.sequence_no}</td>
                      <td style={{ ...styles.td, fontWeight: 500 }}>{p.payment_label || '-'}</td>
                      <td style={styles.td}>{p.percentage != null ? `${p.percentage}%` : '-'}</td>
                      <td style={styles.td}>{p.gross_amount != null ? `NT$ ${parseFloat(p.gross_amount).toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{p.net_amount != null ? `NT$ ${parseFloat(p.net_amount).toLocaleString()}` : '-'}</td>
                      <td style={{ ...styles.td, color: '#64748b' }}>{p.trigger_description || (p.trigger_type === 'milestone' ? '里程碑' : p.trigger_type === 'date' ? '日期' : '手動')}</td>
                      <td style={styles.td}>
                        <StatusBadge statusMap={PAYMENT_STATUS} status={p.status} />
                      </td>
                      <td style={styles.td}>{p.actual_paid_amount != null ? `NT$ ${parseFloat(p.actual_paid_amount).toLocaleString()}` : '-'}</td>
                      <td style={styles.td}>{p.actual_paid_date || '-'}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 600 }}>
                    <td style={styles.td} colSpan={3}>合計</td>
                    <td style={styles.td}>NT$ {totalGross.toLocaleString()}</td>
                    <td style={styles.td}>NT$ {paymentSchedules.reduce((s, p) => s + (parseFloat(p.net_amount) || 0), 0).toLocaleString()}</td>
                    <td style={styles.td} colSpan={2}></td>
                    <td style={styles.td}>NT$ {totalPaid.toLocaleString()}</td>
                    <td style={styles.td}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {showAddPayment && (
          <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={styles.formRow}>
              <div style={styles.formField(2)}>
                <label style={styles.label}>名稱 *</label>
                <input style={styles.input} value={paymentForm.payment_label} onChange={e => setPaymentForm({ ...paymentForm, payment_label: e.target.value })} placeholder="例如：第一期" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>比例 (%)</label>
                <input style={styles.input} type="number" value={paymentForm.percentage} onChange={e => setPaymentForm({ ...paymentForm, percentage: e.target.value })} placeholder="30" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>含稅金額</label>
                <input style={styles.input} type="number" value={paymentForm.gross_amount} onChange={e => setPaymentForm({ ...paymentForm, gross_amount: e.target.value })} placeholder="105000" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>未稅金額</label>
                <input style={styles.input} type="number" value={paymentForm.net_amount} onChange={e => setPaymentForm({ ...paymentForm, net_amount: e.target.value })} placeholder="100000" />
              </div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.formField(1)}>
                <label style={styles.label}>觸發條件</label>
                <select style={styles.select} value={paymentForm.trigger_type} onChange={e => setPaymentForm({ ...paymentForm, trigger_type: e.target.value })}>
                  <option value="milestone">里程碑</option>
                  <option value="date">日期</option>
                  <option value="manual">手動</option>
                </select>
              </div>
              <div style={styles.formField(2)}>
                <label style={styles.label}>觸發說明</label>
                <input style={styles.input} value={paymentForm.trigger_description} onChange={e => setPaymentForm({ ...paymentForm, trigger_description: e.target.value })} placeholder="例如：UAT 驗收完成後" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>預計日期</label>
                <input style={styles.input} type="date" value={paymentForm.due_date} onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} />
              </div>
            </div>
            <div>
              <button style={styles.addBtn} onClick={addPaymentSchedule}>確認新增</button>
              <button style={styles.cancelBtn} onClick={() => setShowAddPayment(false)}>取消</button>
            </div>
          </div>
        )}
        {!showAddPayment && (
          <div style={{ marginTop: 12 }}>
            <button style={styles.addBtn} onClick={() => setShowAddPayment(true)}>+ 新增付款期程</button>
          </div>
        )}
      </Section>

      {/* ── Section 3: 保固與維護 ──────────────────────────────── */}
      <Section title="保固與維護">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Warranty card */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>保固</div>
            {warranty ? (
              <>
                <div style={styles.cardRow}><span style={styles.cardLabel}>保固天數</span><span style={styles.cardValue}>{warranty.warranty_days} 天</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>起算條件</span><span style={styles.cardValue}>{TRIGGER_LABEL[warranty.start_trigger] || warranty.start_trigger}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>起始日</span><span style={styles.cardValue}>{warranty.start_date || '尚未設定'}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>到期日</span><span style={styles.cardValue}>{warranty.end_date || '尚未設定'}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>狀態</span><StatusBadge statusMap={WARRANTY_STATUS} status={warranty.status} /></div>
                {warranty.scope && <div style={styles.cardRow}><span style={styles.cardLabel}>範圍</span><span style={{ ...styles.cardValue, fontSize: 12, color: '#64748b' }}>{warranty.scope}</span></div>}
                <div style={{ marginTop: 12 }}>
                  <button style={{ ...styles.addBtn, backgroundColor: '#64748b', fontSize: 11 }} onClick={() => {
                    setWarrantyForm({
                      warranty_days: warranty.warranty_days?.toString() || '',
                      start_trigger: warranty.start_trigger || 'acceptance',
                      start_date: warranty.start_date || '',
                      scope: warranty.scope || '',
                    });
                    setShowAddWarranty(true);
                  }}>編輯</button>
                </div>
              </>
            ) : (
              <>
                <div style={styles.emptyState}>尚未設定</div>
                {!showAddWarranty && (
                  <button style={styles.addBtn} onClick={() => setShowAddWarranty(true)}>+ 新增保固</button>
                )}
              </>
            )}
            {showAddWarranty && (
              <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>保固天數 *</label>
                  <input style={styles.input} type="number" value={warrantyForm.warranty_days} onChange={e => setWarrantyForm({ ...warrantyForm, warranty_days: e.target.value })} placeholder="365" />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>起算條件</label>
                  <select style={styles.select} value={warrantyForm.start_trigger} onChange={e => setWarrantyForm({ ...warrantyForm, start_trigger: e.target.value })}>
                    <option value="acceptance">驗收通過</option>
                    <option value="delivery">交付完成</option>
                    <option value="sign_date">簽約日</option>
                    <option value="custom">自訂</option>
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>起始日</label>
                  <input style={styles.input} type="date" value={warrantyForm.start_date} onChange={e => setWarrantyForm({ ...warrantyForm, start_date: e.target.value })} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>保固範圍</label>
                  <input style={styles.input} value={warrantyForm.scope} onChange={e => setWarrantyForm({ ...warrantyForm, scope: e.target.value })} placeholder="例如：系統主功能、不含客製模組" />
                </div>
                <button style={styles.addBtn} onClick={saveWarranty}>儲存</button>
                <button style={styles.cancelBtn} onClick={() => setShowAddWarranty(false)}>取消</button>
              </div>
            )}
          </div>

          {/* Maintenance card */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>維護計畫</div>
            {maintenance ? (
              <>
                <div style={styles.cardRow}><span style={styles.cardLabel}>啟用</span><span style={styles.cardValue}>{maintenance.enabled ? '是' : '否'}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>月費</span><span style={styles.cardValue}>{maintenance.monthly_fee != null ? `NT$ ${parseFloat(maintenance.monthly_fee).toLocaleString()}` : '尚未設定'}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>計費週期</span><span style={styles.cardValue}>{BILLING_CYCLE_LABEL[maintenance.billing_cycle] || maintenance.billing_cycle}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>起算規則</span><span style={styles.cardValue}>{START_RULE_LABEL[maintenance.start_rule] || maintenance.start_rule}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>起始日</span><span style={styles.cardValue}>{maintenance.start_date || '尚未設定'}</span></div>
                <div style={styles.cardRow}><span style={styles.cardLabel}>狀態</span><StatusBadge statusMap={MAINTENANCE_STATUS} status={maintenance.status} /></div>
                {maintenance.notes && <div style={styles.cardRow}><span style={styles.cardLabel}>備註</span><span style={{ ...styles.cardValue, fontSize: 12, color: '#64748b' }}>{maintenance.notes}</span></div>}
                <div style={{ marginTop: 12 }}>
                  <button style={{ ...styles.addBtn, backgroundColor: '#64748b', fontSize: 11 }} onClick={() => {
                    setMaintenanceForm({
                      monthly_fee: maintenance.monthly_fee?.toString() || '',
                      billing_cycle: maintenance.billing_cycle || 'monthly',
                      start_rule: maintenance.start_rule || 'warranty_end',
                      start_date: maintenance.start_date || '',
                      notes: maintenance.notes || '',
                    });
                    setShowAddMaintenance(true);
                  }}>編輯</button>
                </div>
              </>
            ) : (
              <>
                <div style={styles.emptyState}>尚未設定</div>
                {!showAddMaintenance && (
                  <button style={styles.addBtn} onClick={() => setShowAddMaintenance(true)}>+ 新增維護計畫</button>
                )}
              </>
            )}
            {showAddMaintenance && (
              <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>月費</label>
                  <input style={styles.input} type="number" value={maintenanceForm.monthly_fee} onChange={e => setMaintenanceForm({ ...maintenanceForm, monthly_fee: e.target.value })} placeholder="5000" />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>計費週期</label>
                  <select style={styles.select} value={maintenanceForm.billing_cycle} onChange={e => setMaintenanceForm({ ...maintenanceForm, billing_cycle: e.target.value })}>
                    <option value="monthly">月繳</option>
                    <option value="quarterly">季繳</option>
                    <option value="yearly">年繳</option>
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>起算規則</label>
                  <select style={styles.select} value={maintenanceForm.start_rule} onChange={e => setMaintenanceForm({ ...maintenanceForm, start_rule: e.target.value })}>
                    <option value="warranty_end">保固結束後</option>
                    <option value="fixed_date">固定日期</option>
                    <option value="custom">自訂</option>
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>起始日</label>
                  <input style={styles.input} type="date" value={maintenanceForm.start_date} onChange={e => setMaintenanceForm({ ...maintenanceForm, start_date: e.target.value })} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={styles.label}>備註</label>
                  <input style={styles.input} value={maintenanceForm.notes} onChange={e => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} placeholder="附加說明" />
                </div>
                <button style={styles.addBtn} onClick={saveMaintenance}>儲存</button>
                <button style={styles.cancelBtn} onClick={() => setShowAddMaintenance(false)}>取消</button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── Section 4: 分潤規則 ────────────────────────────────── */}
      <Section title="分潤規則" count={commissionRules.length}>
        {commissionRules.length === 0 && !showAddRule && (
          <div style={styles.emptyState}>尚未設定分潤規則</div>
        )}
        {commissionRules.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>業務</th>
                  <th style={styles.th}>分潤比例</th>
                  <th style={styles.th}>計算基礎</th>
                  <th style={styles.th}>稅率</th>
                  <th style={styles.th}>備註</th>
                </tr>
              </thead>
              <tbody>
                {commissionRules.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{r.users?.name || r.users?.email || r.user_id}</td>
                    <td style={styles.td}>{(parseFloat(r.commission_rate) * 100).toFixed(1)}%</td>
                    <td style={styles.td}>{BASIS_TYPE_LABEL[r.basis_type] || r.basis_type}</td>
                    <td style={styles.td}>{(parseFloat(r.tax_rate_for_deduction) * 100).toFixed(1)}%</td>
                    <td style={{ ...styles.td, color: '#64748b' }}>{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showAddRule && (
          <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={styles.formRow}>
              <div style={styles.formField(2)}>
                <label style={styles.label}>業務 *</label>
                <select style={styles.select} value={ruleForm.user_id} onChange={e => setRuleForm({ ...ruleForm, user_id: e.target.value })}>
                  <option value="">-- 選擇業務 --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>分潤比例 (%) *</label>
                <input style={styles.input} type="number" step="0.1" value={ruleForm.commission_rate} onChange={e => setRuleForm({ ...ruleForm, commission_rate: e.target.value })} placeholder="25" />
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>計算基礎</label>
                <select style={styles.select} value={ruleForm.basis_type} onChange={e => setRuleForm({ ...ruleForm, basis_type: e.target.value })}>
                  <option value="net_received">依未稅實收</option>
                  <option value="gross_received">依含稅實收</option>
                  <option value="contract_amount">依合約金額</option>
                </select>
              </div>
              <div style={styles.formField(1)}>
                <label style={styles.label}>稅率</label>
                <input style={styles.input} type="number" step="0.01" value={ruleForm.tax_rate_for_deduction} onChange={e => setRuleForm({ ...ruleForm, tax_rate_for_deduction: e.target.value })} placeholder="0.05" />
              </div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.formField(3)}>
                <label style={styles.label}>備註</label>
                <input style={styles.input} value={ruleForm.notes} onChange={e => setRuleForm({ ...ruleForm, notes: e.target.value })} placeholder="附加說明" />
              </div>
            </div>
            <div>
              <button style={styles.addBtn} onClick={addCommissionRule}>確認新增</button>
              <button style={styles.cancelBtn} onClick={() => setShowAddRule(false)}>取消</button>
            </div>
          </div>
        )}
        {!showAddRule && (
          <div style={{ marginTop: 12 }}>
            <button style={styles.addBtn} onClick={() => setShowAddRule(true)}>+ 新增分潤規則</button>
          </div>
        )}
      </Section>
    </div>
  );
}
