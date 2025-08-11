// 簡化版認證 - 緊急修復用
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useRouter } from 'next/router';

export function useSimpleAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 快速檢查用戶狀態
    const checkUser = async () => {
      try {
        // 檢查演示模式
        const demoMode = localStorage.getItem('demo_logged_in');
        if (demoMode === 'true') {
          setUser({
            id: 'demo-user',
            email: 'demo@example.com',
            role: 'admin'
          });
          setLoading(false);
          return;
        }

        // 檢查 Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // 簡化用戶物件
          setUser({
            id: session.user.id,
            email: session.user.email,
            role: 'admin' // 暫時都給管理員權限
          });
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth error:', error);
        // 錯誤時設置演示用戶
        setUser({
          id: 'error-fallback',
          email: 'user@example.com',
          role: 'admin'
        });
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  return { user, loading };
}

export const signOutSimple = async () => {
  localStorage.removeItem('demo_logged_in');
  await supabase.auth.signOut();
};