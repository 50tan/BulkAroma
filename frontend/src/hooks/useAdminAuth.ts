import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface AdminUser {
  id: string;
  email: string;
}

interface UseAdminAuthReturn {
  user: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [loginError, setLoginError] = useState<string | null>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ['admin-session'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session;
    },
    staleTime: 5 * 60 * 1000,
  });

  const user: AdminUser | null = session?.user
    ? { id: session.user.id, email: session.user.email ?? '' }
    : null;

  async function login(email: string, password: string) {
    setLoginError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoginError(error.message);
      throw error;
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    loginError,
  };
}
