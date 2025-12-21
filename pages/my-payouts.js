import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

export default function MyPayouts() {
  const router = useRouter();
  const { user, loading: authLoading } = useSimpleAuth();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // pending, completed

  useEffect(() => {
    if (user) {
      fetchMyReceipts();
    }
  }, [user]);

  const fetchMyReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from('labor_receipts')
        .select(`
          *,
          project:project_id(id, project_name, client_name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (receipt) => {
    // 這裡應該生成勞報單 PDF
    try {
      // 更新狀態為已下載
      await supabase
        .from('labor_receipts')
        .update({
          workflow_status: 'downloaded',
          downloaded_at: new Date().toISOString(),
          downloaded_by: user.id
        })
        .eq('id', receipt.id);

      // 生成並下載 PDF
      generateLaborReceiptPDF(receipt);
      fetchMyReceipts();
    } catch (error) {
      console.error('Download error:', error);
      alert('下載失敗');
    }
  };

  const generateLaborReceiptPDF = (receipt) => {
    // 使用 pdfmake 生成勞報單
    import('pdfmake/build/pdfmake').then(pdfMakeModule => {
      import('pdfmake/build/vfs_fonts').then(vfsFontsModule => {
        const pdfMake = pdfMakeModule.default;
        pdfMake.vfs = vfsFontsModule.default.pdfMake?.vfs || vfsFontsModule.pdfMake?.vfs;

        const docDefinition = {
          pageSize: 'A4',
          pageMargins: [40, 60, 40, 60],
          content: [
            { text: '勞務報酬單', style: 'header', alignment: 'center' },
            { text: '\n' },
            {
              table: {
                widths: ['30%', '70%'],
                body: [
                  ['所得人姓名', receipt.recipient_name || user?.name || ''],
                  ['身分證字號', receipt.national_id || ''],
                  ['通訊地址', receipt.address || ''],
                  ['專案名稱', receipt.project?.project_name || ''],
                  ['客戶名稱', receipt.project?.client_name || ''],
                  ['給付總額', `NT$ ${(receipt.gross_amount || 0).toLocaleString()}`],
                  ['代扣所得稅 (10%)', `NT$ ${(receipt.tax_withheld || 0).toLocaleString()}`],
                  ['代扣健保費 (2.11%)', `NT$ ${(receipt.health_insurance || 0).toLocaleString()}`],
                  ['實付金額', `NT$ ${(receipt.net_amount || 0).toLocaleString()}`],
                  ['給付日期', receipt.payment_date || ''],
                ]
              }
            },
            { text: '\n\n' },
            { text: '所得人簽章：_______________________', alignment: 'left' },
            { text: '\n' },
            { text: '簽章日期：_______________________', alignment: 'left' },
            { text: '\n\n' },
            { text: '公司用印：_______________________', alignment: 'right' },
          ],
          styles: {
            header: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] }
          }
        };

        pdfMake.createPdf(docDefinition).download(`勞報單_${receipt.id}.pdf`);
      });
    });
  };

  const handleUploadSigned = async (receiptId, file) => {
    if (!file) return;
    setUploading(receiptId);

    try {
      // 上傳到 Supabase Storage
      const fileName = `signed_receipts/${receiptId}_${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 取得公開 URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // 更新勞報單狀態
      const { error: updateError } = await supabase
        .from('labor_receipts')
        .update({
          workflow_status: 'signed',
          signed_document_url: urlData.publicUrl,
          signed_at: new Date().toISOString()
        })
        .eq('id', receiptId);

      if (updateError) throw updateError;

      alert('上傳成功！等待會計審核');
      fetchMyReceipts();
    } catch (error) {
      console.error('Upload error:', error);
      alert('上傳失敗：' + error.message);
    } finally {
      setUploading(null);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3cd', color: '#856404', text: '待產生' },
      pending_signature: { bg: '#cce5ff', color: '#004085', text: '待簽收' },
      downloaded: { bg: '#d4edda', color: '#155724', text: '已下載' },
      signed: { bg: '#e2e3e5', color: '#383d41', text: '待審核' },
      approved: { bg: '#d4edda', color: '#155724', text: '已通過' },
      rejected: { bg: '#f8d7da', color: '#721c24', text: '已駁回' }
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '500',
        backgroundColor: s.bg,
        color: s.color
      }}>
        {s.text}
      </span>
    );
  };

  const pendingReceipts = receipts.filter(r =>
    ['pending_signature', 'downloaded'].includes(r.workflow_status)
  );
  const completedReceipts = receipts.filter(r =>
    ['signed', 'approved', 'rejected'].includes(r.workflow_status)
  );

  if (authLoading || loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        載入中...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '100%' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0, color: '#1a202c' }}>
          我的勞報單
        </h1>
        <p style={{ color: '#718096', marginTop: '8px', fontSize: '14px' }}>
          查看並簽收您的勞務報酬單
        </p>
      </div>

      {/* 待處理提示卡片 */}
      {pendingReceipts.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>📋</span>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>
                您有 {pendingReceipts.length} 份勞報單待簽收
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                請下載、簽名後上傳
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 切換 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        borderBottom: '2px solid #e2e8f0'
      }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: activeTab === 'pending' ? '600' : '400',
            color: activeTab === 'pending' ? '#4299e1' : '#718096',
            borderBottom: activeTab === 'pending' ? '2px solid #4299e1' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          待處理 ({pendingReceipts.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: activeTab === 'completed' ? '600' : '400',
            color: activeTab === 'completed' ? '#4299e1' : '#718096',
            borderBottom: activeTab === 'completed' ? '2px solid #4299e1' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer'
          }}
        >
          已完成 ({completedReceipts.length})
        </button>
      </div>

      {/* 勞報單列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {(activeTab === 'pending' ? pendingReceipts : completedReceipts).length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            backgroundColor: '#f7fafc',
            borderRadius: '12px',
            color: '#718096'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {activeTab === 'pending' ? '✅' : '📁'}
            </div>
            <div style={{ fontSize: '16px' }}>
              {activeTab === 'pending' ? '沒有待處理的勞報單' : '沒有已完成的勞報單'}
            </div>
          </div>
        ) : (
          (activeTab === 'pending' ? pendingReceipts : completedReceipts).map(receipt => (
            <div
              key={receipt.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden'
              }}
            >
              {/* 卡片頭部 */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', color: '#1a202c' }}>
                    {receipt.project?.project_name || '未知專案'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
                    {receipt.project?.client_name || ''}
                  </div>
                </div>
                {getStatusBadge(receipt.workflow_status)}
              </div>

              {/* 卡片內容 */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '16px',
                  marginBottom: '16px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>給付總額</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#1a202c' }}>
                      NT$ {(receipt.gross_amount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>實付金額</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#38a169' }}>
                      NT$ {(receipt.net_amount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#718096' }}>建立日期</div>
                    <div style={{ fontSize: '14px', color: '#1a202c' }}>
                      {receipt.created_at ? new Date(receipt.created_at).toLocaleDateString() : '-'}
                    </div>
                  </div>
                </div>

                {/* 駁回原因 */}
                {receipt.workflow_status === 'rejected' && receipt.rejection_reason && (
                  <div style={{
                    backgroundColor: '#fed7d7',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: '#c53030'
                  }}>
                    <strong>駁回原因：</strong>{receipt.rejection_reason}
                  </div>
                )}

                {/* 操作按鈕 */}
                {['pending_signature', 'downloaded'].includes(receipt.workflow_status) && (
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => handleDownload(receipt)}
                      style={{
                        flex: '1',
                        minWidth: '120px',
                        padding: '12px 20px',
                        backgroundColor: '#4299e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>⬇️</span> 下載勞報單
                    </button>
                    <label style={{
                      flex: '1',
                      minWidth: '120px',
                      padding: '12px 20px',
                      backgroundColor: uploading === receipt.id ? '#a0aec0' : '#48bb78',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: uploading === receipt.id ? 'wait' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      textAlign: 'center'
                    }}>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleUploadSigned(receipt.id, e.target.files[0])}
                        style={{ display: 'none' }}
                        disabled={uploading === receipt.id}
                      />
                      <span>⬆️</span>
                      {uploading === receipt.id ? '上傳中...' : '上傳已簽名文件'}
                    </label>
                  </div>
                )}

                {/* 已簽名文件連結 */}
                {receipt.signed_document_url && (
                  <div style={{ marginTop: '12px' }}>
                    <a
                      href={receipt.signed_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#4299e1',
                        fontSize: '14px',
                        textDecoration: 'none'
                      }}
                    >
                      📎 查看已上傳的簽名文件
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
