import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext({});

// Default tab permissions by role
const DEFAULT_VIEWER_TABS = ['Dashboard', 'Strategy'];
const ALL_TABS = [
  'Dashboard',
  'Channel Summary',
  'Strategy',
  'Competitors',
  'Intelligence',
  'Creative Brief',
  'Comments',
  'Data',
  'Standardizer'
];

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

  // Fetch user profile and permissions
  const fetchUserProfile = async (userId) => {
    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      if (profile) {
        setUserProfile(profile);

        // Fetch tab permissions
        const { data: tabs } = await supabase
          .from('user_tab_permissions')
          .select('tab_id')
          .eq('user_id', userId)
          .eq('has_access', true);

        if (tabs) {
          setTabPermissions(tabs.map(t => t.tab_id));
        }

        // Fetch client permissions
        const { data: clients } = await supabase
          .from('user_client_access')
          .select('client_id')
          .eq('user_id', userId)
          .eq('has_access', true);

        if (clients) {
          setClientPermissions(clients.map(c => c.client_id));
        }
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
    // If supabase is not configured, stop loading but keep user as null
    if (!supabase) {
      console.warn('Supabase not configured - auth disabled');
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    }).catch((err) => {
      console.error('Error getting session:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setUserProfile(null);
          setTabPermissions([]);
          setClientPermissions([]);
        }

        setLoading(false);
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
