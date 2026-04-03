import { useState, useEffect, useCallback } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';
import { supabase } from '../utils/supabaseClient';
import { hasPermission, PERMISSIONS } from '../utils/permissions';

const IDENTITY_TYPES = {
  employee: { label: '員工', color: '#2563eb', bg: '#dbeafe' },
  client: { label: '客戶', color: '#059669', bg: '#d1fae5' },
  vip: { label: 'VIP', color: '#d97706', bg: '#fef3c7' },
  vendor: { label: '供應商', color: '#7c3aed', bg: '#ede9fe' },
  po: { label: 'PO', color: '#0d9488', bg: '#ccfbf1' },
  unknown: { label: '未知', color: '#6b7280', bg: '#f3f4f6' }
};

const GROUP_ROLES = {
  member: '成員',
  admin: '管理員',
  owner: '群主',
  pm: 'PM',
  client_contact: '客戶窗口',
  observer: '觀察者'
};

export default function ContactManagement() {
  const { user, loading: authLoading } = useSimpleAuth();

  // Tabs
  const [activeTab, setActiveTab] = useState('all');

  // Contacts data
  const [contacts, setContacts] = useState([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Users for employee binding
  const [users, setUsers] = useState([]);

  // LINE groups for group tab
  const [lineGroups, setLineGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    display_name: '',
    real_name: '',
    identity_type: 'unknown',
    company: '',
    email: '',
    phone: '',
    tags: '',
    notes: '',
    internal_user_id: '',
    is_manually_verified: false,
    line_user_id: ''
  });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Permission check
  const canManage = user ? hasPermission(user.role, PERMISSIONS.MANAGE_USERS) : false;

  // Responsive
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('contact_identities')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

      // Tab-based filters
      if (activeTab === 'unverified') {
        query = query.eq('is_manually_verified', false);
      }

      // Type filter
      if (filterType && filterType !== 'all') {
        query = query.eq('identity_type', filterType);
      }

      // Search filter
      if (searchText.trim()) {
        query = query.or(
          `display_name.ilike.%${searchText.trim()}%,real_name.ilike.%${searchText.trim()}%,email.ilike.%${searchText.trim()}%,company.ilike.%${searchText.trim()}%`
        );
      }

      const { data, error, count } = await query.range(0, 199);

      if (error) throw error;
      setContacts(data || []);
      setContactsCount(count || 0);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterType, searchText]);

  // Fetch users for binding
  const fetchUsers = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('name');
      if (!error) setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, []);

  // Fetch LINE groups
  const fetchLineGroups = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('line_groups')
        .select('group_id, group_name, group_type')
        .order('group_name');
      if (!error) setLineGroups(data || []);
    } catch (err) {
      console.error('Error fetching line groups:', err);
    }
  }, []);

  // Fetch group participants
  const fetchGroupParticipants = useCallback(async (groupId) => {
    if (!supabase || !groupId) {
      setGroupParticipants([]);
      return;
    }
    setGroupLoading(true);
    try {
      const { data, error } = await supabase
        .from('group_participants')
        .select(`
          *,
          identity:contact_identities!group_participants_identity_id_fkey(
            id, display_name, real_name, identity_type, company, email, phone,
            line_user_id, internal_user_id, is_manually_verified, tags
          )
        `)
        .eq('line_group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback without join
        const { data: fallbackData } = await supabase
          .from('group_participants')
          .select('*')
          .eq('line_group_id', groupId)
          .order('created_at', { ascending: false });
        setGroupParticipants(fallbackData || []);
      } else {
        setGroupParticipants(data || []);
      }
    } catch (err) {
      console.error('Error fetching group participants:', err);
    } finally {
      setGroupLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && canManage) {
      fetchContacts();
      fetchUsers();
      fetchLineGroups();
    }
  }, [authLoading, user, canManage, fetchContacts, fetchUsers, fetchLineGroups]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchGroupParticipants(selectedGroupId);
    }
  }, [selectedGroupId, fetchGroupParticipants]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authLoading && user && canManage) {
        fetchContacts();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open modal for add/edit
  const openAddModal = () => {
    setEditingContact(null);
    setFormData({
      display_name: '',
      real_name: '',
      identity_type: 'unknown',
      company: '',
      email: '',
      phone: '',
      tags: '',
      notes: '',
      internal_user_id: '',
      is_manually_verified: false,
      line_user_id: ''
    });
    setShowModal(true);
  };

  const openEditModal = (contact) => {
    setEditingContact(contact);
    setFormData({
      display_name: contact.display_name || '',
      real_name: contact.real_name || '',
      identity_type: contact.identity_type || 'unknown',
      company: contact.company || '',
      email: contact.email || '',
      phone: contact.phone || '',
      tags: (contact.tags || []).join(', '),
      notes: contact.notes || '',
      internal_user_id: contact.internal_user_id || '',
      is_manually_verified: contact.is_manually_verified || false,
      line_user_id: contact.line_user_id || ''
    });
    setShowModal(true);
  };

  // Save contact
  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      const payload = {
        display_name: formData.display_name || null,
        real_name: formData.real_name || null,
        identity_type: formData.identity_type,
        company: formData.company || null,
        email: formData.email || null,
        phone: formData.phone || null,
        internal_user_id: formData.internal_user_id || null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        notes: formData.notes || null,
        is_manually_verified: formData.is_manually_verified,
        line_user_id: formData.line_user_id || null
      };

      if (editingContact) {
        // Update
        const { error } = await supabase
          .from('contact_identities')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingContact.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('contact_identities')
          .insert({ ...payload, updated_at: new Date().toISOString() });
        if (error) throw error;
      }

      setShowModal(false);
      fetchContacts();
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('儲存失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setSaving(false);
    }
  };

  // Delete contact
  const handleDelete = async (contactId) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('contact_identities')
        .delete()
        .eq('id', contactId);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchContacts();
    } catch (err) {
      console.error('Error deleting contact:', err);
      alert('刪除失敗: ' + (err.message || '未知錯誤'));
    }
  };

  // Quick verify
  const handleQuickVerify = async (contact) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('contact_identities')
        .update({
          is_manually_verified: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id);
      if (error) throw error;
      fetchContacts();
    } catch (err) {
      console.error('Error verifying contact:', err);
    }
  };

  // Quick set identity type
  const handleQuickSetType = async (contactId, newType) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('contact_identities')
        .update({
          identity_type: newType,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);
      if (error) throw error;
      fetchContacts();
    } catch (err) {
      console.error('Error updating type:', err);
    }
  };

  // Quick bind internal user
  const handleQuickBind = async (contactId, userId) => {
    if (!supabase || !userId) return;
    try {
      const selectedUser = users.find(u => u.id === userId);
      const updateData = {
        internal_user_id: userId,
        updated_at: new Date().toISOString()
      };
      if (selectedUser) {
        updateData.identity_type = 'employee';
      }

      const { error } = await supabase
        .from('contact_identities')
        .update(updateData)
        .eq('id', contactId);
      if (error) throw error;
      fetchContacts();
    } catch (err) {
      console.error('Error binding user:', err);
    }
  };

  // Auth / permission guards
  if (authLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>載入中...</div>;
  }
  if (!user) return null;
  if (!canManage) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        您沒有權限存取此頁面
      </div>
    );
  }

  // Identity type badge
  const TypeBadge = ({ type }) => {
    const info = IDENTITY_TYPES[type] || IDENTITY_TYPES.unknown;
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: info.color,
        background: info.bg
      }}>
        {info.label}
      </span>
    );
  };

  // Tab button
  const TabButton = ({ id, label, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '10px 20px',
        border: 'none',
        borderBottom: activeTab === id ? '3px solid #2563eb' : '3px solid transparent',
        background: 'none',
        color: activeTab === id ? '#2563eb' : '#64748b',
        fontWeight: activeTab === id ? 700 : 500,
        fontSize: 14,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          marginLeft: 6,
          padding: '1px 7px',
          borderRadius: 10,
          fontSize: 11,
          background: activeTab === id ? '#dbeafe' : '#f1f5f9',
          color: activeTab === id ? '#2563eb' : '#94a3b8'
        }}>
          {count}
        </span>
      )}
    </button>
  );

  // --- Render tabs content ---

  const renderAllContactsTab = () => (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="搜尋姓名、Email、公司..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none'
          }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            background: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="all">所有類型</option>
          {Object.entries(IDENTITY_TYPES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <button
          onClick={openAddModal}
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          + 新增聯絡人
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>載入中...</div>
      ) : contacts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          {searchText || filterType !== 'all' ? '沒有符合條件的聯絡人' : '尚無聯絡人資料'}
        </div>
      ) : isMobile ? (
        // Mobile card view
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map(contact => (
            <div key={contact.id} style={{
              background: 'white',
              borderRadius: 10,
              padding: 16,
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
                    {contact.display_name || contact.real_name || '-'}
                  </div>
                  {contact.real_name && contact.display_name && (
                    <div style={{ fontSize: 13, color: '#64748b' }}>{contact.real_name}</div>
                  )}
                </div>
                <TypeBadge type={contact.identity_type} />
              </div>
              {contact.company && (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                  公司: {contact.company}
                </div>
              )}
              {contact.email && (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                  {contact.email}
                </div>
              )}
              {contact.phone && (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                  {contact.phone}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {contact.line_user_id && (
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 6,
                    background: '#dcfce7', color: '#16a34a'
                  }}>LINE 已綁定</span>
                )}
                {contact.is_manually_verified && (
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 6,
                    background: '#dbeafe', color: '#2563eb'
                  }}>已驗證</span>
                )}
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => openEditModal(contact)}
                  style={{
                    padding: '4px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    background: 'white',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: '#374151'
                  }}
                >
                  編輯
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Desktop table view
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>顯示名稱</th>
                <th style={thStyle}>真實姓名</th>
                <th style={thStyle}>身份類型</th>
                <th style={thStyle}>公司</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>電話</th>
                <th style={thStyle}>LINE 綁定</th>
                <th style={thStyle}>已驗證</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(contact => (
                <tr key={contact.id} style={{ transition: 'background 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>
                      {contact.display_name || '-'}
                    </span>
                  </td>
                  <td style={tdStyle}>{contact.real_name || '-'}</td>
                  <td style={tdStyle}><TypeBadge type={contact.identity_type} /></td>
                  <td style={tdStyle}>{contact.company || '-'}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{contact.email || '-'}</span>
                  </td>
                  <td style={tdStyle}>{contact.phone || '-'}</td>
                  <td style={tdStyle}>
                    {contact.line_user_id ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        fontSize: 12, background: '#dcfce7', color: '#16a34a', fontWeight: 500
                      }}>已綁定</span>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 13 }}>-</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {contact.is_manually_verified ? (
                      <span style={{ color: '#2563eb', fontSize: 16 }}>&#10003;</span>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 16 }}>&#10007;</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => openEditModal(contact)}
                        style={actionBtnStyle}
                      >
                        編輯
                      </button>
                      {user.role === 'admin' && (
                        <button
                          onClick={() => setDeleteConfirm(contact)}
                          style={{ ...actionBtnStyle, color: '#ef4444', borderColor: '#fecaca' }}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Count */}
      <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8', textAlign: 'right' }}>
        共 {contactsCount} 筆聯絡人
      </div>
    </>
  );

  const renderUnverifiedTab = () => (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          以下聯絡人尚未經過人工驗證，請確認身份後進行標記。
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>載入中...</div>
      ) : contacts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          所有聯絡人皆已驗證
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map(contact => (
            <div key={contact.id} style={{
              background: 'white',
              borderRadius: 10,
              padding: 16,
              border: '1px solid #fde68a',
              borderLeft: '4px solid #f59e0b'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 12
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>
                    {contact.display_name || contact.real_name || '(未命名)'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TypeBadge type={contact.identity_type} />
                    {contact.line_user_id && (
                      <span style={{ fontSize: 12, color: '#16a34a' }}>LINE 已綁定</span>
                    )}
                    {contact.email && (
                      <span style={{ fontSize: 13, color: '#64748b' }}>{contact.email}</span>
                    )}
                    {contact.company && (
                      <span style={{ fontSize: 13, color: '#64748b' }}>{contact.company}</span>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  {/* Quick set type */}
                  <select
                    defaultValue={contact.identity_type}
                    onChange={(e) => handleQuickSetType(contact.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 13,
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    {Object.entries(IDENTITY_TYPES).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>

                  {/* Quick bind user */}
                  <select
                    defaultValue=""
                    onChange={(e) => handleQuickBind(contact.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 13,
                      background: 'white',
                      cursor: 'pointer',
                      maxWidth: 150
                    }}
                  >
                    <option value="">綁定員工...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleQuickVerify(contact)}
                    style={{
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    驗證
                  </button>

                  <button
                    onClick={() => openEditModal(contact)}
                    style={actionBtnStyle}
                  >
                    編輯
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderGroupMembersTab = () => (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 14, color: '#374151', fontWeight: 500, marginRight: 8 }}>
          選擇群組:
        </label>
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            background: 'white',
            cursor: 'pointer',
            minWidth: 250,
            maxWidth: '100%'
          }}
        >
          <option value="">請選擇 LINE 群組...</option>
          {lineGroups.map(g => (
            <option key={g.group_id} value={g.group_id}>
              {g.group_name || g.group_id}
              {g.group_type ? ` (${g.group_type})` : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedGroupId ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          請選擇一個 LINE 群組以查看成員
        </div>
      ) : groupLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>載入中...</div>
      ) : groupParticipants.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          此群組尚無已記錄的成員
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupParticipants.map(p => {
            const identity = p.identity || {};
            return (
              <div key={p.id} style={{
                background: 'white',
                borderRadius: 10,
                padding: 16,
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
                      {identity.display_name || identity.real_name || '(未知)'}
                    </div>
                    {identity.real_name && identity.display_name && (
                      <div style={{ fontSize: 13, color: '#64748b' }}>{identity.real_name}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 6, fontSize: 11,
                      background: '#f1f5f9', color: '#475569'
                    }}>
                      {GROUP_ROLES[p.role_in_group] || p.role_in_group}
                    </span>
                    {identity.identity_type && <TypeBadge type={identity.identity_type} />}
                  </div>
                </div>
                {identity.company && (
                  <div style={{ fontSize: 13, color: '#64748b' }}>公司: {identity.company}</div>
                )}
                {identity.email && (
                  <div style={{ fontSize: 13, color: '#64748b' }}>{identity.email}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {identity.id && (
                    <button
                      onClick={() => openEditModal(identity)}
                      style={actionBtnStyle}
                    >
                      編輯身份
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>顯示名稱</th>
                <th style={thStyle}>真實姓名</th>
                <th style={thStyle}>群組角色</th>
                <th style={thStyle}>身份類型</th>
                <th style={thStyle}>公司</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>LINE 綁定</th>
                <th style={thStyle}>已驗證</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {groupParticipants.map(p => {
                const identity = p.identity || {};
                return (
                  <tr key={p.id}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>
                        {identity.display_name || '-'}
                      </span>
                    </td>
                    <td style={tdStyle}>{identity.real_name || '-'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 12,
                        background: '#f1f5f9', color: '#475569'
                      }}>
                        {GROUP_ROLES[p.role_in_group] || p.role_in_group}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {identity.identity_type ? <TypeBadge type={identity.identity_type} /> : '-'}
                    </td>
                    <td style={tdStyle}>{identity.company || '-'}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, color: '#475569' }}>{identity.email || '-'}</span>
                    </td>
                    <td style={tdStyle}>
                      {identity.line_user_id ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 12,
                          background: '#dcfce7', color: '#16a34a', fontWeight: 500
                        }}>已綁定</span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 13 }}>-</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {(identity.is_manually_verified || p.manually_verified) ? (
                        <span style={{ color: '#2563eb', fontSize: 16 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 16 }}>&#10007;</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {identity.id ? (
                        <button
                          onClick={() => openEditModal(identity)}
                          style={actionBtnStyle}
                        >
                          編輯
                        </button>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 12 }}>無身份資料</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {groupParticipants.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8', textAlign: 'right' }}>
          共 {groupParticipants.length} 位成員
        </div>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
          聯絡人身份管理
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
          管理 LINE 群組成員身份、綁定內部員工帳號
        </p>
      </div>

      {/* Card container */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          overflowX: 'auto'
        }}>
          <TabButton id="all" label="所有聯絡人" count={activeTab === 'all' ? contactsCount : undefined} />
          <TabButton id="unverified" label="待確認" />
          <TabButton id="groups" label="群組成員" />
        </div>

        {/* Tab content */}
        <div style={{ padding: isMobile ? 16 : 24 }}>
          {activeTab === 'all' && renderAllContactsTab()}
          {activeTab === 'unverified' && renderUnverifiedTab()}
          {activeTab === 'groups' && renderGroupMembersTab()}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            width: '100%',
            maxWidth: 560,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Modal header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                {editingContact ? '編輯聯絡人' : '新增聯絡人'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none', border: 'none', fontSize: 22, color: '#94a3b8',
                  cursor: 'pointer', padding: '0 4px', lineHeight: 1
                }}
              >
                &#x2715;
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Row: display_name + real_name */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>顯示名稱</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData(f => ({ ...f, display_name: e.target.value }))}
                    placeholder="LINE 顯示名稱"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>真實姓名</label>
                  <input
                    type="text"
                    value={formData.real_name}
                    onChange={(e) => setFormData(f => ({ ...f, real_name: e.target.value }))}
                    placeholder="真實姓名"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Identity type */}
              <div>
                <label style={labelStyle}>身份類型</label>
                <select
                  value={formData.identity_type}
                  onChange={(e) => setFormData(f => ({ ...f, identity_type: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {Object.entries(IDENTITY_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>

              {/* Employee binding */}
              {formData.identity_type === 'employee' && (
                <div>
                  <label style={labelStyle}>綁定系統用戶</label>
                  <select
                    value={formData.internal_user_id}
                    onChange={(e) => setFormData(f => ({ ...f, internal_user_id: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">不綁定</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) - {u.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Company */}
              <div>
                <label style={labelStyle}>公司</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData(f => ({ ...f, company: e.target.value }))}
                  placeholder="公司名稱"
                  style={inputStyle}
                />
              </div>

              {/* Row: email + phone */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>電話</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0912-345-678"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* LINE User ID (read-only or editable) */}
              <div>
                <label style={labelStyle}>LINE User ID</label>
                <input
                  type="text"
                  value={formData.line_user_id}
                  onChange={(e) => setFormData(f => ({ ...f, line_user_id: e.target.value }))}
                  placeholder="LINE User ID (通常由系統自動填入)"
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>

              {/* Tags */}
              <div>
                <label style={labelStyle}>標籤 (逗號分隔)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(f => ({ ...f, tags: e.target.value }))}
                  placeholder="例如: 決策者, IT主管, 高優先"
                  style={inputStyle}
                />
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>備註</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="備註資訊..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Verified toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: 44,
                  height: 24,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.is_manually_verified}
                    onChange={(e) => setFormData(f => ({ ...f, is_manually_verified: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    inset: 0,
                    background: formData.is_manually_verified ? '#2563eb' : '#cbd5e1',
                    borderRadius: 12,
                    transition: 'background 0.2s'
                  }}>
                    <span style={{
                      position: 'absolute',
                      top: 2,
                      left: formData.is_manually_verified ? 22 : 2,
                      width: 20,
                      height: 20,
                      background: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </span>
                </label>
                <span style={{ fontSize: 14, color: '#374151' }}>已人工驗證</span>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10
            }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#374151'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: 8,
                  background: saving ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                {saving ? '儲存中...' : (editingContact ? '更新' : '新增')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: 16
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#1e293b' }}>確認刪除</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>
              確定要刪除聯絡人「{deleteConfirm.display_name || deleteConfirm.real_name || deleteConfirm.id}」嗎？
              此操作將同時移除該聯絡人在所有群組中的成員記錄，且無法復原。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#374151'
                }}
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Shared styles ---

const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  borderBottom: '2px solid #e2e8f0',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap'
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
  color: '#334155'
};

const actionBtnStyle = {
  padding: '4px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: 'white',
  fontSize: 13,
  cursor: 'pointer',
  color: '#374151',
  whiteSpace: 'nowrap'
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box'
};
