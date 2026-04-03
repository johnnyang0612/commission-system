import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
// Layout is handled by _app.js
import { supabase } from '../utils/supabaseClient';
import { exportProspectsToExcel, exportProspectReportToPDF } from '../utils/exportUtils';
import styles from '../styles/Prospects.module.css';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const STAGES = [
  { id: '初談', label: '初談', color: '#94a3b8' },
  { id: '提案', label: '提案', color: '#6366f1' },
  { id: '報價', label: '報價', color: '#60a5fa' },
  { id: '談判', label: '談判', color: '#fbbf24' },
  { id: '待簽約', label: '待簽約', color: '#34d399' },
  { id: '已失單', label: '已失單', color: '#f87171' },
  { id: '已轉換', label: '已轉換', color: '#10b981' }
];

const CLOSE_RATE_OPTIONS = [
  { value: 'high', label: '高', color: '#ef4444', percentage: 80 },
  { value: 'medium', label: '中', color: '#f59e0b', percentage: 50 },
  { value: 'low', label: '低', color: '#6b7280', percentage: 20 }
];

const BUDGET_STATUS_OPTIONS = [
  { value: 'sufficient', label: '符合', color: '#10b981' },
  { value: 'insufficient', label: '不夠', color: '#f59e0b' },
  { value: 'too_low', label: '太低', color: '#ef4444' }
];

const ASSISTANCE_TYPES = [
  { value: 'review_quote', label: '審核報價單', priority: 'high' },
  { value: 'approve_proposal', label: '核准提案', priority: 'high' },
  { value: 'negotiation_support', label: '談判支援', priority: 'medium' },
  { value: 'technical_review', label: '技術審核', priority: 'medium' },
  { value: 'pricing_approval', label: '價格核准', priority: 'high' },
  { value: 'contract_review', label: '合約審查', priority: 'high' },
  { value: 'relationship_support', label: '關係維護支援', priority: 'low' },
  { value: 'other', label: '其他', priority: 'medium' }
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '緊急', color: '#ef4444' },
  { value: 'high', label: '高', color: '#f59e0b' },
  { value: 'medium', label: '中', color: '#6366f1' },
  { value: 'low', label: '低', color: '#6b7280' }
];

const ACTION_TYPES = [
  { value: 'phone', label: '電話聯絡', icon: '📞', color: '#10b981' },
  { value: 'meeting', label: '面談會議', icon: '🤝', color: '#6366f1' },
  { value: 'presentation', label: '產品簡報', icon: '📊', color: '#8b5cf6' },
  { value: 'quotation', label: '報價提供', icon: '💰', color: '#f59e0b' },
  { value: 'document', label: '資料寄送', icon: '📄', color: '#06b6d4' },
  { value: 'sample', label: '樣品寄送', icon: '📦', color: '#84cc16' },
  { value: 'visit', label: '客戶拜訪', icon: '🏢', color: '#ec4899' },
  { value: 'demo', label: '產品展示', icon: '🖥️', color: '#6366f1' },
  { value: 'negotiation', label: '價格談判', icon: '💬', color: '#f97316' },
  { value: 'contract', label: '合約簽署', icon: '✍️', color: '#10b981' },
  { value: 'followup', label: '後續追蹤', icon: '📋', color: '#6b7280' },
  { value: 'other', label: '其他', icon: '📝', color: '#6b7280' }
];

export default function Prospects() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('priority'); // 'priority' | 'kanban' | 'tasks'
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [filters, setFilters] = useState({
    closeRate: '',
    budgetStatus: '',
    owner: '',
    stage: '',
    source: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [formData, setFormData] = useState({
    client_name: '',
    project_name: '',
    estimated_amount: '',
    commission_rate: 15,
    owner_id: '',
    stage: '初談',
    expected_sign_date: '',
    source: '',
    note: '',
    use_fixed_commission: false,
    fixed_commission_percentage: '',
    // 新增戰情室欄位
    close_rate: 'medium',
    budget_status: 'sufficient',
    next_followup_date: '',
    decision_maker_name: '',
    decision_maker_position: '',
    decision_maker_contact: '',
    key_influencers: '',
    main_pain_points: '',
    close_obstacles: '',
    competitor_name: '',
    competitor_status: 'none'
  });
  const [statistics, setStatistics] = useState(null);
  const [actionRecords, setActionRecords] = useState([]);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionForm, setActionForm] = useState({
    action_type: 'phone',
    content: '',
    next_followup_date: '',
    attachments: []
  });
  const [showAssistanceModal, setShowAssistanceModal] = useState(false);
  const [assistanceRequests, setAssistanceRequests] = useState([]);
  const [assistanceForm, setAssistanceForm] = useState({
    type: 'review_quote',
    priority: 'medium', 
    description: '',
    deadline: ''
  });
  const [sharedFiles, setSharedFiles] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Activities (新任務系統) 狀態
  const [activities, setActivities] = useState([]);
  const [groupedActivities, setGroupedActivities] = useState({
    overdue: [],
    today: [],
    soon: [],
    unscheduled: []
  });
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [selectedProspects, setSelectedProspects] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  
  // 觸控滑動狀態
  const [swipeState, setSwipeState] = useState({
    startX: 0,
    startY: 0,
    currentX: 0,
    isSwiping: false,
    swipedItem: null
  });
  
  // 結案對話框狀態
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [closingProspect, setClosingProspect] = useState(null);
  const [closingForm, setClosingForm] = useState({
    result: 'won', // 'won' | 'lost'
    reason: '',
    close_date: new Date().toISOString().split('T')[0],
    final_amount: '',
    notes: ''
  });

  useEffect(() => {
    checkUser();
    fetchUsers();
    fetchProspects();
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (viewMode === 'tasks') {
      fetchActivities();
    }
  }, [viewMode]);

  // 當案件資料變化時計算提醒
  useEffect(() => {
    if (prospects.length > 0) {
      calculateNotifications();
    }
  }, [prospects]);

  // 當選擇案件時載入共享檔案和行動記錄
  useEffect(() => {
    if (selectedProspect) {
      fetchSharedFiles(selectedProspect.id);
      fetchActionRecords(selectedProspect.id);
    }
  }, [selectedProspect]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    setUser(userData);
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .in('role', ['sales', 'leader'])
        .order('name');
      
      if (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
        return;
      }
      
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const fetchProspects = async () => {
    try {
      let query = supabase
        .from('prospects')
        .select(`
          *,
          owner:users!owner_id(id, name)
        `)
        .not('stage', 'eq', '已轉換')
        .order('created_at', { ascending: false });

      // Role-based filtering: sales can only see their own prospects
      if (user && user.role === 'sales') {
        query = query.eq('owner_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('Error fetching prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const { data, error } = await supabase
        .from('prospect_statistics')
        .select('*')
        .single();
      
      if (error) {
        console.warn('Error fetching statistics:', error);
        setStatistics(null);
        return;
      }
      
      setStatistics(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      setStatistics(null);
    }
  };

  const fetchActivities = async (owner = 'me', status = 'open') => {
    setLoadingActivities(true);
    try {
      const response = await fetch(`/api/activities?owner=${owner}&status=${status}`);
      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }
      
      const result = await response.json();
      setActivities(result.activities || []);
      setGroupedActivities(result.grouped || {
        overdue: [],
        today: [],
        soon: [],
        unscheduled: []
      });
    } catch (error) {
      console.error('Error fetching activities:', error);
      setActivities([]);
      setGroupedActivities({
        overdue: [],
        today: [],
        soon: [],
        unscheduled: []
      });
    } finally {
      setLoadingActivities(false);
    }
  };

  const createActivity = async (activityData) => {
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityData),
      });

      if (!response.ok) {
        throw new Error('Failed to create activity');
      }

      const result = await response.json();
      
      // 重新載入 activities
      await fetchActivities();
      
      return result.activity;
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  };

  const updateActivity = async (activityId, updateData) => {
    try {
      const response = await fetch(`/api/activities/${activityId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('Failed to update activity');
      }

      const result = await response.json();
      
      // 重新載入 activities
      await fetchActivities();
      
      return result.activity;
    } catch (error) {
      console.error('Error updating activity:', error);
      throw error;
    }
  };

  const batchUpdateActivities = async (activityIds, action, data = {}) => {
    try {
      const response = await fetch('/api/activities/batch', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activity_ids: activityIds,
          action,
          data
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to batch update activities');
      }

      const result = await response.json();
      
      // 重新載入 activities
      await fetchActivities();
      
      return result;
    } catch (error) {
      console.error('Error batch updating activities:', error);
      throw error;
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const { draggableId, source, destination } = result;
    
    // If dropped in the same position, do nothing
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }
    
    // If moving to a different stage
    if (source.droppableId !== destination.droppableId) {
      const newStage = destination.droppableId;
      const oldStage = source.droppableId;
      
      // Check if moving to terminal stages (已失單/已轉換) - should show closing dialog
      if (['已失單', '已轉換'].includes(newStage)) {
        const prospect = prospects.find(p => p.id === draggableId);
        if (prospect) {
          setClosingProspect(prospect);
          setClosingForm({
            result: newStage === '已轉換' ? 'won' : 'lost',
            reason: '',
            close_date: new Date().toISOString().split('T')[0],
            final_amount: prospect.estimated_amount || '',
            notes: ''
          });
          setShowClosingDialog(true);
        }
        return;
      }
      
      await updateProspectStage(draggableId, newStage, oldStage);
    } else {
      // Handle manual ordering within the same column
      await updateManualOrder(draggableId, destination.droppableId, destination.index);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingProspect) {
        const { error } = await supabase
          .from('prospects')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProspect.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('prospects')
          .insert([{
            ...formData,
            owner_id: formData.owner_id || user?.id
          }]);
        
        if (error) throw error;
      }
      
      setShowModal(false);
      resetForm();
      fetchProspects();
      fetchStatistics();
    } catch (error) {
      console.error('Error saving prospect:', error);
      alert('儲存失敗：' + error.message);
    }
  };

  const handleConvertToProject = async (prospect) => {
    if (!confirm(`確定要將「${prospect.project_name}」轉換為正式專案嗎？`)) return;
    
    const projectCode = prompt('請輸入專案編號：');
    if (!projectCode) return;
    
    try {
      const { data, error } = await supabase.rpc('convert_prospect_to_project', {
        p_prospect_id: prospect.id,
        p_project_code: projectCode,
        p_project_type: 'new',
        p_payment_template: 'single'
      });
      
      if (error) throw error;
      
      alert('轉換成功！');
      router.push(`/projects/${data}`);
    } catch (error) {
      console.error('Error converting prospect:', error);
      alert('轉換失敗：' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: '',
      project_name: '',
      estimated_amount: '',
      commission_rate: 15,
      owner_id: user?.id || '', // 預設為當前使用者
      stage: '初談',
      expected_sign_date: '',
      source: '',
      note: '',
      use_fixed_commission: false,
      fixed_commission_percentage: '',
      // 戰情室新欄位
      close_rate: 'medium',
      budget_status: 'sufficient',
      next_followup_date: '',
      decision_maker_name: '',
      decision_maker_position: '',
      decision_maker_contact: '',
      key_influencers: '',
      main_pain_points: '',
      close_obstacles: '',
      competitor_name: '',
      competitor_status: 'none'
    });
    setEditingProspect(null);
  };

  const openEditModal = (prospect) => {
    setEditingProspect(prospect);
    setFormData({
      client_name: prospect.client_name,
      project_name: prospect.project_name,
      estimated_amount: prospect.estimated_amount,
      commission_rate: prospect.commission_rate,
      owner_id: prospect.owner_id,
      stage: prospect.stage,
      expected_sign_date: prospect.expected_sign_date || '',
      source: prospect.source || '',
      note: prospect.note || '',
      use_fixed_commission: prospect.use_fixed_commission || false,
      fixed_commission_percentage: prospect.fixed_commission_percentage || '',
      // 戰情室新欄位
      close_rate: prospect.close_rate || 'medium',
      budget_status: prospect.budget_status || 'sufficient',
      next_followup_date: prospect.next_followup_date || '',
      decision_maker_name: prospect.decision_maker_name || '',
      decision_maker_position: prospect.decision_maker_position || '',
      decision_maker_contact: prospect.decision_maker_contact || '',
      key_influencers: prospect.key_influencers || '',
      main_pain_points: prospect.main_pain_points || '',
      close_obstacles: prospect.close_obstacles || '',
      competitor_name: prospect.competitor_name || '',
      competitor_status: prospect.competitor_status || 'none'
    });
    setShowModal(true);
  };

  const getFunnelData = () => {
    const stageOrder = ['初談', '報價中', '等客戶回覆', '確認簽約'];
    return stageOrder.map(stage => ({
      stage,
      value: prospects.filter(p => p.stage === stage).length,
      fill: STAGES.find(s => s.id === stage)?.color || '#94a3b8'
    }));
  };

  const getPipelineValue = () => {
    return prospects
      .filter(p => !['已失單', '已轉換'].includes(p.stage))
      .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0), 0);
  };

  const getEstimatedCommission = () => {
    return prospects
      .filter(p => !['已失單', '已轉換'].includes(p.stage))
      .reduce((sum, p) => sum + (parseFloat(p.estimated_amount || 0) * parseFloat(p.commission_rate || 0) / 100), 0);
  };

  // 計算分潤比例（階梯式 vs 固定）
  const calculateCommissionRate = (amount, useFixed = false, fixedRate = '') => {
    if (useFixed && fixedRate) {
      return parseFloat(fixedRate);
    }
    
    // 階梯式分潤比例
    if (amount <= 100000) return 35;
    if (amount <= 300000) return 30;
    if (amount <= 600000) return 25;
    if (amount <= 1000000) return 20;
    return 10;
  };

  // 當金額變化時自動計算分潤比例
  const handleAmountChange = (amount) => {
    const newAmount = parseFloat(amount) || 0;
    let newCommissionRate = formData.commission_rate;
    
    if (!formData.use_fixed_commission) {
      newCommissionRate = calculateCommissionRate(newAmount);
    }
    
    setFormData({
      ...formData,
      estimated_amount: amount,
      commission_rate: newCommissionRate
    });
  };

  // 處理表格模式的階段變更
  const handleStageChange = async (prospectId, newStage) => {
    const prospect = prospects.find(p => p.id === prospectId);
    const oldStage = prospect?.stage;
    
    if (oldStage === newStage) return;
    
    await updateProspectStage(prospectId, newStage, oldStage);
  };

  // 共用的階段更新函數
  const updateProspectStage = async (prospectId, newStage, oldStage) => {
    try {
      // Update local state optimistically
      const updatedProspects = prospects.map(p => 
        p.id === prospectId ? { ...p, stage: newStage, stage_updated_at: new Date().toISOString() } : p
      );
      setProspects(updatedProspects);

      // Update in database
      const { error } = await supabase
        .from('prospects')
        .update({ 
          stage: newStage, 
          updated_at: new Date().toISOString()
          // stage_updated_at 會由觸發器自動更新
        })
        .eq('id', prospectId);
      
      if (error) {
        console.error('Error updating prospect stage:', error);
        alert(`更新階段失敗：${error.message}`);
        // Revert on error
        await fetchProspects();
        return;
      }

      // Log the change (處理可能的錯誤)
      try {
        await supabase.from('prospect_activities').insert({
          prospect_id: prospectId,
          user_id: user?.id,
          activity_type: 'stage_change',
          old_value: oldStage,
          new_value: newStage,
          description: `階段從 ${oldStage} 變更為 ${newStage}`
        });
      } catch (logError) {
        console.warn('Failed to log stage change:', logError);
        // 不影響主要功能，只是記錄失敗
      }
    } catch (error) {
      console.error('Unexpected error in updateProspectStage:', error);
      alert('更新階段時發生未預期錯誤');
      await fetchProspects();
    }
  };

  const updateManualOrder = async (prospectId, stage, newIndex) => {
    try {
      // 取得該階段的所有案件，按目前排序順序
      const stageProspects = getSortedProspects().filter(p => p.stage === stage);
      const draggedProspect = stageProspects.find(p => p.id === prospectId);
      
      if (!draggedProspect) {
        console.warn('Dragged prospect not found:', prospectId);
        return;
      }
      
      // 移除被拖拽的案件
      const otherProspects = stageProspects.filter(p => p.id !== prospectId);
      
      // 在新位置插入
      otherProspects.splice(newIndex, 0, draggedProspect);
      
      // 重新分配 manual_order（從1開始）
      const updates = otherProspects.map((prospect, index) => ({
        id: prospect.id,
        manual_order: index + 1
      }));
      
      // 批次更新資料庫
      const updatePromises = updates.map(({ id, manual_order }) => 
        supabase
          .from('prospects')
          .update({ 
            manual_order, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', id)
      );
      
      const results = await Promise.all(updatePromises);
      
      // 檢查是否有更新失敗
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('Some manual order updates failed:', errors);
        alert('部分排序更新失敗，請重試');
        await fetchProspects();
        return;
      }
      
      // 重新載入數據以反映更新
      await fetchProspects();
      
    } catch (error) {
      console.error('Error updating manual order:', error);
      alert(`更新排序失敗：${error.message}`);
      // 發生錯誤時重新載入以復原狀態
      await fetchProspects();
    }
  };

  if (loading) return <div>載入中...</div>;

  // 智能排序函數
  const getSortedProspects = () => {
    let filtered = prospects.filter(p => !['已失單', '已轉換'].includes(p.stage));
    
    // 篩選
    if (filters.closeRate) {
      filtered = filtered.filter(p => p.close_rate === filters.closeRate);
    }
    if (filters.budgetStatus) {
      filtered = filtered.filter(p => p.budget_status === filters.budgetStatus);
    }
    if (filters.owner) {
      filtered = filtered.filter(p => p.owner_id === filters.owner);
    }
    if (filters.stage) {
      filtered = filtered.filter(p => p.stage === filters.stage);
    }
    if (filters.source) {
      filtered = filtered.filter(p => p.source && p.source.includes(filters.source));
    }
    
    // 排序：手動排序優先 → 成交率高 → 下次追蹤日期近 → 預估金額大
    return filtered.sort((a, b) => {
      // 0. 手動排序優先（同階段內）
      if (a.stage === b.stage) {
        const aManualOrder = parseInt(a.manual_order || 0);
        const bManualOrder = parseInt(b.manual_order || 0);
        if (aManualOrder !== bManualOrder && (aManualOrder > 0 || bManualOrder > 0)) {
          // 手動排序值大的在前（最後拖拽的在最前）
          if (aManualOrder === 0) return 1; // a 沒有手動排序，b 在前
          if (bManualOrder === 0) return -1; // b 沒有手動排序，a 在前
          return aManualOrder - bManualOrder; // 都有手動排序，小數值在前
        }
      }
      
      // 1. 成交率排序
      const aCloseRate = CLOSE_RATE_OPTIONS.find(opt => opt.value === (a.close_rate || 'medium'))?.percentage || 50;
      const bCloseRate = CLOSE_RATE_OPTIONS.find(opt => opt.value === (b.close_rate || 'medium'))?.percentage || 50;
      if (aCloseRate !== bCloseRate) return bCloseRate - aCloseRate;
      
      // 2. 下次追蹤日期排序（近的在前）
      const aNext = new Date(a.next_followup_date || '9999-12-31');
      const bNext = new Date(b.next_followup_date || '9999-12-31');
      if (aNext.getTime() !== bNext.getTime()) return aNext.getTime() - bNext.getTime();
      
      // 3. 預估金額排序（大的在前）
      const aAmount = parseFloat(a.estimated_amount || 0);
      const bAmount = parseFloat(b.estimated_amount || 0);
      return bAmount - aAmount;
    });
  };

  // 計算倒數天數
  const getDaysUntil = (dateString) => {
    if (!dateString) return null;
    const targetDate = new Date(dateString);
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // 獲取成交率標籤樣式
  const getCloseRateStyle = (closeRate) => {
    const option = CLOSE_RATE_OPTIONS.find(opt => opt.value === closeRate);
    return option ? { backgroundColor: option.color, color: 'white' } : {};
  };

  // 處理協助請求
  const handleAssistanceRequest = async (e) => {
    e.preventDefault();
    
    if (!selectedProspect) {
      alert('請先選擇案件');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('assistance_requests')
        .insert([{
          prospect_id: selectedProspect.id,
          requester_id: user.id,
          type: assistanceForm.type,
          priority: assistanceForm.priority,
          description: assistanceForm.description,
          deadline: assistanceForm.deadline || null,
          status: 'pending'
        }]);
      
      if (error) throw error;
      
      // 重置表單
      setAssistanceForm({
        type: 'review_quote',
        priority: 'medium',
        description: '',
        deadline: ''
      });
      
      setShowAssistanceModal(false);
      alert('協助請求已發送！主管會收到通知。');
      
    } catch (error) {
      console.error('Error creating assistance request:', error);
      alert('發送協助請求失敗：' + error.message);
    }
  };

  // 獲取共享檔案
  const fetchSharedFiles = async (prospectId) => {
    try {
      const { data, error } = await supabase
        .from('shared_files')
        .select(`
          *,
          uploader:users!uploader_id(name)
        `)
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSharedFiles(data || []);
    } catch (error) {
      console.error('Error fetching shared files:', error);
      setSharedFiles([]);
    }
  };

  // 處理檔案上傳
  const handleFileUpload = async (event, prospectId) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadingFile(true);

    try {
      // 上傳檔案到 Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${prospectId}_${Date.now()}.${fileExt}`;
      const filePath = `shared-files/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 獲取檔案的公開 URL
      const { data: urlData } = supabase.storage
        .from('files')
        .getPublicUrl(filePath);

      // 儲存檔案資訊到資料庫
      const { error: dbError } = await supabase
        .from('shared_files')
        .insert([{
          prospect_id: prospectId,
          uploader_id: user.id,
          file_name: file.name,
          file_path: filePath,
          file_url: urlData.publicUrl,
          file_size: file.size,
          mime_type: file.type
        }]);

      if (dbError) throw dbError;

      // 重新載入檔案列表
      fetchSharedFiles(prospectId);
      alert('檔案上傳成功！');
      
      // 清空檔案輸入
      event.target.value = '';
      
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('檔案上傳失敗：' + error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // 下載檔案到LINE (實際上是下載到瀏覽器)
  const handleDownloadToLine = (file) => {
    // 創建下載連結
    const link = document.createElement('a');
    link.href = file.file_url;
    link.download = file.file_name;
    link.target = '_blank';
    
    // 觸發下載
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 顯示提示訊息
    alert(`檔案 "${file.file_name}" 已開始下載！\n下載完成後，您可以直接分享到LINE群組。`);
  };

  // 刪除共享檔案
  const handleDeleteFile = async (fileId, filePath) => {
    if (!confirm('確定要刪除這個檔案嗎？')) return;
    
    try {
      // 從 Storage 刪除檔案
      const { error: storageError } = await supabase.storage
        .from('files')
        .remove([filePath]);
      
      if (storageError) throw storageError;
      
      // 從資料庫刪除記錄
      const { error: dbError } = await supabase
        .from('shared_files')
        .delete()
        .eq('id', fileId);
      
      if (dbError) throw dbError;
      
      // 重新載入檔案列表
      fetchSharedFiles(selectedProspect.id);
      alert('檔案已刪除');
      
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('刪除檔案失敗：' + error.message);
    }
  };

  // 獲取行動記錄
  const fetchActionRecords = async (prospectId) => {
    try {
      const { data, error } = await supabase
        .from('action_records')
        .select(`
          *,
          user:users!user_id(name)
        `)
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setActionRecords(data || []);
    } catch (error) {
      console.error('Error fetching action records:', error);
      setActionRecords([]);
    }
  };

  // 處理新增行動記錄
  const handleAddAction = async (e) => {
    e.preventDefault();
    
    if (!selectedProspect) {
      alert('請先選擇案件');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('action_records')
        .insert([{
          prospect_id: selectedProspect.id,
          user_id: user.id,
          action_type: actionForm.action_type,
          content: actionForm.content,
          next_followup_date: actionForm.next_followup_date || null,
          attachments: actionForm.attachments
        }]);
      
      if (error) throw error;
      
      // 如果設定了下次追蹤日期，更新案件資訊
      if (actionForm.next_followup_date) {
        const { error: updateError } = await supabase
          .from('prospects')
          .update({ 
            next_followup_date: actionForm.next_followup_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedProspect.id);
        
        if (updateError) throw updateError;
      }
      
      // 重置表單
      setActionForm({
        action_type: 'phone',
        content: '',
        next_followup_date: '',
        attachments: []
      });
      
      setShowActionModal(false);
      
      // 重新載入數據
      fetchActionRecords(selectedProspect.id);
      fetchProspects();
      alert('行動記錄已新增！');
      
    } catch (error) {
      console.error('Error adding action record:', error);
      alert('新增行動記錄失敗：' + error.message);
    }
  };

  // 處理行動記錄的檔案上傳
  const handleActionFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const uploadedFiles = [];
    
    for (const file of files) {
      try {
        // 上傳檔案到 Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `action_${selectedProspect.id}_${Date.now()}.${fileExt}`;
        const filePath = `action-files/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 獲取檔案的公開 URL
        const { data: urlData } = supabase.storage
          .from('files')
          .getPublicUrl(filePath);

        uploadedFiles.push({
          name: file.name,
          path: filePath,
          url: urlData.publicUrl,
          size: file.size
        });
        
      } catch (error) {
        console.error('Error uploading file:', error);
        alert(`檔案 "${file.name}" 上傳失敗：${error.message}`);
      }
    }
    
    // 更新表單中的附件
    setActionForm({
      ...actionForm,
      attachments: [...actionForm.attachments, ...uploadedFiles]
    });
    
    // 清空檔案輸入
    event.target.value = '';
  };

  // 移除行動記錄的附件
  const removeActionAttachment = (index) => {
    const newAttachments = [...actionForm.attachments];
    newAttachments.splice(index, 1);
    setActionForm({
      ...actionForm,
      attachments: newAttachments
    });
  };

  // 計算提醒通知
  const calculateNotifications = () => {
    const now = new Date();
    const notifications = [];

    prospects.forEach(prospect => {
      // 跳過已失單和已轉換的案件
      if (['已失單', '已轉換'].includes(prospect.stage)) return;

      // 1. 下次追蹤日期到期提醒
      if (prospect.next_followup_date) {
        const followupDate = new Date(prospect.next_followup_date);
        const daysDiff = Math.ceil((followupDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 0) {
          notifications.push({
            id: `followup-${prospect.id}`,
            type: 'overdue',
            priority: 'high',
            title: '追蹤逾期',
            message: `案件「${prospect.client_name} - ${prospect.project_name}」追蹤已逾期 ${Math.abs(daysDiff)} 天`,
            prospect: prospect,
            daysOverdue: Math.abs(daysDiff)
          });
        } else if (daysDiff <= 1) {
          notifications.push({
            id: `followup-${prospect.id}`,
            type: 'due_soon',
            priority: 'medium',
            title: '即將到期',
            message: `案件「${prospect.client_name} - ${prospect.project_name}」${daysDiff === 0 ? '今天' : '明天'}需要追蹤`,
            prospect: prospect,
            daysLeft: daysDiff
          });
        }
      }

      // 2. 簽約日期前7天提醒
      if (prospect.expected_sign_date) {
        const signDate = new Date(prospect.expected_sign_date);
        const daysDiff = Math.ceil((signDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7 && daysDiff > 0) {
          notifications.push({
            id: `sign-${prospect.id}`,
            type: 'contract_due',
            priority: 'high',
            title: '簽約期限接近',
            message: `案件「${prospect.client_name} - ${prospect.project_name}」預計 ${daysDiff} 天後簽約`,
            prospect: prospect,
            daysLeft: daysDiff
          });
        } else if (daysDiff <= 0) {
          notifications.push({
            id: `sign-${prospect.id}`,
            type: 'contract_overdue',
            priority: 'urgent',
            title: '簽約已逾期',
            message: `案件「${prospect.client_name} - ${prospect.project_name}」簽約已逾期 ${Math.abs(daysDiff)} 天`,
            prospect: prospect,
            daysOverdue: Math.abs(daysDiff)
          });
        }
      }

      // 3. 14天未更新黃牌提醒
      if (prospect.updated_at) {
        const updatedDate = new Date(prospect.updated_at);
        const daysDiff = Math.ceil((now - updatedDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff >= 14) {
          notifications.push({
            id: `inactive-${prospect.id}`,
            type: 'inactive',
            priority: daysDiff >= 30 ? 'urgent' : 'medium',
            title: daysDiff >= 30 ? '長期未更新' : '未更新提醒',
            message: `案件「${prospect.client_name} - ${prospect.project_name}」已 ${daysDiff} 天未更新`,
            prospect: prospect,
            daysInactive: daysDiff
          });
        }
      }

      // 4. 高價案優先提醒
      const amount = parseFloat(prospect.estimated_amount || 0);
      const closeRate = CLOSE_RATE_OPTIONS.find(opt => opt.value === (prospect.close_rate || 'medium'))?.percentage || 50;
      
      if (amount >= 500000 && closeRate >= 70) {
        notifications.push({
          id: `priority-${prospect.id}`,
          type: 'priority',
          priority: 'high',
          title: '優先案件',
          message: `高價案「${prospect.client_name} - ${prospect.project_name}」(NT$ ${amount.toLocaleString()}) 成交率${closeRate}%，建議優先跟進`,
          prospect: prospect,
          amount: amount,
          closeRate: closeRate
        });
      }
    });

    // 按優先級排序
    const priorityOrder = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };
    notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    setNotifications(notifications);
  };

  // 獲取提醒圖示
  const getNotificationIcon = (type) => {
    switch(type) {
      case 'overdue': return '⚠️';
      case 'due_soon': return '📅';
      case 'contract_due': return '✍️';
      case 'contract_overdue': return '🚨';
      case 'inactive': return '💤';
      case 'priority': return '⭐';
      default: return '📢';
    }
  };

  // 獲取提醒顏色
  const getNotificationColor = (priority) => {
    switch(priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'medium': return '#6366f1';
      case 'low': return '#6b7280';
      default: return '#6b7280';
    }
  };

  // Activities 處理函數
  const handleCompleteActivity = async (activityId) => {
    try {
      await updateActivity(activityId, {
        result: 'completed',
        done_at: new Date().toISOString()
      });
      alert('任務已完成！');
    } catch (error) {
      alert('完成任務失敗：' + error.message);
    }
  };

  const handleRescheduleActivity = async (activityId, newDate) => {
    try {
      await updateActivity(activityId, {
        due_at: newDate
      });
      alert('任務已改期！');
    } catch (error) {
      alert('改期失敗：' + error.message);
    }
  };

  const handleSelectActivity = (activityId, isSelected) => {
    if (isSelected) {
      setSelectedActivities(prev => [...prev, activityId]);
    } else {
      setSelectedActivities(prev => prev.filter(id => id !== activityId));
    }
  };

  const handleBulkComplete = async () => {
    if (selectedActivities.length === 0) return;
    
    try {
      await batchUpdateActivities(selectedActivities, 'complete');
      setSelectedActivities([]);
      alert(`已完成 ${selectedActivities.length} 個任務！`);
    } catch (error) {
      alert('批次完成失敗：' + error.message);
    }
  };

  const handleBulkReschedule = async () => {
    if (selectedActivities.length === 0) return;
    
    const newDate = prompt('請輸入新的到期日期 (YYYY-MM-DD):');
    if (!newDate) return;
    
    try {
      await batchUpdateActivities(selectedActivities, 'reschedule', {
        due_at: newDate
      });
      setSelectedActivities([]);
      alert(`已改期 ${selectedActivities.length} 個任務！`);
    } catch (error) {
      alert('批次改期失敗：' + error.message);
    }
  };

  // Prospects 批次操作處理函數
  const handleSelectProspect = (prospectId, isSelected) => {
    if (isSelected) {
      setSelectedProspects(prev => [...prev, prospectId]);
    } else {
      setSelectedProspects(prev => prev.filter(id => id !== prospectId));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedProspects.length === 0) return;
    
    const selectedUser = prompt(`選擇要指派的業務人員:\n${users.map((user, i) => `${i + 1}. ${user.name}`).join('\n')}\n\n請輸入編號:`);
    if (!selectedUser) return;
    
    const userIndex = parseInt(selectedUser) - 1;
    if (userIndex < 0 || userIndex >= users.length) {
      alert('無效的選項');
      return;
    }
    
    try {
      const updates = selectedProspects.map(id => 
        supabase
          .from('prospects')
          .update({ 
            owner_id: users[userIndex].id,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
      );
      
      await Promise.all(updates);
      setSelectedProspects([]);
      fetchProspects();
      alert(`已指派 ${selectedProspects.length} 個案件給 ${users[userIndex].name}！`);
    } catch (error) {
      alert('批次指派失敗：' + error.message);
    }
  };

  const handleBulkCloseRateUpdate = async () => {
    if (selectedProspects.length === 0) return;
    
    const options = CLOSE_RATE_OPTIONS.map((opt, i) => `${i + 1}. ${opt.label} (${opt.percentage}%)`).join('\n');
    const selection = prompt(`選擇新的成交率:\n${options}\n\n請輸入編號:`);
    if (!selection) return;
    
    const optionIndex = parseInt(selection) - 1;
    if (optionIndex < 0 || optionIndex >= CLOSE_RATE_OPTIONS.length) {
      alert('無效的選項');
      return;
    }
    
    try {
      const updates = selectedProspects.map(id => 
        supabase
          .from('prospects')
          .update({ 
            close_rate: CLOSE_RATE_OPTIONS[optionIndex].value,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
      );
      
      await Promise.all(updates);
      setSelectedProspects([]);
      fetchProspects();
      alert(`已更新 ${selectedProspects.length} 個案件的成交率為：${CLOSE_RATE_OPTIONS[optionIndex].label}！`);
    } catch (error) {
      alert('批次更新成交率失敗：' + error.message);
    }
  };

  const handleBulkFollowupUpdate = async () => {
    if (selectedProspects.length === 0) return;
    
    // 快速日期選項 (與單個案件相同)
    const quickDateOptions = [
      { label: '今天', days: 0 },
      { label: '明天', days: 1 },
      { label: '3天後', days: 3 },
      { label: '1週後', days: 7 },
      { label: '2週後', days: 14 },
      { label: '1個月後', days: 30 }
    ];
    
    const today = new Date();
    const options = quickDateOptions.map((option, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() + option.days);
      return `${index + 1}. ${option.label} (${date.getMonth() + 1}/${date.getDate()})`;
    }).join('\n');
    
    const choice = prompt(
      `批次設定追蹤日期 (${selectedProspects.length} 個案件):\n\n${options}\n7. 自定義日期\n\n請輸入編號:`
    );
    
    if (!choice) return;
    
    let newDate;
    const choiceNum = parseInt(choice);
    
    if (choiceNum >= 1 && choiceNum <= 6) {
      // 使用快速選項
      const selectedOption = quickDateOptions[choiceNum - 1];
      const date = new Date(today);
      date.setDate(date.getDate() + selectedOption.days);
      newDate = date.toISOString().split('T')[0];
    } else if (choiceNum === 7) {
      // 自定義日期
      newDate = prompt('請輸入追蹤日期 (YYYY-MM-DD):');
      if (!newDate) return;
    } else {
      alert('無效的選項');
      return;
    }
    
    try {
      const updates = selectedProspects.map(id => 
        supabase
          .from('prospects')
          .update({ 
            next_followup_date: newDate,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
      );
      
      await Promise.all(updates);
      setSelectedProspects([]);
      fetchProspects();
      
      // 友善的確認訊息
      const selectedDate = new Date(newDate);
      const dateStr = `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`;
      alert(`✅ 已更新 ${selectedProspects.length} 個案件的追蹤日期為：${dateStr}！`);
    } catch (error) {
      alert('批次更新追蹤日期失敗：' + error.message);
    }
  };

  // 觸控滑動處理函數
  const handleTouchStart = (e, itemId) => {
    const touch = e.touches[0];
    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      isSwiping: false,
      swipedItem: itemId
    });
  };

  const handleTouchMove = (e, itemId) => {
    if (swipeState.swipedItem !== itemId) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;
    
    // 判斷是否為水平滑動
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
      setSwipeState(prev => ({
        ...prev,
        currentX: touch.clientX,
        isSwiping: true
      }));
    }
  };

  const handleTouchEnd = (e, itemId, itemType = 'prospect') => {
    if (swipeState.swipedItem !== itemId) return;
    
    const deltaX = swipeState.currentX - swipeState.startX;
    
    // 左滑超過100px觸發動作
    if (deltaX < -100) {
      if (itemType === 'prospect') {
        const prospect = prospects.find(p => p.id === itemId);
        if (prospect) {
          // 顯示快速動作選單
          showQuickActionMenu(prospect);
        }
      }
    }
    
    // 重置滑動狀態
    setSwipeState({
      startX: 0,
      startY: 0,
      currentX: 0,
      isSwiping: false,
      swipedItem: null
    });
  };

  const showQuickActionMenu = (prospect) => {
    const actions = [
      '1. 📞 電話聯絡',
      '2. 📅 改追蹤日期',
      '3. 📊 調成交率',
      '4. 👤 重新指派',
      '5. 取消'
    ].join('\n');
    
    const choice = prompt(`快速動作選單 - ${prospect.client_name}:\n\n${actions}\n\n請輸入編號:`);
    
    switch(choice) {
      case '1':
        setSelectedProspect(prospect);
        setShowActionModal(true);
        break;
      case '2':
        handleQuickFollowupUpdate(prospect);
        break;
      case '3':
        handleQuickCloseRateUpdate(prospect);
        break;
      case '4':
        handleBulkAssign(); // 可以改為單個指派
        break;
      default:
        break;
    }
  };

  // 結案處理函數
  const handleClosingSubmit = async (e) => {
    e.preventDefault();
    
    if (!closingProspect) return;
    
    try {
      const finalStage = closingForm.result === 'won' ? '已轉換' : '已失單';
      
      // 更新案件狀態
      const { error } = await supabase
        .from('prospects')
        .update({
          stage: finalStage,
          // 可以添加額外的結案欄位
          closing_reason: closingForm.reason,
          closing_date: closingForm.close_date,
          final_amount: closingForm.final_amount || closingProspect.estimated_amount,
          closing_notes: closingForm.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', closingProspect.id);
      
      if (error) throw error;
      
      // 記錄結案活動
      await supabase.from('prospect_activities').insert({
        prospect_id: closingProspect.id,
        user_id: user?.id,
        activity_type: 'case_closed',
        old_value: closingProspect.stage,
        new_value: finalStage,
        description: `${finalStage}：${closingForm.reason}`
      });
      
      // 如果是贏單，可以選擇轉換為專案
      if (closingForm.result === 'won') {
        const shouldConvert = confirm('是否要將此案件轉換為正式專案？');
        if (shouldConvert) {
          await handleConvertToProject(closingProspect);
        }
      }
      
      // 重新載入數據
      await fetchProspects();
      
      // 關閉對話框
      setShowClosingDialog(false);
      setClosingProspect(null);
      
      alert(`案件已${finalStage === '已轉換' ? '成功結案' : '標記為失單'}！`);
      
    } catch (error) {
      console.error('Error closing prospect:', error);
      alert('結案失敗：' + error.message);
    }
  };

  const handleClosingCancel = () => {
    setShowClosingDialog(false);
    setClosingProspect(null);
    setClosingForm({
      result: 'won',
      reason: '',
      close_date: new Date().toISOString().split('T')[0],
      final_amount: '',
      notes: ''
    });
  };

  // 快速動作處理函數
  const handleQuickFollowupUpdate = async (prospect) => {
    // 快速日期選項
    const quickDateOptions = [
      { label: '今天', days: 0 },
      { label: '明天', days: 1 },
      { label: '3天後', days: 3 },
      { label: '1週後', days: 7 },
      { label: '2週後', days: 14 },
      { label: '1個月後', days: 30 }
    ];
    
    const today = new Date();
    const options = quickDateOptions.map((option, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() + option.days);
      return `${index + 1}. ${option.label} (${date.getMonth() + 1}/${date.getDate()})`;
    }).join('\n');
    
    const choice = prompt(
      `選擇追蹤日期 - ${prospect.client_name}:\n\n${options}\n7. 自定義日期\n\n請輸入編號:`
    );
    
    if (!choice) return;
    
    let newDate;
    const choiceNum = parseInt(choice);
    
    if (choiceNum >= 1 && choiceNum <= 6) {
      // 使用快速選項
      const selectedOption = quickDateOptions[choiceNum - 1];
      const date = new Date(today);
      date.setDate(date.getDate() + selectedOption.days);
      newDate = date.toISOString().split('T')[0];
    } else if (choiceNum === 7) {
      // 自定義日期
      const currentDate = prospect.next_followup_date ? 
        new Date(prospect.next_followup_date).toISOString().split('T')[0] : '';
      newDate = prompt('請輸入追蹤日期 (YYYY-MM-DD):', currentDate);
      if (!newDate) return;
    } else {
      alert('無效的選項');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('prospects')
        .update({ 
          next_followup_date: newDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', prospect.id);
      
      if (error) throw error;
      
      fetchProspects(); // 重新載入數據
      
      // 友善的確認訊息
      const selectedDate = new Date(newDate);
      const dateStr = `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`;
      alert(`✅ 追蹤日期已設定為：${dateStr}`);
    } catch (error) {
      console.error('Error updating followup date:', error);
      alert('更新追蹤日期失敗：' + error.message);
    }
  };

  const handleQuickCloseRateUpdate = async (prospect) => {
    const currentRate = prospect.close_rate || 'medium';
    const options = CLOSE_RATE_OPTIONS.map(opt => `${opt.value}: ${opt.label} (${opt.percentage}%)`).join('\n');
    
    const newRate = prompt(
      `目前成交率: ${CLOSE_RATE_OPTIONS.find(opt => opt.value === currentRate)?.label || '中'}\n\n請選擇新的成交率:\n${options}\n\n請輸入代碼 (high/medium/low):`
    );
    
    if (!newRate || !['high', 'medium', 'low'].includes(newRate)) {
      if (newRate !== null) alert('請輸入有效的成交率代碼：high, medium, 或 low');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('prospects')
        .update({ 
          close_rate: newRate,
          updated_at: new Date().toISOString()
        })
        .eq('id', prospect.id);
      
      if (error) throw error;
      
      fetchProspects(); // 重新載入數據
      const selectedOption = CLOSE_RATE_OPTIONS.find(opt => opt.value === newRate);
      alert(`成交率已更新為：${selectedOption.label} (${selectedOption.percentage}%)`);
    } catch (error) {
      console.error('Error updating close rate:', error);
      alert('更新成交率失敗：' + error.message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>
          {viewMode === 'priority' ? '業務戰情室' : 
           viewMode === 'kanban' ? '管道看板' : 
           '我的任務'}
        </h2>
        
        {/* 視圖切換器 */}
        <div className={styles.viewSwitcher}>
          <button 
            className={`${styles.viewButton} ${viewMode === 'priority' ? styles.active : ''}`}
            onClick={() => setViewMode('priority')}
          >
            🎯 戰情室
          </button>
          <button 
            className={`${styles.viewButton} ${viewMode === 'kanban' ? styles.active : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            📋 管道看板
          </button>
          <button 
            className={`${styles.viewButton} ${viewMode === 'tasks' ? styles.active : ''}`}
            onClick={() => setViewMode('tasks')}
          >
            ✅ 我的任務
          </button>
        </div>
        
        <div className={styles.headerActions}>
          <div className={styles.statistics}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>總Pipeline價值</span>
              <span className={styles.statValue}>
                NT$ {getPipelineValue().toLocaleString()}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>預估分潤</span>
              <span className={styles.statValue}>
                NT$ {getEstimatedCommission().toLocaleString()}
              </span>
            </div>
          </div>
          
          {/* 通知鈴鐺 */}
          <div className={styles.notificationButton}>
            <button
              className={`${styles.bellButton} ${notifications.length > 0 ? styles.hasNotifications : ''}`}
              onClick={() => setShowNotifications(!showNotifications)}
              title={`${notifications.length} 個提醒`}
            >
              🔔
              {notifications.length > 0 && (
                <span className={styles.notificationBadge}>
                  {notifications.length > 99 ? '99+' : notifications.length}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div className={styles.notificationDropdown}>
                <div className={styles.notificationHeader}>
                  <h3>提醒通知</h3>
                  <span className={styles.notificationCount}>
                    {notifications.length} 個
                  </span>
                </div>
                
                <div className={styles.notificationList}>
                  {notifications.length === 0 ? (
                    <div className={styles.noNotifications}>
                      <p>🎉 目前沒有提醒</p>
                      <p>所有案件狀況良好</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map(notification => (
                      <div 
                        key={notification.id} 
                        className={styles.notificationItem}
                        onClick={() => {
                          setSelectedProspect(notification.prospect);
                          setShowNotifications(false);
                        }}
                      >
                        <div className={styles.notificationIcon}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>
                            {notification.title}
                          </div>
                          <div className={styles.notificationMessage}>
                            {notification.message}
                          </div>
                        </div>
                        <div 
                          className={styles.priorityIndicator}
                          style={{ backgroundColor: getNotificationColor(notification.priority) }}
                        />
                      </div>
                    ))
                  )}
                </div>
                
                {notifications.length > 10 && (
                  <div className={styles.notificationFooter}>
                    還有 {notifications.length - 10} 個提醒...
                  </div>
                )}
              </div>
            )}
          </div>
          
          <button 
            className={styles.exportButton}
            onClick={() => exportProspectsToExcel(prospects)}
          >
            📥 匯出Excel
          </button>
          <button 
            className={styles.exportButton}
            onClick={() => exportProspectReportToPDF(statistics, prospects)}
          >
            📄 匯出PDF
          </button>
          <button 
            className={styles.addButton}
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
          >
            + 新增洽談案
          </button>
        </div>
      </div>

      {/* 篩選器 */}
      <div className={styles.filtersContainer}>
        <div className={styles.filterGroup}>
          <label>成交率</label>
          <select 
            value={filters.closeRate} 
            onChange={(e) => setFilters({...filters, closeRate: e.target.value})}
          >
            <option value="">全部</option>
            {CLOSE_RATE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>預算狀態</label>
          <select 
            value={filters.budgetStatus} 
            onChange={(e) => setFilters({...filters, budgetStatus: e.target.value})}
          >
            <option value="">全部</option>
            {BUDGET_STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>負責人</label>
          <select 
            value={filters.owner} 
            onChange={(e) => setFilters({...filters, owner: e.target.value})}
          >
            <option value="">全部</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>洽談階段</label>
          <select 
            value={filters.stage} 
            onChange={(e) => setFilters({...filters, stage: e.target.value})}
          >
            <option value="">全部</option>
            {STAGES.filter(s => !['已失單', '已轉換'].includes(s.id)).map(stage => (
              <option key={stage.id} value={stage.id}>{stage.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>客戶來源</label>
          <input 
            type="text"
            placeholder="搜尋來源..."
            value={filters.source}
            onChange={(e) => setFilters({...filters, source: e.target.value})}
          />
        </div>
      </div>

      {/* 根據視圖模式渲染不同內容 */}
      {viewMode === 'priority' && (
        /* 戰情室三分區佈局 */
        <div className={styles.warRoomLayout}>
        {/* 左側：案件列表 */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>高優先案件列表</h3>
            <span className={styles.count}>{getSortedProspects().length} 案</span>
            {selectedProspects.length > 0 && (
              <div className={styles.batchActions}>
                <button 
                  onClick={handleBulkAssign}
                  className={styles.batchButton}
                >
                  👤 批次指派 ({selectedProspects.length})
                </button>
                <button 
                  onClick={handleBulkCloseRateUpdate}
                  className={styles.batchButton}
                >
                  📊 設成交率 ({selectedProspects.length})
                </button>
                <button 
                  onClick={handleBulkFollowupUpdate}
                  className={styles.batchButton}
                >
                  📅 批次改期 ({selectedProspects.length})
                </button>
              </div>
            )}
          </div>
          <div className={styles.prospectsList}>
            {getSortedProspects().map(prospect => {
              const signDays = getDaysUntil(prospect.expected_sign_date);
              const followupDays = getDaysUntil(prospect.next_followup_date);
              
              // 計算該案件的提醒狀態
              const prospectNotifications = notifications.filter(n => n.prospect.id === prospect.id);
              const urgentNotification = prospectNotifications.find(n => n.priority === 'urgent');
              const highNotification = prospectNotifications.find(n => n.priority === 'high');
              const importantNotification = urgentNotification || highNotification;
              
              return (
                <div 
                  key={prospect.id} 
                  className={`${styles.prospectCard} ${selectedProspect?.id === prospect.id ? styles.selected : ''} ${importantNotification ? styles.hasAlert : ''}`}
                  onClick={() => setSelectedProspect(prospect)}
                  onTouchStart={(e) => handleTouchStart(e, prospect.id)}
                  onTouchMove={(e) => handleTouchMove(e, prospect.id)}
                  onTouchEnd={(e) => handleTouchEnd(e, prospect.id, 'prospect')}
                >
                  <div className={styles.prospectHeader}>
                    <div className={styles.prospectHeaderLeft}>
                      <input
                        type="checkbox"
                        className={styles.prospectCheckbox}
                        checked={selectedProspects.includes(prospect.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectProspect(prospect.id, e.target.checked);
                        }}
                      />
                      <span 
                        className={styles.closeRateBadge}
                        style={getCloseRateStyle(prospect.close_rate || 'medium')}
                      >
                        {CLOSE_RATE_OPTIONS.find(opt => opt.value === (prospect.close_rate || 'medium'))?.label || '中'}
                      </span>
                      {/* 提醒標示 */}
                      {importantNotification && (
                        <span 
                          className={styles.alertBadge}
                          style={{ backgroundColor: getNotificationColor(importantNotification.priority) }}
                          title={importantNotification.message}
                        >
                          {getNotificationIcon(importantNotification.type)}
                        </span>
                      )}
                    </div>
                    <span className={styles.amount}>
                      NT$ {parseFloat(prospect.estimated_amount || 0).toLocaleString()}
                    </span>
                  </div>
                  <h4 className={styles.prospectTitle}>
                    {prospect.client_name} - {prospect.project_name}
                  </h4>
                  <div className={styles.prospectMeta}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>簽約日:</span>
                      <span className={`${styles.metaValue} ${signDays !== null && signDays <= 0 ? styles.overdue : signDays <= 7 ? styles.urgent : ''}`}>
                        {prospect.expected_sign_date 
                          ? `${new Date(prospect.expected_sign_date).toLocaleDateString()} ${signDays !== null ? `(${signDays > 0 ? signDays + '天後' : Math.abs(signDays) + '天前'})` : ''}`
                          : '未設定'
                        }
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>下次追蹤:</span>
                      <span className={`${styles.metaValue} ${followupDays !== null && followupDays <= 0 ? styles.overdue : followupDays <= 1 ? styles.urgent : ''}`}>
                        {prospect.next_followup_date 
                          ? `${new Date(prospect.next_followup_date).toLocaleDateString()} ${followupDays !== null ? `(${followupDays > 0 ? followupDays + '天後' : Math.abs(followupDays) + '天前'})` : ''}`
                          : '未設定'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* 提醒詳情 */}
                  {prospectNotifications.length > 0 && (
                    <div className={styles.prospectAlerts}>
                      {prospectNotifications.slice(0, 2).map(notification => (
                        <div 
                          key={notification.id}
                          className={styles.alertItem}
                          style={{ borderLeftColor: getNotificationColor(notification.priority) }}
                        >
                          <span className={styles.alertIcon}>
                            {getNotificationIcon(notification.type)}
                          </span>
                          <span className={styles.alertText}>
                            {notification.title}
                          </span>
                        </div>
                      ))}
                      {prospectNotifications.length > 2 && (
                        <div className={styles.alertMore}>
                          +{prospectNotifications.length - 2} 個提醒
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側：詳情區和行動記錄 */}
        <div className={styles.rightPanel}>
          {selectedProspect ? (
            <>
              {/* 右上：案件詳情 */}
              <div className={styles.detailsPanel}>
                <div className={styles.panelHeader}>
                  <h3>案件詳情</h3>
                  <div className={styles.headerActions}>
                    <button 
                      className={styles.editButton}
                      onClick={() => openEditModal(selectedProspect)}
                    >
                      編輯
                    </button>
                    <button 
                      className={styles.assistanceButton}
                      onClick={() => setShowAssistanceModal(true)}
                    >
                      @主管協助
                    </button>
                    {selectedProspect.stage === '待簽約' && (
                      <button 
                        className={styles.convertButton}
                        onClick={() => handleConvertToProject(selectedProspect)}
                      >
                        轉換為專案
                      </button>
                    )}
                  </div>
                </div>
                
                <div className={styles.detailsContent}>
                  <div className={styles.detailsSection}>
                    <h4>基本資訊</h4>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>客戶名稱:</span>
                        <span className={styles.detailValue}>{selectedProspect.client_name}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>專案名稱:</span>
                        <span className={styles.detailValue}>{selectedProspect.project_name}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>成交率:</span>
                        <span 
                          className={styles.detailBadge}
                          style={getCloseRateStyle(selectedProspect.close_rate || 'medium')}
                        >
                          {CLOSE_RATE_OPTIONS.find(opt => opt.value === (selectedProspect.close_rate || 'medium'))?.label || '中'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>預算狀態:</span>
                        <span className={styles.detailValue}>
                          {BUDGET_STATUS_OPTIONS.find(opt => opt.value === (selectedProspect.budget_status || 'sufficient'))?.label || '符合'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>洽談階段:</span>
                        <span className={styles.detailValue}>
                          {STAGES.find(s => s.id === selectedProspect.stage)?.label || selectedProspect.stage}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>預估金額:</span>
                        <span className={styles.detailValue}>
                          NT$ {parseFloat(selectedProspect.estimated_amount || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>負責人:</span>
                        <span className={styles.detailValue}>{selectedProspect.owner?.name || '未指派'}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>預計簽約日:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.expected_sign_date 
                            ? new Date(selectedProspect.expected_sign_date).toLocaleDateString()
                            : '未設定'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.detailsSection}>
                    <h4>分潤資訊</h4>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>分潤方式:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.use_fixed_commission ? '固定比例' : '階梯式'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>分潤比例:</span>
                        <span className={styles.detailValue}>{selectedProspect.commission_rate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 決策鏈資訊 */}
                  <div className={styles.detailsSection}>
                    <h4>決策鏈資訊</h4>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>決策者:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.decision_maker_name || '未設定'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>職位:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.decision_maker_position || '未設定'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>聯絡方式:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.decision_maker_contact || '未設定'}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>下次追蹤:</span>
                        <span className={styles.detailValue}>
                          {selectedProspect.next_followup_date 
                            ? new Date(selectedProspect.next_followup_date).toLocaleDateString()
                            : '未設定'
                          }
                        </span>
                      </div>
                    </div>
                    
                    {selectedProspect.key_influencers && (
                      <div style={{ marginTop: '16px' }}>
                        <span className={styles.detailLabel}>關鍵影響者:</span>
                        <div className={styles.noteContent} style={{ marginTop: '8px' }}>
                          {selectedProspect.key_influencers}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 阻力與需求 */}
                  <div className={styles.detailsSection}>
                    <h4>阻力與需求</h4>
                    
                    {selectedProspect.main_pain_points && (
                      <div style={{ marginBottom: '16px' }}>
                        <span className={styles.detailLabel}>主要痛點:</span>
                        <div className={styles.noteContent} style={{ marginTop: '8px' }}>
                          {selectedProspect.main_pain_points}
                        </div>
                      </div>
                    )}
                    
                    {selectedProspect.close_obstacles && (
                      <div style={{ marginBottom: '16px' }}>
                        <span className={styles.detailLabel}>成交阻力:</span>
                        <div className={styles.noteContent} style={{ marginTop: '8px' }}>
                          {selectedProspect.close_obstacles}
                        </div>
                      </div>
                    )}
                    
                    {selectedProspect.competitor_name && (
                      <div className={styles.detailsGrid}>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>競爭對手:</span>
                          <span className={styles.detailValue}>{selectedProspect.competitor_name}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>競爭狀態:</span>
                          <span className={styles.detailValue}>
                            {selectedProspect.competitor_status === 'none' ? '無競爭對手' :
                             selectedProspect.competitor_status === 'leading' ? '我方領先' :
                             selectedProspect.competitor_status === 'competing' ? '激烈競爭' :
                             selectedProspect.competitor_status === 'disadvantage' ? '對方領先' :
                             selectedProspect.competitor_status === 'unknown' ? '狀態不明' : 
                             selectedProspect.competitor_status}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedProspect.note && (
                    <div className={styles.detailsSection}>
                      <h4>備註</h4>
                      <div className={styles.noteContent}>
                        {selectedProspect.note}
                      </div>
                    </div>
                  )}

                  {/* 檔案分享區域 */}
                  <div className={styles.detailsSection}>
                    <h4>共享檔案</h4>
                    
                    {/* 檔案上傳區 (主管權限) */}
                    {user && user.role === 'leader' && (
                      <div className={styles.fileUploadArea}>
                        <input
                          type="file"
                          id="fileUpload"
                          style={{ display: 'none' }}
                          onChange={(e) => handleFileUpload(e, selectedProspect.id)}
                          disabled={uploadingFile}
                          accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png"
                        />
                        <label htmlFor="fileUpload" className={styles.uploadButton}>
                          {uploadingFile ? '上傳中...' : '📁 上傳檔案'}
                        </label>
                        <span className={styles.uploadHint}>
                          支援格式：PDF, DOC, DOCX, XLSX, JPG, PNG
                        </span>
                      </div>
                    )}
                    
                    {/* 檔案列表 */}
                    <div className={styles.filesList}>
                      {sharedFiles.length === 0 ? (
                        <div className={styles.emptyFiles}>
                          <p>尚無共享檔案</p>
                        </div>
                      ) : (
                        sharedFiles.map(file => (
                          <div key={file.id} className={styles.fileItem}>
                            <div className={styles.fileIcon}>
                              {file.mime_type?.startsWith('image/') ? '🖼️' : 
                               file.mime_type?.includes('pdf') ? '📄' : 
                               file.mime_type?.includes('excel') || file.mime_type?.includes('spreadsheet') ? '📊' : 
                               file.mime_type?.includes('word') || file.mime_type?.includes('document') ? '📝' : 
                               '📎'}
                            </div>
                            <div className={styles.fileInfo}>
                              <div className={styles.fileName}>{file.file_name}</div>
                              <div className={styles.fileDetails}>
                                上傳者: {file.uploader?.name} | 
                                大小: {Math.round(file.file_size / 1024)}KB | 
                                {new Date(file.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div className={styles.fileActions}>
                              <button
                                className={styles.downloadToLineButton}
                                onClick={() => handleDownloadToLine(file)}
                                title="下載到LINE"
                              >
                                💬 下載到LINE
                              </button>
                              {user && (user.role === 'leader' || user.id === file.uploader_id) && (
                                <button
                                  className={styles.deleteFileButton}
                                  onClick={() => handleDeleteFile(file.id, file.file_path)}
                                  title="刪除檔案"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 右下：行動追蹤 */}
              <div className={styles.actionsPanel}>
                <div className={styles.panelHeader}>
                  <h3>行動追蹤記錄</h3>
                  <button 
                    className={styles.addActionButton}
                    onClick={() => setShowActionModal(true)}
                  >
                    + 新增行動
                  </button>
                </div>
                
                <div className={styles.actionsTimeline}>
                  {/* 建立案件記錄 */}
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineIcon} style={{ backgroundColor: '#6b7280' }}>
                      ➕
                    </div>
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <div className={styles.timelineAction}>建立案件</div>
                        <div className={styles.timelineDate}>
                          {new Date(selectedProspect.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className={styles.timelineDescription}>
                        案件「{selectedProspect.project_name}」已建立
                      </div>
                      <div className={styles.timelineUser}>
                        建立者: {selectedProspect.owner?.name}
                      </div>
                    </div>
                  </div>
                  
                  {/* 行動記錄 */}
                  {actionRecords.map(record => {
                    const actionType = ACTION_TYPES.find(t => t.value === record.action_type) || ACTION_TYPES.find(t => t.value === 'other');
                    return (
                      <div key={record.id} className={styles.timelineItem}>
                        <div className={styles.timelineIcon} style={{ backgroundColor: actionType.color }}>
                          {actionType.icon}
                        </div>
                        <div className={styles.timelineContent}>
                          <div className={styles.timelineHeader}>
                            <div className={styles.timelineAction}>{actionType.label}</div>
                            <div className={styles.timelineDate}>
                              {new Date(record.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div className={styles.timelineDescription}>{record.content}</div>
                          {record.next_followup_date && (
                            <div className={styles.timelineFollowup}>
                              📅 下次追蹤: {new Date(record.next_followup_date).toLocaleDateString()}
                            </div>
                          )}
                          {record.attachments && record.attachments.length > 0 && (
                            <div className={styles.timelineAttachments}>
                              {record.attachments.map((file, index) => (
                                <a
                                  key={index}
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.attachmentLink}
                                >
                                  📎 {file.name}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className={styles.timelineUser}>
                            執行者: {record.user?.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {actionRecords.length === 0 && (
                    <div className={styles.emptyTimeline}>
                      <p>尚無行動記錄</p>
                      <p>點擊上方「+ 新增行動」開始記錄業務活動</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptySelection}>
              <h3>請選擇左側案件以查看詳情</h3>
              <p>點擊左側案件卡片查看詳細資訊和行動記錄</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Kanban 看板視圖 */}
      {viewMode === 'kanban' && (
        <div className={styles.kanbanView}>
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className={styles.kanbanBoard}>
              {STAGES.map(stage => (
                <div key={stage.id} className={styles.kanbanColumn}>
                  <div className={styles.columnHeader}>
                    <h3>{stage.label}</h3>
                    <span className={styles.columnCount}>
                      {getSortedProspects().filter(p => p.stage === stage.id).length}
                    </span>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`${styles.columnCards} ${snapshot.isDraggingOver ? styles.dragover : ''}`}
                      >
                        {getSortedProspects()
                          .filter(prospect => prospect.stage === stage.id)
                          .map((prospect, index) => (
                            <Draggable 
                              key={prospect.id} 
                              draggableId={prospect.id.toString()} 
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`${styles.kanbanCard} ${snapshot.isDragging ? styles.dragging : ''}`}
                                  onClick={() => !snapshot.isDragging && setSelectedProspect(prospect)}
                                >
                                  <div className={styles.cardHeader}>
                                    <div className={styles.cardBadges}>
                                      <span className={`${styles.closeRateBadge} ${styles[`rate${prospect.close_rate}`]}`}>
                                        {CLOSE_RATE_OPTIONS.find(opt => opt.value === prospect.close_rate)?.label || '中'}
                                      </span>
                                      {prospect.estimated_amount >= 500000 && prospect.close_rate === 'high' && (
                                        <span className={styles.priorityBadge}>⭐</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className={styles.cardTitle}>
                                    {prospect.client_name} - {prospect.project_name}
                                  </div>
                                  <div className={styles.cardAmount}>
                                    NT$ {parseInt(prospect.estimated_amount).toLocaleString()}
                                  </div>
                                  <div className={styles.cardMeta}>
                                    {prospect.next_followup_date && (
                                      <div className={styles.followupDate}>
                                        追蹤: {new Date(prospect.next_followup_date).toLocaleDateString()}
                                      </div>
                                    )}
                                    {prospect.expected_sign_date && (
                                      <div className={styles.signDate}>
                                        簽約: {new Date(prospect.expected_sign_date).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                  <div className={styles.cardQuickActions}>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProspect(prospect);
                                        setShowActionModal(true);
                                      }}
                                      title="加行動"
                                    >
                                      +
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickFollowupUpdate(prospect);
                                      }}
                                      title="改追蹤日"
                                    >
                                      📅
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickCloseRateUpdate(prospect);
                                      }}
                                      title="調成交率"
                                    >
                                      📊
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {/* 我的任務視圖 */}
      {viewMode === 'tasks' && (
        <div className={styles.tasksView}>
          <div className={styles.tasksContainer}>
            <div className={styles.tasksHeader}>
              <h3>我的任務清單</h3>
              <div className={styles.tasksActions}>
                <button 
                  className={styles.refreshButton}
                  onClick={() => fetchActivities()}
                  disabled={loadingActivities}
                >
                  {loadingActivities ? '載入中...' : '🔄 重新整理'}
                </button>
                {selectedActivities.length > 0 && (
                  <div className={styles.bulkActions}>
                    <button 
                      onClick={() => handleBulkComplete()}
                      className={styles.bulkButton}
                    >
                      ✅ 批次完成 ({selectedActivities.length})
                    </button>
                    <button 
                      onClick={() => handleBulkReschedule()}
                      className={styles.bulkButton}
                    >
                      📅 批次改期 ({selectedActivities.length})
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loadingActivities ? (
              <div className={styles.loadingActivities}>
                <p>載入任務中...</p>
              </div>
            ) : (
              <div className={styles.taskGroups}>
                {/* 逾期任務 */}
                {groupedActivities.overdue.length > 0 && (
                  <div className={styles.taskGroup}>
                    <div className={styles.taskGroupHeader}>
                      <h4 className={styles.overdueHeader}>
                        ⚠️ 逾期 ({groupedActivities.overdue.length})
                      </h4>
                    </div>
                    <div className={styles.taskList}>
                      {groupedActivities.overdue.map(activity => (
                        <TaskItem
                          key={activity.activity_id}
                          activity={activity}
                          onComplete={handleCompleteActivity}
                          onReschedule={handleRescheduleActivity}
                          onSelect={handleSelectActivity}
                          isSelected={selectedActivities.includes(activity.activity_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 今天的任務 */}
                {groupedActivities.today.length > 0 && (
                  <div className={styles.taskGroup}>
                    <div className={styles.taskGroupHeader}>
                      <h4 className={styles.todayHeader}>
                        📅 今天 ({groupedActivities.today.length})
                      </h4>
                    </div>
                    <div className={styles.taskList}>
                      {groupedActivities.today.map(activity => (
                        <TaskItem
                          key={activity.activity_id}
                          activity={activity}
                          onComplete={handleCompleteActivity}
                          onReschedule={handleRescheduleActivity}
                          onSelect={handleSelectActivity}
                          isSelected={selectedActivities.includes(activity.activity_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 即將到來的任務 */}
                {groupedActivities.soon.length > 0 && (
                  <div className={styles.taskGroup}>
                    <div className={styles.taskGroupHeader}>
                      <h4 className={styles.soonHeader}>
                        🔜 即將到來（7天內）({groupedActivities.soon.length})
                      </h4>
                    </div>
                    <div className={styles.taskList}>
                      {groupedActivities.soon.map(activity => (
                        <TaskItem
                          key={activity.activity_id}
                          activity={activity}
                          onComplete={handleCompleteActivity}
                          onReschedule={handleRescheduleActivity}
                          onSelect={handleSelectActivity}
                          isSelected={selectedActivities.includes(activity.activity_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 未排程任務 */}
                {groupedActivities.unscheduled.length > 0 && (
                  <div className={styles.taskGroup}>
                    <div className={styles.taskGroupHeader}>
                      <h4 className={styles.unscheduledHeader}>
                        📝 未排程 ({groupedActivities.unscheduled.length})
                      </h4>
                    </div>
                    <div className={styles.taskList}>
                      {groupedActivities.unscheduled.map(activity => (
                        <TaskItem
                          key={activity.activity_id}
                          activity={activity}
                          onComplete={handleCompleteActivity}
                          onReschedule={handleRescheduleActivity}
                          onSelect={handleSelectActivity}
                          isSelected={selectedActivities.includes(activity.activity_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 空狀態 */}
                {activities.length === 0 && !loadingActivities && (
                  <div className={styles.emptyTasks}>
                    <h4>🎉 沒有待辦任務</h4>
                    <p>所有任務都已完成！</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

        {showModal && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>{editingProspect ? '編輯洽談案' : '新增洽談案'}</h2>
                <button 
                  className={styles.closeButton}
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>客戶名稱 *</label>
                    <input
                      type="text"
                      value={formData.client_name}
                      onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>專案名稱 *</label>
                    <input
                      type="text"
                      value={formData.project_name}
                      onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>預估金額 *</label>
                    <input
                      type="number"
                      value={formData.estimated_amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>分潤計算方式</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="commission_type"
                          checked={!formData.use_fixed_commission}
                          onChange={() => {
                            const newRate = calculateCommissionRate(parseFloat(formData.estimated_amount) || 0);
                            setFormData({
                              ...formData, 
                              use_fixed_commission: false,
                              commission_rate: newRate
                            });
                          }}
                        />
                        階梯式分潤 (自動計算)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="commission_type"
                          checked={formData.use_fixed_commission}
                          onChange={() => setFormData({...formData, use_fixed_commission: true})}
                        />
                        固定分潤比例
                      </label>
                    </div>
                  </div>
                  
                  {formData.use_fixed_commission && (
                    <div className={styles.formGroup}>
                      <label>固定分潤比例 (%) *</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.fixed_commission_percentage}
                        onChange={(e) => {
                          setFormData({
                            ...formData, 
                            fixed_commission_percentage: e.target.value,
                            commission_rate: parseFloat(e.target.value) || 0
                          });
                        }}
                        placeholder="請輸入固定分潤比例"
                        required
                      />
                    </div>
                  )}
                  
                  {!formData.use_fixed_commission && (
                    <div className={styles.formGroup}>
                      <label>階梯式分潤比例</label>
                      <div style={{ 
                        padding: '8px 12px', 
                        backgroundColor: '#f9fafb', 
                        border: '1px solid #d1d5db', 
                        borderRadius: '6px',
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        {formData.estimated_amount ? 
                          `${formData.commission_rate}% (根據金額 NT$ ${parseFloat(formData.estimated_amount).toLocaleString()} 自動計算)` : 
                          '請先輸入預估金額以計算分潤比例'
                        }
                      </div>
                      <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        階梯標準：≤10萬(35%) | 10-30萬(30%) | 30-60萬(25%) | 60-100萬(20%) | &gt;100萬(10%)
                      </small>
                    </div>
                  )}
                  
                  <div className={styles.formGroup}>
                    <label>負責人 *</label>
                    <select
                      value={formData.owner_id}
                      onChange={(e) => setFormData({...formData, owner_id: e.target.value})}
                      required
                    >
                      <option value="">請選擇負責人</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role === 'sales' ? '業務' : u.role === 'pm' ? 'PM' : '主管'})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>洽談階段</label>
                    <select
                      value={formData.stage}
                      onChange={(e) => setFormData({...formData, stage: e.target.value})}
                    >
                      {STAGES.filter(s => s.id !== '已轉換').map(stage => (
                        <option key={stage.id} value={stage.id}>{stage.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>預計簽約日</label>
                    <input
                      type="date"
                      value={formData.expected_sign_date}
                      onChange={(e) => setFormData({...formData, expected_sign_date: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>客戶來源</label>
                    <input
                      type="text"
                      value={formData.source}
                      onChange={(e) => setFormData({...formData, source: e.target.value})}
                      placeholder="例：網路行銷、轉介紹、陌生開發"
                    />
                  </div>

                  {/* 戰情室新欄位 */}
                  <div className={styles.formGroup}>
                    <label>成交率標籤</label>
                    <select
                      value={formData.close_rate}
                      onChange={(e) => setFormData({...formData, close_rate: e.target.value})}
                    >
                      {CLOSE_RATE_OPTIONS.map(rate => (
                        <option key={rate.value} value={rate.value}>{rate.label} ({rate.percentage}%)</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>客戶預算狀態</label>
                    <select
                      value={formData.budget_status}
                      onChange={(e) => setFormData({...formData, budget_status: e.target.value})}
                    >
                      {BUDGET_STATUS_OPTIONS.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>下次追蹤日期</label>
                    <input
                      type="date"
                      value={formData.next_followup_date}
                      onChange={(e) => setFormData({...formData, next_followup_date: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>決策者姓名</label>
                    <input
                      type="text"
                      value={formData.decision_maker_name}
                      onChange={(e) => setFormData({...formData, decision_maker_name: e.target.value})}
                      placeholder="請輸入決策者姓名"
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>決策者職位</label>
                    <input
                      type="text"
                      value={formData.decision_maker_position}
                      onChange={(e) => setFormData({...formData, decision_maker_position: e.target.value})}
                      placeholder="例：總經理、IT主管"
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>決策者聯絡方式</label>
                    <input
                      type="text"
                      value={formData.decision_maker_contact}
                      onChange={(e) => setFormData({...formData, decision_maker_contact: e.target.value})}
                      placeholder="電話或Email"
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>關鍵影響者</label>
                    <textarea
                      value={formData.key_influencers}
                      onChange={(e) => setFormData({...formData, key_influencers: e.target.value})}
                      rows="2"
                      placeholder="請列出其他重要的影響決策人員及其角色..."
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>主要痛點</label>
                    <textarea
                      value={formData.main_pain_points}
                      onChange={(e) => setFormData({...formData, main_pain_points: e.target.value})}
                      rows="2"
                      placeholder="客戶面臨的主要問題或需求痛點..."
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>成交阻力</label>
                    <textarea
                      value={formData.close_obstacles}
                      onChange={(e) => setFormData({...formData, close_obstacles: e.target.value})}
                      rows="2"
                      placeholder="可能影響成交的障礙或疑慮..."
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>競爭對手</label>
                    <input
                      type="text"
                      value={formData.competitor_name}
                      onChange={(e) => setFormData({...formData, competitor_name: e.target.value})}
                      placeholder="主要競爭對手名稱"
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>競爭狀態</label>
                    <select
                      value={formData.competitor_status}
                      onChange={(e) => setFormData({...formData, competitor_status: e.target.value})}
                    >
                      <option value="none">無競爭對手</option>
                      <option value="leading">我方領先</option>
                      <option value="competing">激烈競爭</option>
                      <option value="disadvantage">對方領先</option>
                      <option value="unknown">狀態不明</option>
                    </select>
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>備註</label>
                    <textarea
                      value={formData.note}
                      onChange={(e) => setFormData({...formData, note: e.target.value})}
                      rows="3"
                    />
                  </div>
                </div>
                
                <div className={styles.modalFooter}>
                  <button type="button" onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}>
                    取消
                  </button>
                  <button type="submit" className={styles.submitButton}>
                    {editingProspect ? '更新' : '新增'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 協助請求彈窗 */}
        {showAssistanceModal && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>請求主管協助</h2>
                <button 
                  className={styles.closeButton}
                  onClick={() => {
                    setShowAssistanceModal(false);
                    setAssistanceForm({
                      type: 'review_quote',
                      priority: 'medium',
                      description: '',
                      deadline: ''
                    });
                  }}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleAssistanceRequest}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>案件資訊</label>
                    <div style={{ 
                      padding: '8px 12px', 
                      backgroundColor: '#f9fafb', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {selectedProspect?.client_name} - {selectedProspect?.project_name}
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>協助類型 *</label>
                    <select
                      value={assistanceForm.type}
                      onChange={(e) => setAssistanceForm({...assistanceForm, type: e.target.value})}
                      required
                    >
                      {ASSISTANCE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>優先等級 *</label>
                    <select
                      value={assistanceForm.priority}
                      onChange={(e) => setAssistanceForm({...assistanceForm, priority: e.target.value})}
                      required
                    >
                      {PRIORITY_OPTIONS.map(priority => (
                        <option key={priority.value} value={priority.value}>{priority.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>希望完成日期</label>
                    <input
                      type="datetime-local"
                      value={assistanceForm.deadline}
                      onChange={(e) => setAssistanceForm({...assistanceForm, deadline: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>詳細說明 *</label>
                    <textarea
                      value={assistanceForm.description}
                      onChange={(e) => setAssistanceForm({...assistanceForm, description: e.target.value})}
                      rows="4"
                      placeholder="請詳細說明需要協助的具體內容、背景情況及期望結果..."
                      required
                    />
                  </div>
                </div>
                
                <div className={styles.modalFooter}>
                  <button type="button" onClick={() => {
                    setShowAssistanceModal(false);
                    setAssistanceForm({
                      type: 'review_quote',
                      priority: 'medium',
                      description: '',
                      deadline: ''
                    });
                  }}>
                    取消
                  </button>
                  <button type="submit" className={styles.submitButton}>
                    發送協助請求
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 新增行動記錄彈窗 */}
        {showActionModal && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>新增行動記錄</h2>
                <button 
                  className={styles.closeButton}
                  onClick={() => {
                    setShowActionModal(false);
                    setActionForm({
                      action_type: 'phone',
                      content: '',
                      next_followup_date: '',
                      attachments: []
                    });
                  }}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleAddAction}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>案件資訊</label>
                    <div style={{ 
                      padding: '8px 12px', 
                      backgroundColor: '#f9fafb', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {selectedProspect?.client_name} - {selectedProspect?.project_name}
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>行動類型 *</label>
                    <select
                      value={actionForm.action_type}
                      onChange={(e) => setActionForm({...actionForm, action_type: e.target.value})}
                      required
                    >
                      {ACTION_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>下次追蹤日期</label>
                    <input
                      type="date"
                      value={actionForm.next_followup_date}
                      onChange={(e) => setActionForm({...actionForm, next_followup_date: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>附件上傳</label>
                    <input
                      type="file"
                      multiple
                      onChange={handleActionFileUpload}
                      accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png"
                    />
                    <div className={styles.uploadHint}>
                      支援多個檔案：PDF, DOC, DOCX, XLSX, JPG, PNG
                    </div>
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>行動內容 *</label>
                    <textarea
                      value={actionForm.content}
                      onChange={(e) => setActionForm({...actionForm, content: e.target.value})}
                      rows="4"
                      placeholder="請詳細記錄這次的業務活動內容、客戶反應、重要結論等..."
                      required
                    />
                  </div>
                  
                  {/* 已上傳的附件預覽 */}
                  {actionForm.attachments.length > 0 && (
                    <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                      <label>已上傳附件</label>
                      <div className={styles.attachmentPreview}>
                        {actionForm.attachments.map((file, index) => (
                          <div key={index} className={styles.attachmentItem}>
                            <span className={styles.attachmentName}>📎 {file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeActionAttachment(index)}
                              className={styles.removeAttachment}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className={styles.modalFooter}>
                  <button type="button" onClick={() => {
                    setShowActionModal(false);
                    setActionForm({
                      action_type: 'phone',
                      content: '',
                      next_followup_date: '',
                      attachments: []
                    });
                  }}>
                    取消
                  </button>
                  <button type="submit" className={styles.submitButton}>
                    新增行動記錄
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* 結案對話框 */}
      {showClosingDialog && closingProspect && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} ${styles.closingModal}`}>
            <div className={styles.modalHeader}>
              <h3>
                {closingForm.result === 'won' ? '🎉 案件結案 - 贏單' : '❌ 案件結案 - 失單'}
              </h3>
              <button 
                className={styles.closeButton}
                onClick={handleClosingCancel}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleClosingSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.closingProspectInfo}>
                  <h4>{closingProspect.client_name} - {closingProspect.project_name}</h4>
                  <p>預估金額: NT$ {parseInt(closingProspect.estimated_amount || 0).toLocaleString()}</p>
                </div>
                
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>結果類型 *</label>
                    <select
                      value={closingForm.result}
                      onChange={(e) => setClosingForm({...closingForm, result: e.target.value})}
                      required
                    >
                      <option value="won">🎉 贏單 - 成功簽約</option>
                      <option value="lost">❌ 失單 - 未成交</option>
                    </select>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>結案日期 *</label>
                    <input
                      type="date"
                      value={closingForm.close_date}
                      onChange={(e) => setClosingForm({...closingForm, close_date: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>最終金額 *</label>
                    <input
                      type="number"
                      placeholder="最終簽約/報價金額"
                      value={closingForm.final_amount}
                      onChange={(e) => setClosingForm({...closingForm, final_amount: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>
                      {closingForm.result === 'won' ? '贏單原因 *' : '失單原因 *'}
                    </label>
                    <select
                      value={closingForm.reason}
                      onChange={(e) => setClosingForm({...closingForm, reason: e.target.value})}
                      required
                    >
                      <option value="">請選擇原因</option>
                      {closingForm.result === 'won' ? (
                        <>
                          <option value="價格優勢">價格有競爭優勢</option>
                          <option value="產品符合需求">產品功能符合需求</option>
                          <option value="服務品質佳">服務品質獲得認可</option>
                          <option value="關係良好">客戶關係維護良好</option>
                          <option value="時機恰當">推出時機恰當</option>
                          <option value="其他">其他原因</option>
                        </>
                      ) : (
                        <>
                          <option value="價格過高">價格不符合預算</option>
                          <option value="產品不符需求">產品功能不符合需求</option>
                          <option value="選擇競爭對手">客戶選擇競爭對手</option>
                          <option value="預算取消">客戶預算取消或延後</option>
                          <option value="決策流程冗長">客戶決策流程過長</option>
                          <option value="其他">其他原因</option>
                        </>
                      )}
                    </select>
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>補充說明</label>
                    <textarea
                      placeholder="詳細說明結案原因、後續處理方式等..."
                      value={closingForm.notes}
                      onChange={(e) => setClosingForm({...closingForm, notes: e.target.value})}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
              
              <div className={styles.modalFooter}>
                <button type="button" onClick={handleClosingCancel}>
                  取消
                </button>
                <button 
                  type="submit" 
                  className={`${styles.submitButton} ${closingForm.result === 'won' ? styles.winButton : styles.loseButton}`}
                >
                  {closingForm.result === 'won' ? '確認贏單' : '確認失單'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 手機版底部導覽 */}
      <div className={styles.mobileBottomNav}>
        <button 
          className={`${styles.navButton} ${viewMode === 'priority' ? styles.active : ''}`}
          onClick={() => setViewMode('priority')}
        >
          <span className={styles.navIcon}>🎯</span>
          <span className={styles.navLabel}>戰情室</span>
        </button>
        <button 
          className={`${styles.navButton} ${viewMode === 'kanban' ? styles.active : ''}`}
          onClick={() => setViewMode('kanban')}
        >
          <span className={styles.navIcon}>📋</span>
          <span className={styles.navLabel}>管道看板</span>
        </button>
        <button 
          className={`${styles.navButton} ${viewMode === 'tasks' ? styles.active : ''}`}
          onClick={() => setViewMode('tasks')}
        >
          <span className={styles.navIcon}>✅</span>
          <span className={styles.navLabel}>我的任務</span>
        </button>
      </div>
      </div>
  );
}

// TaskItem 組件
function TaskItem({ activity, onComplete, onReschedule, onSelect, isSelected }) {
  const getActivityIcon = (type) => {
    const typeMap = {
      phone: '📞',
      meet: '🤝',
      demo: '📊',
      quote: '💰',
      send: '📄',
      visit: '🏢',
      presentation: '🖥️',
      negotiation: '💬',
      contract: '✍️',
      followup: '📋',
      other: '📝'
    };
    return typeMap[type] || '📝';
  };

  const getActivityTypeLabel = (type) => {
    const labelMap = {
      phone: '電話聯絡',
      meet: '面談會議',
      demo: '產品展示',
      quote: '報價提供',
      send: '資料寄送',
      visit: '客戶拜訪',
      presentation: '產品簡報',
      negotiation: '價格談判',
      contract: '合約簽署',
      followup: '後續追蹤',
      other: '其他'
    };
    return labelMap[type] || '其他';
  };

  const formatDueDate = (dueAt) => {
    if (!dueAt) return '未設定';
    
    const now = new Date();
    const due = new Date(dueAt);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `逾期 ${Math.abs(diffDays)} 天`;
    } else if (diffDays === 0) {
      return '今天';
    } else if (diffDays === 1) {
      return '明天';
    } else {
      return `${diffDays} 天後`;
    }
  };

  const getDueDateClass = (dueAt) => {
    if (!dueAt) return '';
    
    const now = new Date();
    const due = new Date(dueAt);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays <= 3) return 'soon';
    return 'future';
  };

  return (
    <div className={`${styles.taskItem} ${isSelected ? styles.selected : ''}`}>
      <div className={styles.taskCheckbox}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(activity.activity_id, e.target.checked)}
        />
      </div>
      
      <div className={styles.taskIcon}>
        {getActivityIcon(activity.type)}
      </div>
      
      <div className={styles.taskContent}>
        <div className={styles.taskHeader}>
          <span className={styles.taskType}>
            {getActivityTypeLabel(activity.type)}
          </span>
          <span className={`${styles.taskDue} ${styles[getDueDateClass(activity.due_at)]}`}>
            {formatDueDate(activity.due_at)}
          </span>
        </div>
        
        <div className={styles.taskTitle}>
          {activity.deal?.client_name} - {activity.deal?.project_name}
        </div>
        
        {activity.note && (
          <div className={styles.taskNote}>
            {activity.note}
          </div>
        )}
        
        <div className={styles.taskMeta}>
          <span className={styles.taskOwner}>
            負責人: {activity.owner?.name}
          </span>
          {activity.due_at && (
            <span className={styles.taskDate}>
              到期: {new Date(activity.due_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      
      <div className={styles.taskActions}>
        <button
          onClick={() => onComplete(activity.activity_id)}
          className={styles.completeButton}
          title="完成任務"
        >
          ✅
        </button>
        <button
          onClick={() => {
            const newDate = prompt('請輸入新的到期日期 (YYYY-MM-DD):');
            if (newDate) {
              onReschedule(activity.activity_id, newDate);
            }
          }}
          className={styles.rescheduleButton}
          title="改期"
        >
          📅
        </button>
      </div>
    </div>
  );
}