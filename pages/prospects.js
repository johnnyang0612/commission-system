import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
// Layout is handled by _app.js
import { supabase } from '../utils/supabaseClient';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  FunnelChart, Funnel, LabelList
} from 'recharts';
import { exportProspectsToExcel, exportProspectReportToPDF } from '../utils/exportUtils';
import styles from '../styles/Prospects.module.css';

const STAGES = [
  { id: '初談', label: '初談', color: '#94a3b8' },
  { id: '報價中', label: '報價中', color: '#60a5fa' },
  { id: '等客戶回覆', label: '等客戶回覆', color: '#fbbf24' },
  { id: '確認簽約', label: '確認簽約', color: '#34d399' },
  { id: '已失單', label: '已失單', color: '#f87171' },
  { id: '已轉換', label: '已轉換', color: '#10b981' }
];

export default function Prospects() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(
    typeof window !== 'undefined' && window.innerWidth <= 768 ? 'table' : 'board'
  ); // 'board' or 'table' - mobile defaults to table
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
    fixed_commission_percentage: ''
  });
  const [statistics, setStatistics] = useState(null);

  useEffect(() => {
    checkUser();
    fetchUsers();
    fetchProspects();
    fetchStatistics();
  }, []);

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
      fixed_commission_percentage: ''
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
      fixed_commission_percentage: prospect.fixed_commission_percentage || ''
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

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>未成案專案管理（Sales Pipeline）</h2>
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
          <div className={styles.viewToggle}>
            <button 
              className={viewMode === 'board' ? styles.active : ''}
              onClick={() => setViewMode('board')}
            >
              看板模式
            </button>
            <button 
              className={viewMode === 'table' ? styles.active : ''}
              onClick={() => setViewMode('table')}
            >
              表格模式
            </button>
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

      <div className={styles.mainContent}>
        {viewMode === 'board' ? (
          <div className={styles.boardContainer}>
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className={styles.board}>
                  {STAGES.filter(s => !['已失單', '已轉換'].includes(s.id)).map(stage => (
                    <div key={stage.id} className={styles.column}>
                      <div 
                        className={styles.columnHeader}
                        style={{ backgroundColor: stage.color }}
                      >
                        <h3>{stage.label}</h3>
                        <span className={styles.count}>
                          {prospects.filter(p => p.stage === stage.id).length}
                        </span>
                      </div>
                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`${styles.columnContent} ${
                              snapshot.isDraggingOver ? styles.draggingOver : ''
                            }`}
                          >
                            {prospects
                              .filter(p => p.stage === stage.id)
                              .map((prospect, index) => (
                                <Draggable
                                  key={prospect.id}
                                  draggableId={prospect.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`${styles.card} ${
                                        snapshot.isDragging ? styles.dragging : ''
                                      }`}
                                      onClick={() => openEditModal(prospect)}
                                    >
                                      <div className={styles.cardHeader}>
                                        <h4>{prospect.project_name}</h4>
                                        {stage.id === '確認簽約' && (
                                          <button
                                            className={styles.convertButton}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleConvertToProject(prospect);
                                            }}
                                          >
                                            轉換
                                          </button>
                                        )}
                                      </div>
                                      <div className={styles.cardBody}>
                                        <p className={styles.clientName}>{prospect.client_name}</p>
                                        <p className={styles.amount}>
                                          NT$ {parseFloat(prospect.estimated_amount).toLocaleString()}
                                        </p>
                                        <p className={styles.owner}>
                                          {prospect.owner?.name || '未指派'}
                                        </p>
                                        {prospect.expected_sign_date && (
                                          <p className={styles.date}>
                                            預計：{new Date(prospect.expected_sign_date).toLocaleDateString()}
                                          </p>
                                        )}
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
              
              <div className={styles.charts}>
                <div className={styles.chart}>
                  <h3>轉換漏斗</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <FunnelChart>
                      <Tooltip />
                      <Funnel
                        dataKey="value"
                        data={getFunnelData()}
                        isAnimationActive
                      >
                        <LabelList position="center" fill="#fff" />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>客戶名稱</th>
                    <th>專案名稱</th>
                    <th>預估金額</th>
                    <th>分潤比例</th>
                    <th>預估分潤</th>
                    <th>負責人</th>
                    <th>階段</th>
                    <th>預計簽約日</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map(prospect => (
                    <tr key={prospect.id}>
                      <td>{prospect.client_name}</td>
                      <td>{prospect.project_name}</td>
                      <td>NT$ {parseFloat(prospect.estimated_amount).toLocaleString()}</td>
                      <td>{prospect.commission_rate}%</td>
                      <td>
                        NT$ {(parseFloat(prospect.estimated_amount) * prospect.commission_rate / 100).toLocaleString()}
                      </td>
                      <td>{prospect.owner?.name || '未指派'}</td>
                      <td>
                        <select 
                          value={prospect.stage}
                          onChange={(e) => handleStageChange(prospect.id, e.target.value)}
                          style={{
                            backgroundColor: STAGES.find(s => s.id === prospect.stage)?.color,
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          {STAGES.map(stage => (
                            <option key={stage.id} value={stage.id} style={{ color: 'black' }}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {prospect.expected_sign_date 
                          ? new Date(prospect.expected_sign_date).toLocaleDateString()
                          : '-'
                        }
                      </td>
                      <td>
                        <button
                          className={styles.editButton}
                          onClick={() => openEditModal(prospect)}
                        >
                          編輯
                        </button>
                        {prospect.stage === '確認簽約' && (
                          <button
                            className={styles.convertButton}
                            onClick={() => handleConvertToProject(prospect)}
                          >
                            轉換
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                  
                  <div className={styles.formGroup}>
                    <label>分潤比例 (%) *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.use_fixed_commission ? formData.fixed_commission_percentage : formData.commission_rate}
                      onChange={(e) => {
                        if (formData.use_fixed_commission) {
                          setFormData({
                            ...formData, 
                            fixed_commission_percentage: e.target.value,
                            commission_rate: parseFloat(e.target.value) || 0
                          });
                        }
                      }}
                      disabled={!formData.use_fixed_commission}
                      placeholder={!formData.use_fixed_commission ? "將根據階梯式自動計算" : "請輸入固定比例"}
                      required
                    />
                    {!formData.use_fixed_commission && (
                      <small style={{ color: '#6b7280', fontSize: '12px' }}>
                        依金額階梯：≤10萬(35%) | 10-30萬(30%) | 30-60萬(25%) | 60-100萬(20%) | >100萬(10%)
                      </small>
                    )}
                  </div>
                  
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
      </div>
  );
}