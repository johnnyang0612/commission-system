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
      // 檢查演示模式
      const demoLoggedIn = localStorage.getItem('demo_logged_in');
      if (demoLoggedIn === 'true') {
        setUser({
          id: 'demo-user',
          email: 'demo@example.com',
          user_metadata: { full_name: 'Demo User' }
        });
        setLoading(false);
        return;
      }

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (event === 'SIGNED_IN' && session?.user) {
        // 手動同步用戶到 users 表
        await syncUserToDatabase(session.user);
      }
      
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return { user, loading };
}

// 手動同步用戶到資料庫
const syncUserToDatabase = async (user) => {
  try {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email.split('@')[0],
        role: 'sales',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error('同步用戶資料失敗:', error);
    }
  } catch (err) {
    console.error('同步用戶資料錯誤:', err);
  }
};

// 登出功能
export const signOut = async () => {
  // 清除演示模式標記
  localStorage.removeItem('demo_logged_in');
  
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('登出失敗:', error);
  }
  return { error };
};