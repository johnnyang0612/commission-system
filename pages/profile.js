import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';
import { generateLaborReceiptPDF, downloadLaborReceiptCSV } from '../utils/laborReceiptPDF';

export default function Profile() {
  const { user: authUser } = useSimpleAuth();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    // 基本資訊
    name: '',
    email: '',
    phone_number: '',
    mobile_number: '',
    extension: '',
    job_title: '',
    department: '',
    
    // 身分資訊
    national_id: '',
    birth_date: '',
    registered_address: '',
    mailing_address: '',
    tax_id_number: '',
    
    // 銀行資訊
    bank_name: '',
    bank_code: '',
    account_number: '',
    account_name: '',
    
    // 緊急聯絡
    emergency_contact_name: '',
    emergency_contact_phone: '',
    
    // 勞務報酬相關
    tax_exemption_amount: 0,
    withholding_tax_rate: 10.00,
    health_insurance_fee: 0,
    labor_insurance_fee: 0
  });
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [laborReceipts, setLaborReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    fetchUserProfile();
    fetchLaborReceipts();
  }, [authUser]);

  async function fetchUserProfile() {
    if (!supabase || !authUser) {
      setLoading(false);
      return;
    }
    
    let userData = null;
    
    if (authUser.id === 'demo-user') {
      // 演示用戶使用模擬資料
      userData = {
        id: 'demo-user',
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'admin'
      };
    } else {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
        
      if (error) {
        console.error('獲取用戶資料失敗:', error);
        setLoading(false);
        return;
      }
      
      userData = data;
    }
    
    setFormData({
      // 基本資訊
      name: userData.name || '',
      email: userData.email || '',
      phone_number: userData.phone_number || '',
      mobile_number: userData.mobile_number || '',
      extension: userData.extension || '',
      job_title: userData.job_title || '',
      department: userData.department || '',
      
      // 身分資訊
      national_id: userData.national_id || '',
      birth_date: userData.birth_date || '',
      registered_address: userData.registered_address || '',
      mailing_address: userData.mailing_address || '',
      tax_id_number: userData.tax_id_number || '',
      
      // 銀行資訊
      bank_name: userData.bank_name || '',
      bank_code: userData.bank_code || '',
      account_number: userData.account_number || '',
      account_name: userData.account_name || '',
      
      // 緊急聯絡
      emergency_contact_name: userData.emergency_contact_name || '',
      emergency_contact_phone: userData.emergency_contact_phone || '',
      
      // 勞務報酬相關
      tax_exemption_amount: userData.tax_exemption_amount || 0,
      withholding_tax_rate: userData.withholding_tax_rate || 10.00,
      health_insurance_fee: userData.health_insurance_fee || 0,
      labor_insurance_fee: userData.labor_insurance_fee || 0
    });
    
    setUser(userData);
    setLoading(false);
  }

  async function fetchLaborReceipts() {
    if (!supabase || !authUser) {
      setLoadingReceipts(false);
      return;
    }

    setLoadingReceipts(true);
    try {
      const { data, error } = await supabase
        .from('labor_receipts')
        .select(`
          *,
          commission:commission_id (
            project:project_id (
              project_code,
              project_name,
              client_name
            )
          )
        `)
        .eq('recipient_id', authUser.id)
        .order('receipt_date', { ascending: false });

      if (error) {
        console.error('獲取勞務報酬單失敗:', error);
      } else {
        setLaborReceipts(data || []);
      }
    } catch (error) {
      console.error('獲取勞務報酬單錯誤:', error);
    } finally {
      setLoadingReceipts(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase || !user) return;

    const { error } = await supabase
      .from('users')
      .update({
        name: formData.name,
        phone_number: formData.phone_number,
        mobile_number: formData.mobile_number,
        extension: formData.extension,
        job_title: formData.job_title,
        department: formData.department,
        national_id: formData.national_id,
        birth_date: formData.birth_date,
        registered_address: formData.registered_address,
        mailing_address: formData.mailing_address,
        tax_id_number: formData.tax_id_number,
        bank_name: formData.bank_name,
        bank_code: formData.bank_code,
        account_number: formData.account_number,
        account_name: formData.account_name,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        tax_exemption_amount: parseFloat(formData.tax_exemption_amount) || 0,
        withholding_tax_rate: parseFloat(formData.withholding_tax_rate) || 10.00,
        health_insurance_fee: parseFloat(formData.health_insurance_fee) || 0,
        labor_insurance_fee: parseFloat(formData.labor_insurance_fee) || 0
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
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
    );
  }

  return (
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '2rem' }}>
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
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
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
                    電話號碼
                  </label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    placeholder="例如：02-1234-5678"
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
                    手機號碼
                  </label>
                  <input
                    type="tel"
                    value={formData.mobile_number}
                    onChange={(e) => setFormData({...formData, mobile_number: e.target.value})}
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

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    職稱
                  </label>
                  <input
                    type="text"
                    value={formData.job_title}
                    onChange={(e) => setFormData({...formData, job_title: e.target.value})}
                    placeholder="例如：業務經理"
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
                    部門
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({...formData, department: e.target.value})}
                    placeholder="例如：業務部"
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

              {/* 身分資訊 */}
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>身分資訊</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    身分證號
                  </label>
                  <input
                    type="text"
                    value={formData.national_id}
                    onChange={(e) => setFormData({...formData, national_id: e.target.value})}
                    placeholder="A123456789"
                    maxLength="10"
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
                    出生日期
                  </label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
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
                    戶籍地址
                  </label>
                  <textarea
                    value={formData.registered_address}
                    onChange={(e) => setFormData({...formData, registered_address: e.target.value})}
                    placeholder="戶籍地址"
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    通訊地址
                  </label>
                  <textarea
                    value={formData.mailing_address}
                    onChange={(e) => setFormData({...formData, mailing_address: e.target.value})}
                    placeholder="通訊地址（如與戶籍地址相同可留空）"
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    稅籍編號
                  </label>
                  <input
                    type="text"
                    value={formData.tax_id_number}
                    onChange={(e) => setFormData({...formData, tax_id_number: e.target.value})}
                    placeholder="統一編號（公司戶）"
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

            {/* 第二行：銀行資訊和緊急聯絡人 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
              {/* 銀行資訊 */}
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>銀行資訊</h3>
                
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
                    value={formData.account_number}
                    onChange={(e) => setFormData({...formData, account_number: e.target.value})}
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
                    戶名
                  </label>
                  <input
                    type="text"
                    value={formData.account_name}
                    onChange={(e) => setFormData({...formData, account_name: e.target.value})}
                    placeholder="銀行帳戶戶名"
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

              {/* 緊急聯絡人 */}
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>緊急聯絡人</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    聯絡人姓名
                  </label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({...formData, emergency_contact_name: e.target.value})}
                    placeholder="緊急聯絡人姓名"
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
                    聯絡人電話
                  </label>
                  <input
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({...formData, emergency_contact_phone: e.target.value})}
                    placeholder="0912-345-678"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <h4 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#2c3e50' }}>勞務報酬相關</h4>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    免稅額 (NT$)
                  </label>
                  <input
                    type="number"
                    value={formData.tax_exemption_amount}
                    onChange={(e) => setFormData({...formData, tax_exemption_amount: e.target.value})}
                    min="0"
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
                    扣繳率 (%)
                  </label>
                  <input
                    type="number"
                    value={formData.withholding_tax_rate}
                    onChange={(e) => setFormData({...formData, withholding_tax_rate: e.target.value})}
                    min="0"
                    max="100"
                    step="0.01"
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
                    健保費 (NT$)
                  </label>
                  <input
                    type="number"
                    value={formData.health_insurance_fee}
                    onChange={(e) => setFormData({...formData, health_insurance_fee: e.target.value})}
                    min="0"
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
                    勞保費 (NT$)
                  </label>
                  <input
                    type="number"
                    value={formData.labor_insurance_fee}
                    onChange={(e) => setFormData({...formData, labor_insurance_fee: e.target.value})}
                    min="0"
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
          <div>
            {/* 第一行：基本資料和身分資訊 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>基本資料</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div><strong>姓名：</strong>{formData.name || '-'}</div>
                  <div><strong>Email：</strong>{formData.email || '-'}</div>
                  <div><strong>電話號碼：</strong>{formData.phone_number || '-'}</div>
                  <div><strong>手機號碼：</strong>{formData.mobile_number || '-'}</div>
                  <div><strong>分機：</strong>{formData.extension || '-'}</div>
                  <div><strong>職稱：</strong>{formData.job_title || '-'}</div>
                  <div><strong>部門：</strong>{formData.department || '-'}</div>
                </div>
              </div>

              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>身分資訊</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div><strong>身分證號：</strong>{formData.national_id || '-'}</div>
                  <div><strong>出生日期：</strong>{formData.birth_date || '-'}</div>
                  <div><strong>戶籍地址：</strong>{formData.registered_address || '-'}</div>
                  <div><strong>通訊地址：</strong>{formData.mailing_address || '-'}</div>
                  <div><strong>稅籍編號：</strong>{formData.tax_id_number || '-'}</div>
                </div>
              </div>
            </div>

            {/* 第二行：銀行資訊和緊急聯絡人 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>銀行資訊</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div><strong>銀行名稱：</strong>{formData.bank_name || '-'}</div>
                  <div><strong>銀行代碼：</strong>{formData.bank_code || '-'}</div>
                  <div><strong>帳號：</strong>{formData.account_number || '-'}</div>
                  <div><strong>戶名：</strong>{formData.account_name || '-'}</div>
                </div>
              </div>

              <div>
                <h3 style={{ marginBottom: '1.5rem', color: '#2c3e50' }}>緊急聯絡人</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div><strong>聯絡人姓名：</strong>{formData.emergency_contact_name || '-'}</div>
                  <div><strong>聯絡人電話：</strong>{formData.emergency_contact_phone || '-'}</div>
                </div>
                
                <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#2c3e50' }}>勞務報酬相關</h4>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div><strong>免稅額：</strong>NT$ {formData.tax_exemption_amount || 0}</div>
                  <div><strong>扣繳率：</strong>{formData.withholding_tax_rate || 10}%</div>
                  <div><strong>健保費：</strong>NT$ {formData.health_insurance_fee || 0}</div>
                  <div><strong>勞保費：</strong>NT$ {formData.labor_insurance_fee || 0}</div>
                </div>
              </div>
            </div>

            {/* 勞務報酬單區域 */}
            <div style={{ marginTop: '3rem', padding: '2rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, color: '#2c3e50' }}>我的勞務報酬單</h3>
                <button
                  onClick={() => downloadLaborReceiptCSV(laborReceipts)}
                  disabled={laborReceipts.length === 0}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: laborReceipts.length > 0 ? '#27ae60' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: laborReceipts.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.9rem'
                  }}
                >
                  📥 匯出全部 CSV
                </button>
              </div>

              {loadingReceipts ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
                  載入勞務報酬單中...
                </div>
              ) : laborReceipts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
                  暫無勞務報酬單
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fff' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>單號</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>日期</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>總額</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>扣繳稅</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>健保費</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>實發金額</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborReceipts.map(receipt => (
                        <tr key={receipt.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 'bold', color: '#2c3e50' }}>
                            {receipt.receipt_number}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            {new Date(receipt.receipt_date).toLocaleDateString('zh-TW')}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ fontWeight: 'bold' }}>
                              {receipt.commission?.project?.project_code || '-'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                              {receipt.commission?.project?.client_name || '-'}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                            NT$ {(receipt.gross_amount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e74c3c' }}>
                            NT$ {(receipt.tax_amount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f39c12' }}>
                            NT$ {(receipt.insurance_amount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>
                            NT$ {(receipt.net_amount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => generateLaborReceiptPDF(receipt)}
                              style={{
                                padding: '0.4rem 0.8rem',
                                backgroundColor: '#3498db',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                              title="列印勞務報酬單"
                            >
                              🖨️ 列印
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}