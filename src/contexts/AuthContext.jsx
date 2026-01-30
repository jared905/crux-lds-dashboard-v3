import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext({});

// Default tab permissions by role
const DEFAULT_VIEWER_TABS = ['dashboard', 'actions'];
const ALL_TABS = [
  'dashboard',
  'series-analysis',
  'channel-summary',
  'competitors',
  'comments',
  'ideation',
  'intelligence',
  'atomizer',
  'briefs',
  'actions',
  'calendar',
  'clients',
  'api-keys',
  'user-management',
];

// Human-readable labels for tab IDs
export const TAB_LABELS = {
  'dashboard': 'Dashboard',
  'series-analysis': 'Series Analysis',
  'channel-summary': 'Channel Summary',
  'competitors': 'Competitors',
  'comments': 'Comments',
  'ideation': 'Ideation',
  'intelligence': 'Intelligence',
  'atomizer': 'Atomizer',
  'briefs': 'Briefs',
  'actions': 'Actions',
  'calendar': 'Calendar',
  'clients': 'Clients',
  'api-keys': 'API Keys',
  'user-management': 'User Management',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabPermissions, setTabPermissions] = useState([]);
  const [clientPermissions, setClientPermissions] = useState([]);

  // Check if user is admin
  const isAdmin = userProfile?.role === 'admin';

  // Get accessible tabs for current user
  const getAccessibleTabs = () => {
    if (!user) return [];
    if (isAdmin) return ALL_TABS;

    // If custom permissions exist, use them; otherwise use defaults
    if (tabPermissions.length > 0) {
      return tabPermissions;
    }
    return DEFAULT_VIEWER_TABS;
  };

  // Check if user can access a specific tab
  const canAccessTab = (tabId) => {
    if (!user) return false;
    if (isAdmin) return true;
    return getAccessibleTabs().includes(tabId);
  };

  // Check if user can access a specific client
  const canAccessClient = (clientId) => {
    if (!user) return false;
    if (isAdmin) return true;

    // If no client restrictions, allow all
    if (clientPermissions.length === 0) return true;
    return clientPermissions.includes(clientId);
  };

  // Fetch user profile and permissions (with timeout to prevent hanging)
  const fetchUserProfile = async (userId) => {
    const timeout = (ms) => new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Profile fetch timed out after ${ms}ms`)), ms)
    );

    try {
      // Fetch user profile
      console.log('[AuthContext] Fetching profile for user:', userId);
      const { data: profile, error: profileError } = await Promise.race([
        supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
        timeout(8000)
      ]);

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      if (profile) {
        console.log('[AuthContext] Profile loaded, role:', profile.role);
        setUserProfile(profile);

        // Fetch tab and client permissions in parallel
        const [tabsResult, clientsResult] = await Promise.race([
          Promise.all([
            supabase.from('user_tab_permissions').select('tab_id').eq('user_id', userId).eq('has_access', true),
            supabase.from('user_client_access').select('client_id').eq('user_id', userId).eq('has_access', true)
          ]),
          timeout(8000)
        ]);

        if (tabsResult?.data) {
          setTabPermissions(tabsResult.data.map(t => t.tab_id));
        }
        if (clientsResult?.data) {
          setClientPermissions(clientsResult.data.map(c => c.client_id));
        }
      } else {
        console.warn('[AuthContext] No profile found for user:', userId);
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  // Create initial profile for new users
  const createUserProfile = async (userId, email, role = 'viewer') => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert([{ user_id: userId, email, role }])
        .select()
        .single();

      if (error) throw error;

      // Set default tab permissions for viewers
      if (role === 'viewer') {
        const tabInserts = DEFAULT_VIEWER_TABS.map(tab => ({
          user_id: userId,
          tab_id: tab,
          has_access: true
        }));

        await supabase.from('user_tab_permissions').insert(tabInserts);
      }

      return data;
    } catch (error) {
      console.error('Error creating profile:', error);
      throw error;
    }
  };

  // Sign up with email/password
  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    // Create user profile (first user becomes admin)
    if (data.user) {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      const role = count === 0 ? 'admin' : 'viewer';
      await createUserProfile(data.user.id, email, role);
    }

    return data;
  };

  // Sign in with email/password
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  };

  // Sign out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setUser(null);
    setUserProfile(null);
    setTabPermissions([]);
    setClientPermissions([]);
  };

  // Initialize auth state
  useEffect(() => {
    console.log('[AuthContext] Initializing auth...');

    // If supabase is not configured, stop loading but keep user as null
    if (!supabase) {
      console.warn('[AuthContext] Supabase not configured - auth disabled');
      setLoading(false);
      return;
    }

    let resolved = false;
    const resolveLoading = () => {
      if (!resolved) {
        resolved = true;
        console.log('[AuthContext] Setting loading to false');
        setLoading(false);
      }
    };

    // Get initial session with timeout
    console.log('[AuthContext] Getting session...');

    // Fallback timeout - if nothing resolves auth in 10s, continue without it
    const sessionTimeout = setTimeout(() => {
      console.warn('[AuthContext] Auth timed out after 10s, continuing without auth');
      resolveLoading();
    }, 10000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(sessionTimeout);
      console.log('[AuthContext] Session result:', session ? 'User logged in' : 'No session');
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('[AuthContext] Fetching user profile...');
        await fetchUserProfile(session.user.id);
      }
      resolveLoading();
    }).catch((err) => {
      clearTimeout(sessionTimeout);
      console.error('[AuthContext] Error getting session:', err);
      resolveLoading();
    });

    // Listen for auth changes - this often fires before getSession resolves
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] Auth state change:', event);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Clear the timeout since we have a user - give profile fetch time to complete
          clearTimeout(sessionTimeout);
          await fetchUserProfile(session.user.id);
        } else {
          setUserProfile(null);
          setTabPermissions([]);
          setClientPermissions([]);
        }

        resolveLoading();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    userProfile,
    loading,
    isAdmin,
    signUp,
    signIn,
    signOut,
    canAccessTab,
    canAccessClient,
    getAccessibleTabs,
    tabPermissions,
    clientPermissions,
    fetchUserProfile,
    ALL_TABS,
    DEFAULT_VIEWER_TABS
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
