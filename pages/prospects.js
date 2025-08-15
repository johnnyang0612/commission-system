import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
// Layout is handled by _app.js
import { supabase } from '../utils/supabaseClient';
import { exportProspectsToExcel, exportProspectReportToPDF } from '../utils/exportUtils';
import styles from '../styles/Prospects.module.css';

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

  useEffect(() => {
    checkUser();
    fetchUsers();
    fetchProspects();
    fetchStatistics();
  }, []);

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
      const { data, error } = await supabase
        .from('prospects')
        .select(`
          *,
          owner:users!owner_id(id, name)
        `)
        .not('stage', 'eq', '已轉換')
        .order('created_at', { ascending: false });

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

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const { draggableId, source, destination } = result;
    
    if (source.droppableId === destination.droppableId) return;
    
    const newStage = destination.droppableId;
    
    await updateProspectStage(draggableId, newStage, source.droppableId);
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
    // Update local state optimistically
    const updatedProspects = prospects.map(p => 
      p.id === prospectId ? { ...p, stage: newStage } : p
    );
    setProspects(updatedProspects);

    // Update in database
    const { error } = await supabase
      .from('prospects')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', prospectId);
    
    if (error) {
      console.error('Error updating prospect stage:', error);
      fetchProspects(); // Revert on error
      return;
    }

    // Log the change
    await supabase.from('prospect_activities').insert({
      prospect_id: prospectId,
      activity_type: 'stage_change',
      old_value: oldStage,
      new_value: newStage,
      description: `階段從 ${oldStage} 變更為 ${newStage}`
    });
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
    
    // 排序：成交率高 → 下次追蹤日期近 → 預估金額大
    return filtered.sort((a, b) => {
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

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>業務戰情室</h2>
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

      {/* 戰情室三分區佈局 */}
      <div className={styles.warRoomLayout}>
        {/* 左側：案件列表 */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>高優先案件列表</h3>
            <span className={styles.count}>{getSortedProspects().length} 案</span>
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
                >
                  <div className={styles.prospectHeader}>
                    <div className={styles.prospectHeaderLeft}>
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
                        <option key={u.id} value={u.id}>{u.name} ({u.role === 'sales' ? '業務' : '主管'})</option>
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
      </div>
  );
}