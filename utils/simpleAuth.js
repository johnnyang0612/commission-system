// 簡化版認證 - 緊急修復用
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useRouter } from 'next/router';

export function useSimpleAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

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

    // 監聯認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (session?.user) {
        // 用獨立 async 函數查 DB，等查完才設 user
        fetchUserFromDB(session.user).then(userData => {
          setUser(userData);
          setLoading(false);
        }).catch(() => {
          // 所有錯誤都 fallback 到最低權限
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
            role: 'sales'
          });
          setLoading(false);
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    // 從 DB 查詢用戶資料（共用邏輯）
    async function fetchUserFromDB(authUser) {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .single();

      if (userData) {
        if (userData.id.startsWith('pre_')) {
          await supabase
            .from('users')
            .update({ id: authUser.id })
            .eq('email', authUser.email);
        }
        return {
          id: authUser.id,
          email: authUser.email,
          name: userData.name,
          role: userData.role || 'sales'
        };
      }

      // DB 沒有記錄，建新用戶
      const { data: newUser } = await supabase
        .from('users')
        .insert([{
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
          role: 'sales'
        }])
        .select()
        .single();

      return {
        id: authUser.id,
        email: authUser.email,
        name: newUser?.name || authUser.user_metadata?.full_name || authUser.email.split('@')[0],
        role: newUser?.role || 'sales'
      };
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export const signOutSimple = async () => {
  await supabase.auth.signOut();
};