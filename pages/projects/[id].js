import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { canViewFinancialData, canEditCosts, getCurrentUserRole, getCurrentUser, USER_ROLES } from '../../utils/permissions';
import { useAuth } from '../../utils/auth';
import FileUpload from '../../components/FileUpload';
import ProjectDocuments from '../../components/ProjectDocuments';
import { STORAGE_BUCKETS, FOLDER_STRUCTURE } from '../../utils/fileUpload';
import { generateInstallmentLaborForm } from '../../utils/laborFormGenerator';

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user: authUser } = useAuth();
  const [project, setProject] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [costs, setCosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignedUser, setAssignedUser] = useState(null);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [showAddCost, setShowAddCost] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [installmentForm, setInstallmentForm] = useState({
    installment_number: '',
    due_date: '',
    amount: '',
    status: 'pending'
  });
  const [costForm, setCostForm] = useState({
    cost_type: '',
    description: '',
    amount: '',
    cost_date: new Date().toISOString().split('T')[0],
    notes: '',
    installment_number: '', // 關聯期數，空值代表直接支出
    is_paid: false, // 是否已支付
    paid_date: '', // 支付日期
    // 發票/單據管理欄位
    invoice_number: '', // 發票號碼
    invoice_date: '', // 發票日期
    vendor_name: '', // 供應商名稱
    vendor_tax_id: '', // 供應商統一編號
    receipt_type: 'invoice', // 單據類型
    document_status: 'pending', // 單據狀態
    tax_amount: '', // 稅額
    net_amount: '', // 淨額
    approval_status: 'pending', // 審核狀態
    // 檔案管理
    uploaded_files: [] // 已上傳檔案列表
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    warranty_period: '',
    actual_completion_date: '',
    maintenance_start_date: '',
    maintenance_billing_date: '',
    maintenance_fee: ''
  });

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchInstallments();
      fetchCommissions();
      fetchCosts();
      fetchUsers();
    }
  }, [id]);
  
  useEffect(() => {
    if (authUser) {
      // 獲取當前用戶資料和角色
      getCurrentUser(authUser).then(userData => {
        setCurrentUser(userData);
        setUserRole(userData?.role || 'admin'); // 預設給予管理員權限
        console.log('當前用戶角色:', userData?.role);
      }).catch(err => {
        console.error('無法獲取用戶資料:', err);
        // 錯誤時預設給予管理員權限
        setUserRole('admin');
      });
    } else {
      // 沒有用戶資料時，預設給予管理員權限
      setUserRole('admin');
    }
  }, [authUser]);

  useEffect(() => {
    if (project && users.length > 0) {
      const assigned = users.find(user => user.id === project.assigned_to);
      setAssignedUser(assigned || null);
    }
  }, [project, users]);

  async function fetchProject() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) console.error(error);
    else {
      setProject(data);
      setEditFormData(data);
      setMaintenanceForm({
        warranty_period: data.warranty_period || '',
        actual_completion_date: data.actual_completion_date || '',
        maintenance_start_date: data.maintenance_start_date || '',
        maintenance_billing_date: data.maintenance_billing_date || '',
        maintenance_fee: data.maintenance_fee || ''
      });
    }
  }

  async function fetchUsers() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('role', ['sales', 'leader'])
      .order('name');
    
    if (error) {
      console.error('Error fetching users:', error);
    } else {
      console.log('Fetched users:', data);
      setUsers(data || []);
    }
  }

  async function fetchInstallments() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', id)
      .order('installment_number');
    
    if (error) console.error(error);
    else setInstallments(data || []);
  }

  async function fetchCommissions() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('commission_summary')
      .select('*')
      .eq('project_id', id);
    
    if (error) console.error(error);
    else setCommissions(data || []);
  }

  async function fetchCosts() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('project_costs')
      .select('*')
      .eq('project_id', id)
      .order('cost_date', { ascending: false });
    
    if (error) console.error(error);
    else setCosts(data || []);
  }

  async function handleAddInstallment(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('project_installments')
      .insert([{
        project_id: id,
        ...installmentForm,
        amount: parseFloat(installmentForm.amount)
      }]);
    
    if (error) {
      console.error(error);
      alert('新增失敗');
    } else {
      alert('新增成功');
      setShowAddInstallment(false);
      setInstallmentForm({
        installment_number: '',
        due_date: '',
        amount: '',
        status: 'pending'
      });
      fetchInstallments();
    }
  }

  async function handleAddCost(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const costData = {
      project_id: id,
      cost_type: costForm.cost_type,
      description: costForm.description,
      amount: parseFloat(costForm.amount),
      cost_date: costForm.cost_date,
      notes: costForm.notes,
      installment_number: costForm.installment_number ? parseInt(costForm.installment_number) : null,
      is_paid: costForm.is_paid,
      paid_date: costForm.is_paid ? costForm.paid_date : null,
      created_by: 'current_user', // 在實際應用中應該是當前登錄用戶
      // 發票/單據管理欄位
      invoice_number: costForm.invoice_number,
      invoice_date: costForm.invoice_date || null,
      vendor_name: costForm.vendor_name,
      vendor_tax_id: costForm.vendor_tax_id,
      receipt_type: costForm.receipt_type,
      document_status: costForm.document_status,
      tax_amount: costForm.tax_amount ? parseFloat(costForm.tax_amount) : 0,
      net_amount: costForm.net_amount ? parseFloat(costForm.net_amount) : parseFloat(costForm.amount),
      approval_status: costForm.approval_status,
      file_attachments: JSON.stringify(costForm.uploaded_files.map(file => ({
        fileName: file.fileName,
        originalName: file.originalName,
        filePath: file.filePath,
        publicUrl: file.publicUrl,
        fileSize: file.fileSize,
        fileType: file.fileType,
        uploadedAt: new Date().toISOString(),
        bucket: file.bucket
      })))
    };
    
    const { error } = await supabase
      .from('project_costs')
      .insert([costData]);
    
    if (error) {
      console.error(error);
      alert('新增成本失敗');
    } else {
      alert('新增成本成功');
      setShowAddCost(false);
      setCostForm({
        cost_type: '',
        description: '',
        amount: '',
        cost_date: new Date().toISOString().split('T')[0],
        notes: '',
        installment_number: '',
        is_paid: false,
        paid_date: '',
        // 發票/單據管理欄位
        invoice_number: '',
        invoice_date: '',
        vendor_name: '',
        vendor_tax_id: '',
        receipt_type: 'invoice',
        document_status: 'pending',
        tax_amount: '',
        net_amount: '',
        approval_status: 'pending',
        uploaded_files: []
      });
      fetchCosts();
    }
  }

  async function markCostAsPaid(costId) {
    if (!supabase) return;
    
    const paidDate = prompt('請輸入實際支付日期 (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!paidDate) return;
    
    const { error } = await supabase
      .from('project_costs')
      .update({ 
        is_paid: true, 
        paid_date: paidDate 
      })
      .eq('id', costId);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('成本已標記為已支出');
      fetchCosts();
    }
  }

  async function updateCostStatus(costId, newStatus, paymentDate, actualAmount) {
    if (!supabase) return;
    
    const updateData = { payment_status: newStatus };
    if (newStatus === 'paid' && paymentDate) {
      updateData.payment_date = paymentDate;
    }
    if (actualAmount !== undefined) {
      updateData.actual_amount = parseFloat(actualAmount);
    }
    
    const { error } = await supabase
      .from('project_costs')
      .update(updateData)
      .eq('id', costId);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('更新成功');
      fetchCosts();
    }
  }
  
  async function editCost(cost) {
    const newDescription = prompt('編輯描述:', cost.description || '');
    if (newDescription === null) return;
    
    const newAmount = prompt('編輯金額:', cost.amount || 0);
    if (newAmount === null) return;
    
    const newCostType = prompt('編輯類型 (development/design/marketing/other):', cost.cost_type || 'other');
    if (newCostType === null) return;
    
    const newInstallment = prompt('編輯關聯期數 (留空表示不綁定):', cost.installment_number || '');
    
    const updateData = {
      description: newDescription,
      amount: parseFloat(newAmount),
      cost_type: newCostType,
      installment_number: newInstallment ? parseInt(newInstallment) : null
    };
    
    const { error } = await supabase
      .from('project_costs')
      .update(updateData)
      .eq('id', cost.id);
    
    if (error) {
      console.error(error);
      alert('編輯失敗: ' + error.message);
    } else {
      alert('編輯成功');
      fetchCosts();
    }
  }
  
  async function deleteCost(costId, description) {
    if (!supabase) return;
    
    const confirmed = confirm(`確定要刪除成本項目「${description}」嗎？`);
    if (!confirmed) return;
    
    const { error } = await supabase
      .from('project_costs')
      .delete()
      .eq('id', costId);
    
    if (error) {
      console.error(error);
      alert('刪除失敗');
    } else {
      alert('刪除成功');
      fetchCosts();
    }
  }

  async function downloadLaborForm(installment) {
    try {
      // 獲取當前用戶資料
      const currentUser = await getCurrentUser(authUser);
      if (!currentUser) {
        alert('請先登入');
        return;
      }
      
      // 獲取用戶完整資料
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();
        
      if (userError || !userData) {
        alert('請先完善個人資料（銀行資訊、身分證號等）');
        router.push('/profile');
        return;
      }
      
      // 檢查必要資料
      if (!userData.name || !userData.bank_name || !userData.account_number) {
        alert('請先在個人資料頁面完善銀行資訊');
        router.push('/profile');
        return;
      }
      
      // 計算分潤資料
      const commission = commissions.length > 0 ? commissions[0] : null;
      const commissionData = {
        amount: installment.actual_commission || installment.commission_amount || 0,
        commission_rate: commission?.percentage || 0
      };
      
      // 生成勞務報酬單
      await generateInstallmentLaborForm(
        project,
        {
          ...installment,
          description: installment.description || `第 ${installment.installment_number} 期付款`
        },
        userData,
        commissionData
      );
      
    } catch (error) {
      console.error('下載勞務報酬單失敗:', error);
      alert('下載失敗: ' + error.message);
    }
  }

  async function downloadInstallmentLaborReceipt(installment) {
    try {
      // 查找對應的勞務報酬單
      const { data: laborReceipts, error } = await supabase
        .from('labor_receipts')
        .select(`
          *,
          commission_payout:commission_payouts!inner(
            related_installment_id
          )
        `)
        .eq('commission_payouts.related_installment_id', installment.id);

      if (error) {
        console.error('查詢勞務報酬單失敗:', error);
        alert('查詢勞務報酬單失敗');
        return;
      }

      let laborReceipt = null;
      if (laborReceipts && laborReceipts.length > 0) {
        laborReceipt = laborReceipts[0];
      }

      if (!laborReceipt) {
        // 如果沒有找到勞務報酬單，嘗試生成一個
        const { data: commission, error: commissionError } = await supabase
          .from('commissions')
          .select('id, user_id')
          .eq('project_id', project.id)
          .single();

        if (commissionError || !commission) {
          alert('找不到對應的分潤記錄，無法生成勞務報酬單');
          return;
        }

        // 生成勞務報酬單
        const { generateLaborReceipt } = await import('../../utils/laborReceiptGenerator');
        const receiptResult = await generateLaborReceipt(commission.id, {
          paymentDate: installment.commission_payment_date || new Date().toISOString().split('T')[0],
          partialAmount: installment.actual_commission,
          installmentNumber: installment.installment_number
        });

        if (!receiptResult.success) {
          alert(`生成勞務報酬單失敗: ${receiptResult.error}`);
          return;
        }

        // 重新獲取勞務報酬單資料
        const { data: newReceipt, error: newError } = await supabase
          .from('labor_receipts')
          .select('*')
          .eq('id', receiptResult.receiptId)
          .single();

        if (newError || !newReceipt) {
          alert('無法獲取勞務報酬單資料');
          return;
        }

        laborReceipt = newReceipt;
      }

      // 使用勞務報酬單列印工具
      const { generateLaborReceiptPDF } = await import('../../utils/laborReceiptPDF');
      generateLaborReceiptPDF(laborReceipt);

    } catch (error) {
      console.error('下載勞務報酬單失敗:', error);
      alert('下載失敗: ' + error.message);
    }
  }
  
  async function updateInstallmentStatus(installmentId, status, paymentDate, actualAmount, actualCommission, commissionDate) {
    if (!supabase) return;
    
    const updateData = { status };
    if (status === 'paid') {
      if (paymentDate) updateData.payment_date = paymentDate;
      if (actualAmount) updateData.actual_amount = parseFloat(actualAmount);
      if (actualCommission) {
        updateData.actual_commission = parseFloat(actualCommission);
        updateData.commission_status = 'paid';
      }
      if (commissionDate) updateData.commission_payment_date = commissionDate;
    }
    
    const { error } = await supabase
      .from('project_installments')
      .update(updateData)
      .eq('id', installmentId);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('更新成功');
      fetchInstallments();
      
      // 如果是標記為已付款，自動計算分潤
      if (status === 'paid') {
        await calculateCommissionForInstallment(installmentId);
      }
    }
  }

  async function calculateCommissionForInstallment(installmentId) {
    if (!supabase || !project) return;
    
    // 檢查該專案是否已有分潤記錄
    const existingCommission = commissions.find(c => c.project_id === project.id);
    if (existingCommission) {
      // 更新期數的分潤金額
      await updateInstallmentCommission(installmentId, existingCommission);
      return;
    }
    
    // 分潤計算：固定分潤 vs 階梯式分潤
    let totalCommissionAmount = 0;
    let effectivePercentage = 0;
    
    if (project.use_fixed_commission && project.fixed_commission_percentage) {
      // 使用固定分潤比例
      effectivePercentage = parseFloat(project.fixed_commission_percentage);
      totalCommissionAmount = project.amount * (effectivePercentage / 100);
    } else if (project.type === 'new') {
      // 階梯式分潤計算
      const projectAmount = project.amount;
      let remainingAmount = projectAmount;
      
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
      
      effectivePercentage = (totalCommissionAmount / projectAmount) * 100;
    } else if (project.type === 'renewal') {
      totalCommissionAmount = project.amount * 0.15;
      effectivePercentage = 15;
    }
    
    if (effectivePercentage > 0) {
      const { error } = await supabase
        .from('commissions')
        .insert([{
          project_id: project.id,
          user_id: project.assigned_to,
          percentage: effectivePercentage,
          amount: totalCommissionAmount,
          status: 'pending'
        }]);
      
      if (!error) {
        fetchCommissions();
        // 更新期數的分潤金額
        await updateInstallmentCommission(installmentId, { amount: totalCommissionAmount, percentage: effectivePercentage });
      }
    }
  }

  async function updateInstallmentCommission(installmentId, commission) {
    if (!supabase || !project) return;
    
    // 找到當前期數
    const currentInstallment = installments.find(inst => inst.id === installmentId);
    if (!currentInstallment) return;
    
    // 計算當期付款比例（基於實際收款金額或預設金額）
    const installmentAmount = currentInstallment.actual_amount || currentInstallment.amount;
    const totalProjectAmount = project.amount;
    const paymentRatio = installmentAmount / totalProjectAmount;
    
    // 按比例計算應撥分潤
    const commissionForThisInstallment = commission.amount * paymentRatio;
    
    console.log(`期數 ${currentInstallment.installment_number}: 付款金額 ${installmentAmount}, 付款比例 ${(paymentRatio * 100).toFixed(1)}%, 應撥分潤 ${Math.round(commissionForThisInstallment)}`);
    
    const { error } = await supabase
      .from('project_installments')
      .update({
        commission_amount: Math.round(commissionForThisInstallment),
        commission_status: 'pending'
      })
      .eq('id', installmentId);
    
    if (!error) {
      fetchInstallments();
    }
  }

  async function updateCommissionStatus(installmentId, status) {
    if (!supabase) return;
    
    const actualCommission = prompt('請輸入實撥分潤金額:', '');
    const paymentDate = prompt('請輸入撥款日期 (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    
    if (actualCommission && paymentDate) {
      const commissionAmount = parseFloat(actualCommission);
      
      // 1. 更新期數的分潤記錄
      const { error: updateError } = await supabase
        .from('project_installments')
        .update({
          commission_status: status,
          actual_commission: commissionAmount,
          commission_payment_date: paymentDate
        })
        .eq('id', installmentId);
      
      if (updateError) {
        console.error(updateError);
        alert('撥款記錄更新失敗');
        return;
      }

      // 2. 同步到分潤管理系統並生成勞務報酬單
      try {
        // 獲取對應的分潤記錄
        const { data: commission, error: commissionError } = await supabase
          .from('commissions')
          .select('id, user_id')
          .eq('project_id', project.id)
          .single();

        if (commission && !commissionError) {
          // 獲取期數資訊
          const installment = installments.find(i => i.id === installmentId);
          
          // 創建分潤撥款記錄
          const payoutRecord = {
            commission_id: commission.id,
            project_id: project.id,
            user_id: commission.user_id,
            payout_date: paymentDate,
            payout_amount: commissionAmount,
            payment_basis: installment?.actual_amount || installment?.amount || 0,
            payout_ratio: installment?.amount ? commissionAmount / installment.amount : 0,
            related_installment_id: installmentId,
            notes: `專案期數撥款 - 第${installment?.installment_number || ''}期`,
            status: 'paid'
          };

          const { data: newPayout, error: payoutError } = await supabase
            .from('commission_payouts')
            .insert([payoutRecord])
            .select()
            .single();

          if (payoutError) {
            console.error('同步分潤撥款記錄失敗:', payoutError);
          } else {
            console.log('已同步到分潤管理系統');
            
            // 生成勞務報酬單
            const { generateLaborReceipt } = await import('../../utils/laborReceiptGenerator');
            const receiptResult = await generateLaborReceipt(commission.id, {
              paymentDate,
              partialAmount: commissionAmount,
              payoutId: newPayout.id,
              installmentNumber: installment?.installment_number || null
            });

            if (receiptResult.success) {
              // 更新撥款記錄，關聯勞務報酬單
              await supabase
                .from('commission_payouts')
                .update({ labor_receipt_id: receiptResult.receiptId })
                .eq('id', newPayout.id);
              
              console.log('已自動生成勞務報酬單:', receiptResult.receiptNumber);
            } else {
              console.error('生成勞務報酬單失敗:', receiptResult.error);
            }
          }
        }
      } catch (syncError) {
        console.error('同步到分潤系統時發生錯誤:', syncError);
      }
      
      alert('撥款記錄更新成功');
      fetchInstallments();
    }
  }

  async function deleteInstallment(installmentId, installmentNumber) {
    if (!supabase) return;
    
    const confirmed = confirm(`確定要刪除第 ${installmentNumber} 期嗎？`);
    if (!confirmed) return;
    
    const { error } = await supabase
      .from('project_installments')
      .delete()
      .eq('id', installmentId);
    
    if (error) {
      console.error(error);
      alert('刪除失敗');
    } else {
      alert('刪除成功');
      fetchInstallments();
    }
  }

  async function deleteProject() {
    if (!supabase || !project) {
      console.log('Missing supabase or project:', { supabase: !!supabase, project: !!project });
      return;
    }
    
    console.log('Attempting to delete project:', project.project_code, 'ID:', project.id);
    
    const confirmed = confirm(`確定要刪除專案「${project.project_code}」嗎？此操作將同時刪除所有相關的付款期數和分潤記錄，且無法復原。`);
    if (!confirmed) return;
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id);
    
    if (error) {
      console.error('Delete error:', error);
      alert(`刪除失敗: ${error.message}`);
    } else {
      console.log('Project deleted successfully');
      alert('專案刪除成功');
      router.push('/');
    }
  }

  async function updateProject(e) {
    e.preventDefault();
    if (!supabase) return;
    
    // 檢查專案ID是否有效
    if (!id) {
      alert('專案ID無效');
      return;
    }
    
    console.log('Updating project with data:', editFormData);
    console.log('Users available:', users);
    
    // 驗證必要欄位
    if (!editFormData.assigned_to) {
      alert('請選擇負責業務');
      return;
    }
    
    // 記錄修改歷史
    const changes = [];
    Object.keys(editFormData).forEach(key => {
      if (project[key] !== editFormData[key]) {
        changes.push({
          field: key,
          old_value: project[key],
          new_value: editFormData[key]
        });
      }
    });
    
    console.log('Changes detected:', changes);
    
    if (changes.length === 0) {
      alert('沒有變更');
      return;
    }
    
    // 檢查是否需要重新生成專案編號（當統編或簽約日期變更時）
    let updatedFormData = { ...editFormData };
    const taxIdChanged = changes.some(change => change.field === 'tax_id');
    const signDateChanged = changes.some(change => change.field === 'sign_date');
    
    if (taxIdChanged || signDateChanged) {
      console.log('Tax ID or Sign Date changed:', { taxIdChanged, signDateChanged });
      console.log('Current tax_id:', editFormData.tax_id);
      console.log('Current sign_date:', editFormData.sign_date);
      
      const signDateFormatted = editFormData.sign_date.replace(/-/g, '');
      const newProjectCode = editFormData.tax_id + '-' + signDateFormatted;
      
      console.log('New project code will be:', newProjectCode);
      console.log('Old project code was:', project.project_code);
      
      // 檢查新的專案編號是否已存在
      const { data: existingProject, error: checkError } = await supabase
        .from('projects')
        .select('id')
        .eq('project_code', newProjectCode)
        .neq('id', id)  // 直接使用 id (UUID)，不需要 parseInt
        .single();
      
      // 如果查詢出錯但不是"找不到記錄"的錯誤，則報告錯誤
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Check project code error:', checkError);
        alert('檢查專案編號時發生錯誤: ' + checkError.message);
        return;
      }
      
      if (existingProject) {
        alert('專案編號 ' + newProjectCode + ' 已存在，請檢查統編和簽約日期。');
        return;
      }
      
      updatedFormData.project_code = newProjectCode;
      
      // 新增專案編號變更記錄
      changes.push({
        field: 'project_code',
        old_value: project.project_code,
        new_value: newProjectCode
      });
      
      console.log('Project code regenerated:', newProjectCode);
    }
    
    const { error } = await supabase
      .from('projects')
      .update(updatedFormData)
      .eq('id', id);
    
    if (error) {
      console.error('Update error:', error);
      alert(`更新失敗: ${error.message}`);
    } else {
      console.log('Project updated successfully');
      
      // 記錄修改歷史
      if (changes.length > 0) {
        const { error: logError } = await supabase
          .from('project_change_logs')
          .insert(changes.map(change => ({
            project_id: id,
            field_name: change.field,
            old_value: String(change.old_value || ''),
            new_value: String(change.new_value || ''),
            changed_by: 'current_user', // 實際應該是登入用戶
            change_date: new Date().toISOString()
          })));
        
        if (logError) {
          console.error('Log error (non-critical):', logError);
        }
      }
      
      // 提供詳細的更新成功訊息
      let successMessage = '更新成功';
      if (taxIdChanged || signDateChanged) {
        successMessage += '\n\n專案編號已自動更新為：' + updatedFormData.project_code;
      }
      
      alert(successMessage);
      setShowEditForm(false);
      fetchProject();
    }
  }

  async function updateMaintenanceInfo(e) {
    e.preventDefault();
    if (!supabase) return;
    
    try {
      // 更新專案維護資訊
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          ...maintenanceForm,
          maintenance_fee: maintenanceForm.maintenance_fee ? parseFloat(maintenanceForm.maintenance_fee) : null
        })
        .eq('id', id);
      
      if (updateError) {
        throw updateError;
      }
      
      // 如果有維護費且有維護開始日期，創建維護費現金流
      if (maintenanceForm.maintenance_fee && maintenanceForm.maintenance_start_date) {
        await createMaintenanceCashflow();
      }
      
      alert('維護資訊更新成功');
      fetchProject();
    } catch (error) {
      console.error('更新維護資訊失敗:', error);
      alert('更新失敗: ' + error.message);
    }
  }
  
  async function createMaintenanceCashflow() {
    if (!supabase || !maintenanceForm.maintenance_fee || !maintenanceForm.maintenance_start_date) return;
    
    try {
      // 檢查是否已經存在維護費現金流
      const { data: existingCashflow } = await supabase
        .from('maintenance_cashflow')
        .select('id')
        .eq('project_id', id)
        .eq('status', 'active')
        .single();
      
      if (existingCashflow) {
        // 更新現有的維護費現金流
        const { error: updateError } = await supabase
          .from('maintenance_cashflow')
          .update({
            maintenance_fee: parseFloat(maintenanceForm.maintenance_fee),
            start_date: maintenanceForm.maintenance_start_date,
            next_billing_date: maintenanceForm.maintenance_billing_date || maintenanceForm.maintenance_start_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCashflow.id);
        
        if (updateError) throw updateError;
        console.log('更新維護費現金流成功');
      } else {
        // 創建新的維護費現金流
        const { error: insertError } = await supabase
          .from('maintenance_cashflow')
          .insert({
            project_id: id,
            maintenance_fee: parseFloat(maintenanceForm.maintenance_fee),
            start_date: maintenanceForm.maintenance_start_date,
            next_billing_date: maintenanceForm.maintenance_billing_date || maintenanceForm.maintenance_start_date,
            status: 'active',
            notes: `由專案 ${project?.project_name} 的維護合約自動創建`,
            created_by: 'system'
          });
        
        if (insertError) throw insertError;
        console.log('創建維護費現金流成功');
      }
    } catch (error) {
      console.error('處理維護費現金流失敗:', error);
      // 不中斷主流程，只記錄錯誤
    }
  }

  async function regenerateInstallments() {
    if (!supabase || !project) return;
    
    try {
      // 首先刪除現有的期數和分潤記錄
      const { error: deleteInstallmentsError } = await supabase
        .from('project_installments')
        .delete()
        .eq('project_id', id);
      
      if (deleteInstallmentsError) {
        console.error('刪除期數失敗:', deleteInstallmentsError);
        alert('刪除現有期數失敗');
        return;
      }

      const { error: deleteCommissionsError } = await supabase
        .from('commissions')
        .delete()
        .eq('project_id', id);
      
      if (deleteCommissionsError) {
        console.error('刪除分潤記錄失敗:', deleteCommissionsError);
      }

      // 使用當前專案設定重新生成期數
      await generateInstallments(
        project.id,
        project.payment_template,
        project.amount,
        project.tax_last,
        project.first_payment_date,
        project.type,
        project.assigned_to,
        project.use_fixed_commission,
        project.fixed_commission_percentage
      );

      alert('期數重新生成成功');
      fetchInstallments();
      fetchCommissions();
    } catch (error) {
      console.error('重新生成期數失敗:', error);
      alert('重新生成期數失敗');
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
      
      // 按照此期付款比例計算應撥分潤
      const paymentRatio = ratio / totalRatio; // 此期付款在總金額中的比例
      const commissionForThisInstallment = totalCommissionAmount * paymentRatio;
      
      installments.push({
        project_id: projectId,
        installment_number: index + 1,
        due_date: currentDate.toISOString().split('T')[0],
        amount: Math.round(installmentAmount),
        commission_amount: Math.round(commissionForThisInstallment),
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

  if (!project) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
    );
  }

  const totalPaid = installments
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);
  
  const totalAmount = project.amount * 1.05;
  const paymentProgress = (totalPaid / totalAmount * 100).toFixed(1);

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← 返回專案列表
        </button>
        <button
          onClick={deleteProject}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          刪除專案
        </button>
      </div>

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0 }}>專案詳情：{project.project_code}</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>客戶資訊</h4>
            <p><strong>客戶名稱：</strong>{project.client_name}</p>
            <p><strong>專案名稱：</strong>{project.project_name}</p>
            <p><strong>聯絡人：</strong>{project.contact_person}</p>
            <p><strong>電話：</strong>{project.contact_phone}</p>
            <p><strong>Email：</strong>{project.contact_email}</p>
            <p><strong>統編/身分證：</strong>{project.tax_id}</p>
          </div>
          
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>專案資訊</h4>
            <p><strong>負責業務：</strong>{assignedUser?.name || '-'}</p>
            <p><strong>簽約日期：</strong>{project.sign_date}</p>
            <p><strong>預計完成：</strong>{project.expected_completion_date}</p>
            <p><strong>未稅金額：</strong>NT$ {project.amount?.toLocaleString()}</p>
            <p><strong>含稅金額：</strong>NT$ {totalAmount?.toLocaleString()}</p>
            <p><strong>付款模板：</strong>{project.payment_template}</p>
            <p><strong>分潤方式：</strong>
              {project.use_fixed_commission ? 
                `固定 ${project.fixed_commission_percentage}%` : 
                '階梯式分潤'
              }
            </p>
          </div>
          
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>財務分析</h4>
            <div style={{
              backgroundColor: '#e9ecef',
              borderRadius: '8px',
              overflow: 'hidden',
              height: '30px',
              marginBottom: '1rem'
            }}>
              <div style={{
                backgroundColor: paymentProgress >= 100 ? '#27ae60' : '#3498db',
                width: `${Math.min(paymentProgress, 100)}%`,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                {paymentProgress}%
              </div>
            </div>
            <p><strong>已收金額：</strong>NT$ {totalPaid.toLocaleString()}</p>
            <p><strong>待收金額：</strong>NT$ {(totalAmount - totalPaid).toLocaleString()}</p>
            {canViewFinancialData(userRole) && (() => {
              // 分別計算已支出和待支出成本
              const paidCosts = costs.filter(cost => cost.is_paid).reduce((sum, cost) => sum + parseFloat(cost.amount), 0);
              const unpaidCosts = costs.filter(cost => !cost.is_paid).reduce((sum, cost) => sum + parseFloat(cost.amount), 0);
              const totalCosts = paidCosts + unpaidCosts;
              const totalCommissionAmount = commissions.length > 0 ? commissions[0].amount : 0;
              // 預期利潤 = 總案金額 - 分潤總額 - 已支出成本 - 待支出成本
              const expectedProfit = project.amount - totalCommissionAmount - totalCosts;
              const profitMargin = project.amount > 0 ? ((expectedProfit / project.amount) * 100).toFixed(1) : 0;
              
              return (
                <>
                  <p><strong>已支出成本：</strong>
                    <span style={{ color: paidCosts > 0 ? '#e74c3c' : '#6c757d' }}>
                      NT$ {paidCosts.toLocaleString()}
                    </span>
                  </p>
                  <p><strong>待支出成本：</strong>
                    <span style={{ color: unpaidCosts > 0 ? '#f39c12' : '#6c757d' }}>
                      NT$ {unpaidCosts.toLocaleString()}
                    </span>
                  </p>
                  <p><strong>總成本：</strong>
                    <span style={{ color: totalCosts > 0 ? '#e74c3c' : '#6c757d' }}>
                      NT$ {totalCosts.toLocaleString()}
                    </span>
                  </p>
                  <p><strong>預期利潤：</strong>
                    <span style={{ 
                      color: expectedProfit > 0 ? '#27ae60' : '#e74c3c',
                      fontWeight: 'bold'
                    }}>
                      NT$ {expectedProfit.toLocaleString()} ({profitMargin}%)
                    </span>
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>付款期數管理</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={async () => {
                const confirmed = confirm('確定要重新生成期數嗎？這將刪除現有期數並根據當前專案設定重新生成。');
                if (!confirmed) return;
                
                await regenerateInstallments();
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#9b59b6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              自動生成
            </button>
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f39c12',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {showEditForm ? '取消編輯' : '編輯專案'}
            </button>
            <button
              onClick={() => setShowAddInstallment(!showAddInstallment)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {showAddInstallment ? '取消' : '新增期數'}
            </button>
          </div>
        </div>

{showEditForm && (
          <form onSubmit={updateProject} style={{
            backgroundColor: '#fff3cd',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #ffeaa7'
          }}>
            <h4>編輯專案資訊</h4>
            
            <h5 style={{ marginBottom: '1rem', color: '#2c3e50' }}>客戶資訊</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>客戶名稱 *</label>
                <input
                  type="text"
                  value={editFormData.client_name || ''}
                  onChange={(e) => setEditFormData({...editFormData, client_name: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>專案名稱 *</label>
                <input
                  type="text"
                  value={editFormData.project_name || ''}
                  onChange={(e) => setEditFormData({...editFormData, project_name: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>聯絡人 *</label>
                <input
                  type="text"
                  value={editFormData.contact_person || ''}
                  onChange={(e) => setEditFormData({...editFormData, contact_person: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>聯絡電話 *</label>
                <input
                  type="tel"
                  value={editFormData.contact_phone || ''}
                  onChange={(e) => setEditFormData({...editFormData, contact_phone: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>聯絡 Email *</label>
                <input
                  type="email"
                  value={editFormData.contact_email || ''}
                  onChange={(e) => setEditFormData({...editFormData, contact_email: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>統一編號/身分證 *</label>
                <input
                  type="text"
                  value={editFormData.tax_id || ''}
                  onChange={(e) => setEditFormData({...editFormData, tax_id: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </div>

            <h5 style={{ marginBottom: '1rem', color: '#2c3e50' }}>專案資訊</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>簽約日期 *</label>
                <input
                  type="date"
                  value={editFormData.sign_date || ''}
                  onChange={(e) => setEditFormData({...editFormData, sign_date: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>第一筆款項付款日期 *</label>
                <input
                  type="date"
                  value={editFormData.first_payment_date || ''}
                  onChange={(e) => setEditFormData({...editFormData, first_payment_date: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>預計完成日期 *</label>
                <input
                  type="date"
                  value={editFormData.expected_completion_date || ''}
                  onChange={(e) => setEditFormData({...editFormData, expected_completion_date: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>未稅總額 *</label>
                <input
                  type="number"
                  value={editFormData.amount || ''}
                  onChange={(e) => setEditFormData({...editFormData, amount: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                {editFormData.amount && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                    含稅總額 (5%): NT$ {(parseFloat(editFormData.amount) * 1.05).toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>專案類型 *</label>
                <select
                  value={editFormData.type || ''}
                  onChange={(e) => setEditFormData({...editFormData, type: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="new">新簽</option>
                  <option value="renewal">續簽</option>
                  <option value="maintenance">維護費</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>付款模板 *</label>
                <input
                  type="text"
                  value={editFormData.payment_template || ''}
                  onChange={(e) => setEditFormData({...editFormData, payment_template: e.target.value})}
                  placeholder="例如: 6/4, 3/2/3/2"
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>負責業務 *</label>
                <select
                  value={editFormData.assigned_to || ''}
                  onChange={(e) => setEditFormData({...editFormData, assigned_to: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="">選擇業務人員</option>
                  {users.length > 0 ? users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  )) : (
                    <option value="" disabled>載入中...</option>
                  )}
                </select>
              </div>
            </div>

            <h5 style={{ marginBottom: '1rem', color: '#2c3e50' }}>分潤設定</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editFormData.use_fixed_commission || false}
                    onChange={(e) => setEditFormData({...editFormData, use_fixed_commission: e.target.checked})}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span style={{ fontWeight: 'bold' }}>使用固定分潤比例</span>
                </label>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                  {editFormData.use_fixed_commission ? '將使用固定比例計算分潤' : '將使用階梯式分潤計算'}
                </div>
              </div>
              
              {editFormData.use_fixed_commission && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    固定分潤比例 (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={editFormData.fixed_commission_percentage || ''}
                    onChange={(e) => setEditFormData({...editFormData, fixed_commission_percentage: e.target.value})}
                    required={editFormData.use_fixed_commission}
                    placeholder="例如: 25"
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
              )}
            </div>

            <h5 style={{ marginBottom: '1rem', color: '#2c3e50' }}>付款設定</h5>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>稅金付款時機</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={!editFormData.tax_last}
                    onChange={() => setEditFormData({...editFormData, tax_last: false})}
                    style={{ marginRight: '0.5rem' }}
                  />
                  分期含稅
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={editFormData.tax_last}
                    onChange={() => setEditFormData({...editFormData, tax_last: true})}
                    style={{ marginRight: '0.5rem' }}
                  />
                  稅最後付
                </label>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                {editFormData.tax_last ? '稅金將與最後一期款項一起支付' : '每期款項包含稅金'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                確認更新
              </button>
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
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
        )}

        {showAddInstallment && (
          <form onSubmit={handleAddInstallment} style={{
            backgroundColor: '#f8f9fa',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
              <input
                type="number"
                placeholder="期數"
                value={installmentForm.installment_number}
                onChange={(e) => setInstallmentForm({...installmentForm, installment_number: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="date"
                placeholder="預定付款日"
                value={installmentForm.due_date}
                onChange={(e) => setInstallmentForm({...installmentForm, due_date: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="number"
                placeholder="金額"
                value={installmentForm.amount}
                onChange={(e) => setInstallmentForm({...installmentForm, amount: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                確認新增
              </button>
            </div>
          </form>
        )}

        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '1000px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '80px' }}>期數</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '110px' }}>預定日期</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '120px' }}>應收金額 (比例)</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '100px' }}>實收金額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '110px' }}>實際付款日</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '80px' }}>狀態</th>
                {canViewFinancialData(userRole) && (
                  <>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '100px' }}>應撥分潤</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '100px' }}>實撥分潤</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '100px' }}>撥款日</th>
                  </>
                )}
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '120px' }}>操作</th>
              </tr>
            </thead>
          <tbody>
            {installments.map((installment, index) => {
              // 計算該期應撥分潤金額
              const commission = commissions.length > 0 ? commissions[0] : null;
              const commissionPerInstallment = installment.commission_amount || (commission ? (commission.amount / installments.length) : 0);
              
              // 計算百分比
              const totalAmount = project.amount * 1.05; // 含稅總額
              const baseAmount = project.amount; // 不含稅金額
              const percentage = ((installment.amount / totalAmount) * 100).toFixed(1);
              
              // 檢查是否為最後一期及是否為稅最後付
              const isLastInstallment = index === installments.length - 1;
              const taxAmount = project.amount * 0.05;
              const baseInstallmentAmount = installment.amount - (isLastInstallment && project.tax_last ? taxAmount : 0);
              const hasTax = isLastInstallment && project.tax_last;
              
              return (
                <tr key={installment.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>第 {installment.installment_number} 期</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{installment.due_date}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>NT$ {installment.amount?.toLocaleString()}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>({percentage}%)</div>
                      {hasTax && (
                        <div style={{ fontSize: '0.7rem', color: '#e74c3c', marginTop: '2px' }}>
                          含稅金 NT$ {taxAmount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: installment.actual_amount ? 'bold' : 'normal' }}>
                    {installment.actual_amount ? `NT$ ${installment.actual_amount.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{installment.payment_date || '-'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      backgroundColor: installment.status === 'paid' ? '#27ae60' : '#f39c12',
                      color: 'white',
                      fontSize: '0.8rem',
                      fontWeight: '500'
                    }}>
                      {installment.status === 'paid' ? '已付款' : '待付款'}
                    </span>
                  </td>
                  {canViewFinancialData(userRole) && (
                    <>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#27ae60' }}>
                        {commissionPerInstallment > 0 ? `NT$ ${Math.round(commissionPerInstallment).toLocaleString()}` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#e74c3c' }}>
                        {installment.actual_commission ? `NT$ ${installment.actual_commission.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{installment.commission_payment_date || '-'}</td>
                    </>
                  )}
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '0.25rem', 
                      justifyContent: 'center' 
                    }}>
                      {installment.status !== 'paid' && (
                        <button
                          onClick={() => {
                            const paymentDate = prompt('請輸入付款日期 (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                            if (!paymentDate) return;
                            
                            const actualAmount = prompt('請輸入實際收款金額:', installment.amount);
                            if (!actualAmount) return;
                            
                            let actualCommission = null;
                            let commissionDate = null;
                            
                            if (canViewFinancialData(userRole)) {
                              actualCommission = prompt('請輸入實際撥款金額:', Math.round(installment.commission_amount || 0));
                              commissionDate = prompt('請輸入撥款日期 (YYYY-MM-DD):', paymentDate);
                            }
                            
                            updateInstallmentStatus(installment.id, 'paid', paymentDate, actualAmount, actualCommission, commissionDate);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                            minWidth: 'fit-content'
                          }}
                        >
                          標記已付
                        </button>
                      )}
                      {/* 勞務報酬單按鈕 - 有實撥分潤的期數可以下載 */}
                      {installment.actual_commission > 0 && (
                        <button
                          onClick={() => downloadInstallmentLaborReceipt(installment)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#9b59b6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                            minWidth: 'fit-content',
                            marginLeft: '0.25rem'
                          }}
                          title="下載此期勞務報酬單"
                        >
                          📄 勞務報酬單
                        </button>
                      )}
                      {installment.status === 'paid' && (
                        <button
                          onClick={() => {
                            const paymentDate = prompt('請輸入付款日期 (YYYY-MM-DD):', installment.payment_date || new Date().toISOString().split('T')[0]);
                            if (!paymentDate) return;
                            
                            const actualAmount = prompt('請輸入實際收款金額:', installment.actual_amount || installment.amount);
                            if (!actualAmount) return;
                            
                            let actualCommission = null;
                            let commissionDate = null;
                            
                            if (canViewFinancialData(userRole)) {
                              actualCommission = prompt('請輸入實際撥款金額:', installment.actual_commission || Math.round(installment.commission_amount || 0));
                              commissionDate = prompt('請輸入撥款日期 (YYYY-MM-DD):', installment.commission_payment_date || paymentDate);
                            }
                            
                            updateInstallmentStatus(installment.id, 'paid', paymentDate, actualAmount, actualCommission, commissionDate);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#f39c12',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                            minWidth: 'fit-content'
                          }}
                        >
                          編輯
                        </button>
                      )}
                      <button
                        onClick={() => deleteInstallment(installment.id, installment.installment_number)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#95a5a6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                          minWidth: 'fit-content'
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            
            {/* 總計行 */}
            {installments.length > 0 && (
              <tr style={{ 
                backgroundColor: '#f8f9fa', 
                borderTop: '2px solid #2c3e50',
                fontWeight: 'bold'
              }}>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>總計</td>
                <td style={{ padding: '0.75rem 0.5rem' }}>-</td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#2c3e50' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>NT$ {installments.reduce((sum, inst) => sum + (inst.amount || 0), 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>(100%)</div>
                  </div>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#e74c3c' }}>
                  NT$ {installments
                    .filter(inst => inst.actual_amount)
                    .reduce((sum, inst) => sum + (inst.actual_amount || 0), 0)
                    .toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>-</td>
                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>-</td>
                {canViewFinancialData(userRole) && (
                  <>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#27ae60' }}>
                      NT$ {installments.reduce((sum, inst) => sum + (inst.commission_amount || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#e74c3c' }}>
                      NT$ {installments
                        .filter(inst => inst.actual_commission)
                        .reduce((sum, inst) => sum + (inst.actual_commission || 0), 0)
                        .toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>-</td>
                  </>
                )}
                <td style={{ padding: '0.75rem 0.5rem' }}>-</td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
        
        {/* 分潤總覽 - 只有 Admin 和 Finance 可以看到 */}
        {canViewFinancialData(userRole) && commissions.length > 0 && (() => {
          // 使用 commission_summary 視圖的資料
          const commission = commissions[0];
          const totalPaidCommission = commission.total_paid_amount || 0;
          const totalCommissionAmount = commission.amount || 0;
          const remainingCommission = commission.remaining_amount || 0;
          
          return (
            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 1rem 0', color: '#27ae60' }}>分潤資訊</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>分潤比例：</strong>{commission.percentage?.toFixed(1)}%
                </div>
                <div>
                  <strong>分潤總額：</strong>NT$ {totalCommissionAmount.toLocaleString()}
                </div>
                <div>
                  <strong>已撥金額：</strong>
                  <span style={{ color: '#27ae60', fontWeight: 'bold' }}>
                    NT$ {totalPaidCommission.toLocaleString()}
                  </span>
                </div>
                <div>
                  <strong>待撥金額：</strong>
                  <span style={{ color: remainingCommission > 0 ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>
                    NT$ {remainingCommission.toLocaleString()}
                  </span>
                </div>
                <div>
                  <strong>撥款狀態：</strong>
                  <span style={{
                    marginLeft: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: remainingCommission <= 0 ? '#27ae60' : '#f39c12',
                    color: 'white',
                    fontSize: '0.875rem'
                  }}>
                    {remainingCommission <= 0 ? '已全額撥款' : `待撥 ${((remainingCommission / totalCommissionAmount) * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
        
        {installments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
            尚未設定付款期數
          </div>
        )}
      </div>

      {/* 成本管理區塊 - 只有 Admin 和 Finance 可以看到 */}
      {canViewFinancialData(userRole) && (
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>專案成本管理</h3>
            {canEditCosts(userRole) && (
              <button
                onClick={() => setShowAddCost(!showAddCost)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#e67e22',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {showAddCost ? '取消' : '新增成本'}
              </button>
            )}
          </div>

        {showAddCost && (
          <form onSubmit={handleAddCost} style={{
            backgroundColor: '#fef9e7',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #f1c40f'
          }}>
            <h4>新增成本項目</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  成本類型 *
                </label>
                <select
                  value={costForm.cost_type}
                  onChange={(e) => setCostForm({...costForm, cost_type: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">請選擇成本類型</option>
                  <option value="公司內部成本">公司內部成本</option>
                  <option value="外包成本">外包成本</option>
                  <option value="設備成本">設備成本</option>
                  <option value="人力成本">人力成本</option>
                  <option value="行銷成本">行銷成本</option>
                  <option value="其他成本">其他成本</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  成本金額 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={costForm.amount}
                  onChange={(e) => setCostForm({...costForm, amount: e.target.value})}
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
                  成本日期 *
                </label>
                <input
                  type="date"
                  value={costForm.cost_date}
                  onChange={(e) => setCostForm({...costForm, cost_date: e.target.value})}
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
                  描述
                </label>
                <input
                  type="text"
                  value={costForm.description}
                  onChange={(e) => setCostForm({...costForm, description: e.target.value})}
                  placeholder="成本項目詳細描述"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  關聯期數
                </label>
                <select
                  value={costForm.installment_number}
                  onChange={(e) => setCostForm({...costForm, installment_number: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">直接支出（不綁定期數）</option>
                  {installments.map(installment => (
                    <option key={installment.id} value={installment.installment_number}>
                      第 {installment.installment_number} 期 (NT$ {installment.amount?.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  支付狀態
                </label>
                <select
                  value={costForm.is_paid ? 'true' : 'false'}
                  onChange={(e) => {
                    const isPaid = e.target.value === 'true';
                    setCostForm({
                      ...costForm, 
                      is_paid: isPaid,
                      paid_date: isPaid ? new Date().toISOString().split('T')[0] : ''
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="false">待支出</option>
                  <option value="true">已支出</option>
                </select>
              </div>
              
              {costForm.is_paid && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    支付日期
                  </label>
                  <input
                    type="date"
                    value={costForm.paid_date}
                    onChange={(e) => setCostForm({...costForm, paid_date: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                備註
              </label>
              <textarea
                value={costForm.notes}
                onChange={(e) => setCostForm({...costForm, notes: e.target.value})}
                rows="3"
                placeholder="其他備註資訊"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>
            
            {/* 發票/單據管理區塊 */}
            <div style={{ 
              border: '2px solid #3498db', 
              borderRadius: '8px', 
              padding: '1.5rem', 
              marginBottom: '1rem',
              backgroundColor: '#f8f9ff'
            }}>
              <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#3498db' }}>發票/單據資訊</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    單據類型
                  </label>
                  <select
                    value={costForm.receipt_type}
                    onChange={(e) => setCostForm({...costForm, receipt_type: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="invoice">統一發票</option>
                    <option value="receipt">收據</option>
                    <option value="other">其他單據</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    發票號碼
                  </label>
                  <input
                    type="text"
                    value={costForm.invoice_number}
                    onChange={(e) => setCostForm({...costForm, invoice_number: e.target.value})}
                    placeholder="例如：AB12345678"
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
                    發票日期
                  </label>
                  <input
                    type="date"
                    value={costForm.invoice_date}
                    onChange={(e) => setCostForm({...costForm, invoice_date: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    供應商名稱
                  </label>
                  <input
                    type="text"
                    value={costForm.vendor_name}
                    onChange={(e) => setCostForm({...costForm, vendor_name: e.target.value})}
                    placeholder="供應商公司名稱"
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
                    供應商統一編號
                  </label>
                  <input
                    type="text"
                    value={costForm.vendor_tax_id}
                    onChange={(e) => setCostForm({...costForm, vendor_tax_id: e.target.value})}
                    placeholder="8位數統一編號"
                    maxLength="8"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    淨額 (不含稅)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costForm.net_amount}
                    onChange={(e) => {
                      const netAmount = parseFloat(e.target.value) || 0;
                      const taxAmount = netAmount * 0.05; // 5% 營業稅
                      setCostForm({
                        ...costForm, 
                        net_amount: e.target.value,
                        tax_amount: taxAmount.toString(),
                        amount: (netAmount + taxAmount).toString()
                      });
                    }}
                    placeholder="不含稅金額"
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
                    稅額
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costForm.tax_amount}
                    onChange={(e) => setCostForm({...costForm, tax_amount: e.target.value})}
                    placeholder="營業稅額"
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
                    單據狀態
                  </label>
                  <select
                    value={costForm.document_status}
                    onChange={(e) => setCostForm({...costForm, document_status: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="pending">待收單據</option>
                    <option value="received">已收到</option>
                    <option value="filed">已歸檔</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* 檔案上傳區塊 */}
            <div style={{
              border: '2px solid #27ae60',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1rem',
              backgroundColor: '#f8fff8'
            }}>
              <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#27ae60' }}>發票/單據上傳</h4>
              <FileUpload
                onFileUploaded={(fileInfo) => {
                  setCostForm({
                    ...costForm,
                    uploaded_files: [...costForm.uploaded_files, fileInfo]
                  });
                }}
                onFileDeleted={(deletedFile) => {
                  setCostForm({
                    ...costForm,
                    uploaded_files: costForm.uploaded_files.filter(file => file.filePath !== deletedFile.filePath)
                  });
                }}
                bucket={STORAGE_BUCKETS.INVOICES}
                folder={`${FOLDER_STRUCTURE.COSTS}/${new Date().getFullYear()}/${id}`}
                currentFiles={costForm.uploaded_files}
                maxFiles={50}
                label="上傳發票/收據"
                projectId={id}
                userId={authUser?.id}
              />
            </div>
            
            <button
              type="submit"
              style={{
                padding: '0.5rem 2rem',
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

        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '1200px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '80px' }}>成本類型</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '120px' }}>描述</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '120px' }}>供應商</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '100px' }}>發票號碼</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '80px' }}>淨額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '60px' }}>稅額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', width: '80px' }}>總額</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '50px' }}>期數</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '60px' }}>單據狀態</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '60px' }}>支付狀態</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '60px' }}>附件</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '80px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(cost => (
                <tr key={cost.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: cost.cost_type === '公司內部成本' ? '#3498db' : 
                                     cost.cost_type === '外包成本' ? '#e67e22' :
                                     cost.cost_type === '設備成本' ? '#9b59b6' :
                                     cost.cost_type === '人力成本' ? '#27ae60' :
                                     cost.cost_type === '行銷成本' ? '#f39c12' : '#95a5a6',
                      color: 'white',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {cost.cost_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{cost.description || '-'}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{cost.vendor_name || '-'}</div>
                      {cost.vendor_tax_id && (
                        <div style={{ fontSize: '0.7rem', color: '#666' }}>統編: {cost.vendor_tax_id}</div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{cost.invoice_number || '-'}</div>
                      {cost.invoice_date && (
                        <div style={{ fontSize: '0.7rem', color: '#666' }}>{cost.invoice_date}</div>
                      )}
                      <span style={{
                        padding: '0.1rem 0.3rem',
                        borderRadius: '3px',
                        backgroundColor: cost.receipt_type === 'invoice' ? '#3498db' : cost.receipt_type === 'receipt' ? '#f39c12' : '#95a5a6',
                        color: 'white',
                        fontSize: '0.6rem'
                      }}>
                        {cost.receipt_type === 'invoice' ? '發票' : cost.receipt_type === 'receipt' ? '收據' : '其他'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#2c3e50' }}>
                    NT$ {(cost.net_amount || cost.amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#e67e22' }}>
                    NT$ {(cost.tax_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#e74c3c' }}>
                    NT$ {parseFloat(cost.amount).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    {cost.installment_number ? `第${cost.installment_number}期` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: cost.document_status === 'filed' ? '#27ae60' : 
                                     cost.document_status === 'received' ? '#3498db' : '#f39c12',
                      color: 'white',
                      fontSize: '0.7rem'
                    }}>
                      {cost.document_status === 'filed' ? '已歸檔' : 
                       cost.document_status === 'received' ? '已收到' : '待收'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: cost.is_paid ? '#27ae60' : '#f39c12',
                      color: 'white',
                      fontSize: '0.7rem'
                    }}>
                      {cost.is_paid ? '已支出' : '待支出'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    {(() => {
                      try {
                        const attachments = cost.file_attachments ? JSON.parse(cost.file_attachments) : [];
                        return attachments.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {attachments.map((file, index) => (
                              <a
                                key={index}
                                href={file.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '0.2rem 0.4rem',
                                  backgroundColor: '#3498db',
                                  color: 'white',
                                  textDecoration: 'none',
                                  borderRadius: '3px',
                                  fontSize: '0.7rem',
                                  display: 'block',
                                  textAlign: 'center'
                                }}
                              >
                                {file.originalName?.length > 10 
                                  ? file.originalName.substring(0, 10) + '...' 
                                  : file.originalName || '檔案'}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#999', fontSize: '0.8rem' }}>無附件</span>
                        );
                      } catch (e) {
                        return <span style={{ color: '#999', fontSize: '0.8rem' }}>無附件</span>;
                      }
                    })()}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {!cost.is_paid && (
                        <button
                          onClick={() => markCostAsPaid(cost.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.7rem'
                          }}
                        >
                          標記已支出
                        </button>
                      )}
                      <button
                        onClick={() => editCost(cost)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.7rem'
                        }}
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => deleteCost(cost.id, cost.description || cost.cost_type)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.7rem'
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
          
          {costs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
              尚未新增成本項目
            </div>
          )}
        </div>

        {/* 成本總覽 */}
        {costs.length > 0 && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef2e0', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#e67e22' }}>成本總覽</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              {(() => {
                const costSummary = costs.reduce((acc, cost) => {
                  const type = cost.cost_type;
                  if (!acc[type]) acc[type] = 0;
                  acc[type] += parseFloat(cost.amount);
                  return acc;
                }, {});
                
                const totalCosts = Object.values(costSummary).reduce((sum, amount) => sum + amount, 0);
                
                return (
                  <>
                    {Object.entries(costSummary).map(([type, amount]) => (
                      <div key={type}>
                        <strong>{type}：</strong>
                        <span style={{ color: '#e74c3c' }}>NT$ {amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ 
                      gridColumn: '1 / -1',
                      borderTop: '2px solid #e67e22',
                      paddingTop: '0.5rem',
                      marginTop: '0.5rem'
                    }}>
                      <strong>總成本：</strong>
                      <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        NT$ {totalCosts.toLocaleString()}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
        </div>
      )}

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>保固與維護資訊</h3>
        
        <form onSubmit={updateMaintenanceInfo}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                保固期間（月）
              </label>
              <input
                type="number"
                value={maintenanceForm.warranty_period}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, warranty_period: e.target.value})}
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
                實際結案日期
              </label>
              <input
                type="date"
                value={maintenanceForm.actual_completion_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, actual_completion_date: e.target.value})}
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
                維護起算日
              </label>
              <input
                type="date"
                value={maintenanceForm.maintenance_start_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_start_date: e.target.value})}
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
                維護費起收日
              </label>
              <input
                type="date"
                value={maintenanceForm.maintenance_billing_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_billing_date: e.target.value})}
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
                維護費金額（月）
              </label>
              <input
                type="number"
                value={maintenanceForm.maintenance_fee}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_fee: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
          
          <button
            type="submit"
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 2rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            更新維護資訊
          </button>
        </form>
      </div>

      {/* 專案文件管理區塊 */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <ProjectDocuments projectId={id} userRole={userRole} />
      </div>
    </div>
  );
}