import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  const [cases, setCases] = useState([]);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    if (!supabase) {
      console.log('Supabase client not initialized');
      return;
    }
    let { data, error } = await supabase.from('cases').select('*');
    if (error) console.error(error);
    else setCases(data || []);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>川輝科技｜業務分潤管理系統</h1>
      <h2>案件列表</h2>
      <ul>
        {cases.map(c => (
          <li key={c.id}>{c.client_name} - {c.amount} 元</li>
        ))}
      </ul>
    </div>
  );
}