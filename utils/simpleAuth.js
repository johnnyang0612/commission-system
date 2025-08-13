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
      console.log('checkUser: Starting authentication check');
      try {
        // 檢查 Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        console.log('checkUser: Session found:', !!session?.user, session?.user?.email);
        
        if (session?.user) {
          
          // 從 users 表獲取用戶資料
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          console.log('checkUser: Processing user data:', userData);
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
            
            console.log('checkUser: Setting user data');
            setUser({
              id: session.user.id,
              email: session.user.email,
              name: userData.name,
              role: userData.role || 'sales'
            });
          } else {
            // 如果 users 表中沒有記錄，創建一個
            console.log('checkUser: Creating new user record');
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
              console.log('checkUser: New user created, setting user data');
              setUser({
                id: session.user.id,
                email: session.user.email,
                name: newUser.name,
                role: newUser.role
              });
            } else {
              console.error('Error creating user record:', insertError);
              console.log('checkUser: Using fallback user data');
              setUser({
                id: session.user.id,
                email: session.user.email,
                role: 'sales'
              });
            }
          }
        } else {
          // 沒有 session，設置為 null
          setUser(null);
        }
      } catch (error) {
        console.error('Auth error:', error);
        setUser(null);
      } finally {
        console.log('checkUser: Setting loading to false');
        setLoading(false);
      }
    };

    checkUser();

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      if (session?.user) {
        try {
          // 從 users 表獲取用戶資料
          console.log('Auth state change: Fetching user data for:', session.user.email);
          const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          console.log('Auth state change: User data result:', { userData, fetchError });
        
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
          console.log('Auth state change: Setting loading to false after user data set');
          setLoading(false);
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
          console.log('Auth state change: Setting loading to false after new user created');
          setLoading(false);
        }
      } catch (error) {
          console.error('Auth state change error:', error);
          // 即使出錯也要設置基本用戶資料和清除載入狀態
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
            role: 'sales'
          });
          console.log('Auth state change: Setting loading to false after error');
          setLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export const signOutSimple = async () => {
  await supabase.auth.signOut();
};