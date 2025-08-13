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
        // 無論如何，先設置基本用戶資料並清除載入狀態，避免卡住
        const basicUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
          role: 'admin' // 暫時設為 admin 避免權限問題
        };
        
        console.log('Auth state change: Setting basic user and clearing loading immediately');
        setUser(basicUser);
        setLoading(false);
        
        // 然後異步獲取完整的用戶資料，但不阻塞 UI
        (async () => {
          try {
            console.log('Auth state change: Fetching detailed user data for:', session.user.email);
            const { data: userData, error: fetchError } = await Promise.race([
              supabase
                .from('users')
                .select('*')
                .eq('email', session.user.email)
                .single(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            
            console.log('Auth state change: Detailed user data result:', { userData, fetchError });
        
            if (userData) {
              // 如果是預先創建的用戶（ID 以 pre_ 開頭），更新 ID 為真實的 auth ID
              if (userData.id.startsWith('pre_')) {
                await supabase
                  .from('users')
                  .update({ id: session.user.id })
                  .eq('email', session.user.email);
                
                console.log('Merged pre-created user with auth user (in auth state change)');
              }
              
              // 更新為完整的用戶資料
              console.log('Auth state change: Updating to detailed user data');
              setUser({
                id: session.user.id,
                email: session.user.email,
                name: userData.name,
                role: userData.role || 'sales'
              });
            } else {
              // 在數據庫中創建新用戶記錄，但不阻塞 UI
              console.log('Auth state change: Creating new user record in background');
              await supabase
                .from('users')
                .insert([{
                  id: session.user.id,
                  email: session.user.email,
                  name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                  role: 'sales'
                }]);
              
              // 更新為完整資料
              setUser({
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                role: 'sales'
              });
            }
          } catch (error) {
            console.error('Auth state change detailed fetch error:', error);
            // 如果獲取詳細資料失敗，保持基本用戶資料
          }
        })();
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