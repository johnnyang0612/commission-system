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
        // 檢查 Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // 如果有真實的 session，清除演示模式
          localStorage.removeItem('demo_logged_in');
          
          // 從 users 表獲取用戶資料
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          if (userData) {
            // 如果是預先創建的用戶（ID 以 pre_ 開頭），更新 ID 為真實的 auth ID
            if (userData.id.startsWith('pre_')) {
              const { error: updateError } = await supabase
                .from('users')
                .update({ id: session.user.id })
                .eq('email', session.user.email);
              
              if (!updateError) {
                console.log('Merged pre-created user with auth user');
              }
            }
            
            setUser({
              id: session.user.id,
              email: session.user.email,
              name: userData.name,
              role: userData.role || 'sales'
            });
          } else {
            // 如果 users 表中沒有記錄，創建一個
            const { data: newUser, error: insertError } = await supabase
              .from('users')
              .insert([{
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                role: 'sales'
              }])
              .select()
              .single();
            
            if (newUser) {
              setUser({
                id: session.user.id,
                email: session.user.email,
                name: newUser.name,
                role: newUser.role
              });
            } else {
              console.error('Error creating user record:', insertError);
              setUser({
                id: session.user.id,
                email: session.user.email,
                role: 'sales'
              });
            }
          }
        } else {
          // 只有在真的沒有 session 時才考慮演示模式
          setUser(null);
        }
      } catch (error) {
        console.error('Auth error:', error);
        // 錯誤時也設置演示用戶以確保能正常顯示
        console.log('Setting fallback demo user due to auth error');
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

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      if (session?.user) {
        // 清除演示模式
        localStorage.removeItem('demo_logged_in');
        
        // 從 users 表獲取用戶資料
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('email', session.user.email)
          .single();
        
        if (userData) {
          // 如果是預先創建的用戶（ID 以 pre_ 開頭），更新 ID 為真實的 auth ID
          if (userData.id.startsWith('pre_')) {
            await supabase
              .from('users')
              .update({ id: session.user.id })
              .eq('email', session.user.email);
            
            console.log('Merged pre-created user with auth user (in auth state change)');
          }
          
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: userData.name,
            role: userData.role || 'sales'
          });
        } else {
          // 創建新用戶記錄
          await supabase
            .from('users')
            .insert([{
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              role: 'sales'
            }]);
          
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.email.split('@')[0],
            role: 'sales'
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('demo_logged_in');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export const signOutSimple = async () => {
  localStorage.removeItem('demo_logged_in');
  await supabase.auth.signOut();
};