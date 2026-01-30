import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth, TAB_LABELS } from '../../contexts/AuthContext';
import {
  Users,
  UserPlus,
  Shield,
  Eye,
  Trash2,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const UserManagement = ({ clients = [] }) => {
  const { ALL_TABS, DEFAULT_VIEWER_TABS, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  // Invite user state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviting, setInviting] = useState(false);

  // Fetch all users and their permissions
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch tab permissions for all users
      const { data: tabPerms } = await supabase
        .from('user_tab_permissions')
        .select('*');

      // Fetch client permissions for all users
      const { data: clientPerms } = await supabase
        .from('user_client_access')
        .select('*');

      // Combine data
      const usersWithPerms = profiles.map(profile => ({
        ...profile,
        tabPermissions: (tabPerms || [])
          .filter(t => t.user_id === profile.user_id && t.has_access)
          .map(t => t.tab_id),
        clientPermissions: (clientPerms || [])
          .filter(c => c.user_id === profile.user_id && c.has_access)
          .map(c => c.client_id)
      }));

      setUsers(usersWithPerms);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  // Update user role
  const updateUserRole = async (userId, newRole) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      // If changing to viewer, set default tab permissions
      if (newRole === 'viewer') {
        // Remove all tab permissions
        await supabase
          .from('user_tab_permissions')
          .delete()
          .eq('user_id', userId);

        // Add default viewer tabs
        const tabInserts = DEFAULT_VIEWER_TABS.map(tab => ({
          user_id: userId,
          tab_id: tab,
          has_access: true
        }));

        await supabase.from('user_tab_permissions').insert(tabInserts);
      }

      await fetchUsers();
    } catch (err) {
      console.error('Error updating role:', err);
      setError('Failed to update user role');
    } finally {
      setSaving(false);
    }
  };

  // Toggle tab permission
  const toggleTabPermission = async (userId, tabId, currentHasAccess) => {
    try {
      setSaving(true);

      if (currentHasAccess) {
        // Remove permission
        await supabase
          .from('user_tab_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('tab_id', tabId);
      } else {
        // Add permission
        await supabase
          .from('user_tab_permissions')
          .upsert({
            user_id: userId,
            tab_id: tabId,
            has_access: true
          });
      }

      await fetchUsers();
    } catch (err) {
      console.error('Error updating tab permission:', err);
      setError('Failed to update permission');
    } finally {
      setSaving(false);
    }
  };

  // Toggle client permission
  const toggleClientPermission = async (userId, clientId, currentHasAccess) => {
    try {
      setSaving(true);

      if (currentHasAccess) {
        await supabase
          .from('user_client_access')
          .delete()
          .eq('user_id', userId)
          .eq('client_id', clientId);
      } else {
        await supabase
          .from('user_client_access')
          .upsert({
            user_id: userId,
            client_id: clientId,
            has_access: true
          });
      }

      await fetchUsers();
    } catch (err) {
      console.error('Error updating client permission:', err);
      setError('Failed to update permission');
    } finally {
      setSaving(false);
    }
  };

  // Delete user
  const deleteUser = async (userId, email) => {
    if (!confirm(`Are you sure you want to remove ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      setSaving(true);

      // Delete permissions first
      await supabase.from('user_tab_permissions').delete().eq('user_id', userId);
      await supabase.from('user_client_access').delete().eq('user_id', userId);

      // Delete profile
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      await fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  // Invite new user
  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setError(null);

    try {
      // Create user via Supabase Auth admin API
      // Note: This requires the service_role key or a server-side function
      // For now, we'll create a pending invite in the database
      const { data, error } = await supabase
        .from('user_invites')
        .insert([{
          email: inviteEmail,
          role: inviteRole,
          invited_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      setInviteEmail('');
      setInviteRole('viewer');
      setShowInvite(false);
      alert(`Invitation created for ${inviteEmail}. They can sign up and will be assigned the ${inviteRole} role.`);
    } catch (err) {
      console.error('Error inviting user:', err);
      setError('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9E9E9E' }}>
        You don't have permission to access this page.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Users size={24} color="#2962FF" />
          <h2 style={{ color: '#E0E0E0', fontSize: '20px', fontWeight: '600', margin: 0 }}>
            User Management
          </h2>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: '#2962FF',
            border: 'none',
            borderRadius: '8px',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <UserPlus size={16} />
          Invite User
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'rgba(207, 102, 121, 0.15)',
          border: '1px solid rgba(207, 102, 121, 0.3)',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <AlertCircle size={18} color="#CF6679" />
          <span style={{ color: '#CF6679', fontSize: '14px' }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#CF6679', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div style={{
          background: '#1E1E1E',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <h3 style={{ color: '#E0E0E0', fontSize: '16px', marginBottom: '16px' }}>
            Invite New User
          </h3>
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{
                flex: '1 1 250px',
                padding: '10px 14px',
                background: '#121212',
                border: '1px solid #333',
                borderRadius: '8px',
                color: '#E0E0E0',
                fontSize: '14px'
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{
                padding: '10px 14px',
                background: '#121212',
                border: '1px solid #333',
                borderRadius: '8px',
                color: '#E0E0E0',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              style={{
                padding: '10px 20px',
                background: inviting ? '#1a4bb8' : '#2962FF',
                border: 'none',
                borderRadius: '8px',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: '600',
                cursor: inviting ? 'not-allowed' : 'pointer'
              }}
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: '8px',
                color: '#9E9E9E',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Users List */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9E9E9E' }}>
          Loading users...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {users.map(user => (
            <div
              key={user.user_id}
              style={{
                background: '#1E1E1E',
                border: '1px solid #333',
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            >
              {/* User Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  gap: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => setExpandedUser(expandedUser === user.user_id ? null : user.user_id)}
              >
                {/* Avatar */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: user.role === 'admin' ? 'rgba(41, 98, 255, 0.2)' : 'rgba(158, 158, 158, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {user.role === 'admin' ? (
                    <Shield size={20} color="#2962FF" />
                  ) : (
                    <Eye size={20} color="#9E9E9E" />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#E0E0E0', fontSize: '14px', fontWeight: '500' }}>
                    {user.email}
                  </div>
                  <div style={{ color: '#9E9E9E', fontSize: '12px', marginTop: '2px' }}>
                    {user.role === 'admin' ? 'Administrator' : 'Viewer'} • Joined {new Date(user.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Role Badge */}
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  background: user.role === 'admin' ? 'rgba(41, 98, 255, 0.15)' : 'rgba(158, 158, 158, 0.15)',
                  color: user.role === 'admin' ? '#60a5fa' : '#9E9E9E'
                }}>
                  {user.role}
                </span>

                {/* Expand Icon */}
                {expandedUser === user.user_id ? (
                  <ChevronUp size={20} color="#9E9E9E" />
                ) : (
                  <ChevronDown size={20} color="#9E9E9E" />
                )}
              </div>

              {/* Expanded Permissions */}
              {expandedUser === user.user_id && (
                <div style={{
                  borderTop: '1px solid #333',
                  padding: '20px',
                  background: '#171717'
                }}>
                  {/* Role Selector */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#9E9E9E', fontSize: '12px', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                      ROLE
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => updateUserRole(user.user_id, 'admin')}
                        disabled={saving}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: user.role === 'admin' ? '#2962FF' : '#333',
                          color: user.role === 'admin' ? '#FFFFFF' : '#9E9E9E',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        Admin
                      </button>
                      <button
                        onClick={() => updateUserRole(user.user_id, 'viewer')}
                        disabled={saving}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: user.role === 'viewer' ? '#2962FF' : '#333',
                          color: user.role === 'viewer' ? '#FFFFFF' : '#9E9E9E',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        Viewer
                      </button>
                    </div>
                  </div>

                  {/* Tab Permissions (only for viewers) */}
                  {user.role === 'viewer' && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ color: '#9E9E9E', fontSize: '12px', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                        TAB ACCESS
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {ALL_TABS.map(tab => {
                          const hasAccess = user.tabPermissions.includes(tab);
                          return (
                            <button
                              key={tab}
                              onClick={() => toggleTabPermission(user.user_id, tab, hasAccess)}
                              disabled={saving}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: hasAccess ? '1px solid #2962FF' : '1px solid #444',
                                background: hasAccess ? 'rgba(41, 98, 255, 0.15)' : 'transparent',
                                color: hasAccess ? '#60a5fa' : '#9E9E9E',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              {hasAccess && <Check size={12} />}
                              {TAB_LABELS[tab] || tab}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Client Permissions (only for viewers) */}
                  {user.role === 'viewer' && clients.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ color: '#9E9E9E', fontSize: '12px', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                        CLIENT ACCESS {user.clientPermissions.length === 0 && <span style={{ fontWeight: '400' }}>(All clients if none selected)</span>}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {clients.map(client => {
                          const hasAccess = user.clientPermissions.includes(client.id);
                          return (
                            <button
                              key={client.id}
                              onClick={() => toggleClientPermission(user.user_id, client.id, hasAccess)}
                              disabled={saving}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: hasAccess ? '1px solid #00C853' : '1px solid #444',
                                background: hasAccess ? 'rgba(0, 200, 83, 0.15)' : 'transparent',
                                color: hasAccess ? '#00C853' : '#9E9E9E',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              {hasAccess && <Check size={12} />}
                              {client.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Delete User */}
                  <div style={{ borderTop: '1px solid #333', paddingTop: '16px', marginTop: '16px' }}>
                    <button
                      onClick={() => deleteUser(user.user_id, user.email)}
                      disabled={saving}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid rgba(207, 102, 121, 0.3)',
                        background: 'transparent',
                        color: '#CF6679',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                      Remove User
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {users.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9E9E9E' }}>
              No users found. Invite someone to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserManagement;
