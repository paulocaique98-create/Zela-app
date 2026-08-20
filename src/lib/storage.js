import { supabase } from './supabase';

// Sobe um arquivo pro Storage do Supabase num bucket/caminho específico.
// Retorna o path salvo (usado depois pra gerar signed URL ou remover o arquivo).
export async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeFile(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

// URL temporária (expira) — o bucket é privado, então todo acesso passa por aqui,
// respeitando a RLS de storage.objects no momento da geração do link.
export async function getSignedUrl(bucket, path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

// Versão em lote — evita N requisições separadas ao carregar uma galeria inteira.
// Retorna um Map<path, signedUrl> (paths que falharem simplesmente não entram no Map).
export async function getSignedUrls(bucket, paths, expiresInSeconds = 3600) {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresInSeconds);
  if (error) throw error;
  const map = new Map();
  for (const item of data) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  }
  return map;
}

const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

// Nome de arquivo seguro/único pra evitar colisão e caracteres problemáticos no path.
export function buildSafeFileName(file) {
  const ext = EXTENSION_BY_MIME[file.type] || (file.name.split('.').pop() || 'bin').toLowerCase();
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}.${ext}`;
}
