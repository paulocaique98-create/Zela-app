import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
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

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('Anon Key exists:', !!supabaseAnonKey);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  console.log('Inspecting Supabase database...');
  
  // 1. Inspect schools table
  const { data: schools, error: schoolErr } = await supabase.from('schools').select('*').limit(1);
  if (schoolErr) {
    console.error('Error fetching schools:', schoolErr);
  } else {
    console.log('Sample School:', schools);
  }

  // 2. Inspect users table
  const { data: users, error: userErr } = await supabase.from('users').select('*').limit(1);
  if (userErr) {
    console.error('Error fetching users:', userErr);
  } else {
    console.log('Sample User:', users);
  }

  // 3. Inspect students table
  const { data: students, error: studentErr } = await supabase.from('students').select('*').limit(1);
  if (studentErr) {
    console.error('Error fetching students:', studentErr);
  } else {
    console.log('Sample Student:', students);
  }
}

inspect();
