import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useRouter } from 'next/router';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 先檢查 Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
        }
        
        if (session?.user) {
          setUser(session.user);
          setLoading(false);
          
          // 非阻塞同步用戶到資料庫
          syncUserToDatabase(session.user).catch(console.error);
        } else {
          // 檢查演示模式
          const demoLoggedIn = localStorage.getItem('demo_logged_in');
          if (demoLoggedIn === 'true') {
            setUser({
              id: 'demo-user',
              email: 'demo@example.com',
              user_metadata: { full_name: 'Demo User' }
            });
            setLoading(false);
          } else {
            setUser(null);
            setLoading(false);
            
            // 只在非登入相關頁面時重定向
            const publicPages = ['/login', '/test-login'];
            if (!publicPages.includes(router.pathname)) {
              router.push('/login');
            }
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
        setLoading(false);
      }
    };

    checkAuth();

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await syncUserToDatabase(session.user);
        
        // 清除演示模式
        localStorage.removeItem('demo_logged_in');
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('demo_logged_in');
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router.pathname]);

  return { user, loading };
}

// 手動同步用戶到資料庫
const syncUserToDatabase = async (user) => {
  try {
    // 先檢查用戶是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();
    
    if (!existingUser) {
      // 用戶不存在，插入新記錄
      const { error } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email.split('@')[0],
          role: 'sales',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('插入用戶資料失敗:', error);
      } else {
        console.log('用戶資料同步成功');
      }
    } else {
      // 用戶已存在，更新基本資訊
      const { error } = await supabase
        .from('users')
        .update({
          email: user.email,
          name: user.user_metadata?.full_name || user.email.split('@')[0],
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (error) {
        console.error('更新用戶資料失敗:', error);
      }
    }
  } catch (err) {
    console.error('同步用戶資料錯誤:', err);
    // 不要讓同步錯誤影響登入
  }
};

// 登出功能
export const signOut = async () => {
  // 清除演示模式標記
  localStorage.removeItem('demo_logged_in');
  
  // Supabase 登出
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('登出失敗:', error);
  }
  
  return { error };
};