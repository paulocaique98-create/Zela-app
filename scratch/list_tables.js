import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function listTables() {
  // Query Supabase REST API directly or write a generic select on pg_tables if possible.
  // Wait, standard REST API doesn't expose system tables, but we can query them if there's a view or just list known tables to see if they return data or error.
  const tables = ['schools', 'users', 'students', 'authorized_persons', 'medical_records', 'history', 'logs'];
  console.log('Testing access to tables:');
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`- ${t}: Error (${error.message || error.code})`);
    } else {
      console.log(`- ${t}: Success (Count: ${data.length})`);
    }
  }
}

listTables();
