import {createContext, useContext, useState, useEffect, useCallback, useMemo} from 'react';
import { supabase } from '../services/supabaseClient';
import { ALL_TAB_IDS, TAB_LABELS } from '../lib/navigation';

const AuthContext = createContext({});

// Default tab permissions by role
const DEFAULT_VIEWER_TABS = ['dashboard', 'actions'];
// Derived from navigation.js so the permission registry can never drift from
// the nav again. The previous hardcoded list had fallen 24 tabs behind —
// including 'command-center', which is the default landing page, so a viewer
// with default permissions booted onto a tab the nav then hid from them.
const ALL_TABS = ALL_TAB_IDS;

export { TAB_LABELS };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabPermissions, setTabPermissions] = useState([]);
  const [clientPermissions, setClientPermissions] = useState([]);

  // Check if user is admin
  const isAdmin = userProfile?.role === 'admin';

  // Get accessible tabs for current user.
  // Memoised: these functions land in the context value, and a fresh identity
  // on every render invalidated every consumer's useMemo/useEffect that
  // depended on them - App.jsx's accessibleClients memo recomputed, produced a
  // new array, re-ran the permission effect, which could setActiveClient and
  // start the cycle again.
  const getAccessibleTabs = useCallback(() => {
    if (!user) return [];
    if (isAdmin) return ALL_TABS;

    // If custom permissions exist, use them; otherwise use defaults
    if (tabPermissions.length > 0) {
      return tabPermissions;
    }
    return DEFAULT_VIEWER_TABS;
  }, [user, isAdmin, tabPermissions]);

  // Check if user can access a specific tab
  const canAccessTab = useCallback((tabId) => {
    if (!user) return false;
    if (isAdmin) return true;
    return getAccessibleTabs().includes(tabId);
  }, [user, isAdmin, getAccessibleTabs]);

  // Check if user can access a specific client
  const canAccessClient = useCallback((clientId) => {
    if (!user) return false;
    if (isAdmin) return true;

    // Viewers must have explicit client access — no permissions = no access
    if (clientPermissions.length === 0) return false;
    return clientPermissions.includes(clientId);
  }, [user, isAdmin, clientPermissions]);

  // Fetch user profile and permissions (with timeout to prevent hanging)
  const fetchUserProfile = useCallback(async (userId) => {
    const timeout = (ms) => new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Profile fetch timed out after ${ms}ms`)), ms)
    );

    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await Promise.race([
        supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
        timeout(8000)
      ]);

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      if (profile) {
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
  }, []);

  // Create initial profile for new users
  const createUserProfile = async (userId, email, role = 'viewer') => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert([{ user_id: userId, email, role }], { onConflict: 'user_id' })
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

        await supabase.from('user_tab_permissions').upsert(tabInserts, { onConflict: 'user_id,tab_id' });
      }

      return data;
    } catch (error) {
      console.error('Error creating profile:', error);
      throw error;
    }
  };

  // Sign up with email/password
  const signUp = useCallback(async (email, password) => {
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
  }, []);

  // Sign in with email/password
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setUser(null);
    setUserProfile(null);
    setTabPermissions([]);
    setClientPermissions([]);
  }, []);

  // Initialize auth state
  useEffect(() => {

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
        setLoading(false);
      }
    };

    // Get initial session with timeout

    // Fallback timeout - if nothing resolves auth in 10s, continue without it
    const sessionTimeout = setTimeout(() => {
      console.warn('[AuthContext] Auth timed out after 10s, continuing without auth');
      resolveLoading();
    }, 10000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(sessionTimeout);
      setUser(session?.user ?? null);
      if (session?.user) {
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
  // Mount-only auth subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoised so consumers only re-render when auth state actually changes.
  // A fresh object literal here meant every useAuth() consumer re-rendered on
  // every provider render.
  const value = useMemo(() => ({
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
  }), [
    user, userProfile, loading, isAdmin,
    signUp, signIn, signOut, fetchUserProfile,
    canAccessTab, canAccessClient, getAccessibleTabs,
    tabPermissions, clientPermissions,
  ]);

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
