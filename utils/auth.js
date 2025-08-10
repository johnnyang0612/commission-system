import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useRouter } from 'next/router';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 獲取當前用戶
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
      
      // 如果沒有登入且不在登入頁面，則跳轉到登入頁
      if (!session?.user && router.pathname !== '/login') {
        router.push('/login');
      }
    };

    getUser();

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return { user, loading };
}

// 登出功能
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('登出失敗:', error);
  }
  return { error };
};