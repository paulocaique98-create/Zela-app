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

// ── Fotos de responsáveis autorizados (biometria) ──────────────────────────
// NÃO CHAMADO EM NENHUM LUGAR AINDA — depende da coluna
// authorized_persons.photo_storage_path e do bucket 'person-photos', criados
// pela migration 20260826_add_authorized_person_photo_storage.sql, que ainda
// não foi aplicada no banco. Só passa a ser usado depois que a migration
// rodar (ver relatório da tarefa "Migração Storage").

// Converte uma data URL (o formato que a captura de câmera / FileReader já
// produzem hoje) num Blob, sem depender de fetch() pra evitar problemas de
// CSP com data: URLs em alguns navegadores.
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const PERSON_PHOTOS_BUCKET = 'person-photos';

// Sobe a foto de um authorized_person pro Storage — path determinístico
// ({school_id}/{authorized_person_id}.jpg) garante que um novo upload da
// MESMA pessoa sobrescreve o arquivo anterior (upsert:true), em vez de
// acumular arquivos órfãos a cada "Atualizar Foto".
// Aceita tanto uma data URL (captura via câmera) quanto um File (upload
// pelo input de arquivo da família) — normaliza pros dois casos.
export async function uploadAuthorizedPersonPhoto(schoolId, personId, imageDataUrlOrFile) {
  const blob = typeof imageDataUrlOrFile === 'string'
    ? dataUrlToBlob(imageDataUrlOrFile)
    : imageDataUrlOrFile;

  const ext = EXTENSION_BY_MIME[blob.type] || 'jpg';
  const path = `${schoolId}/${personId}.${ext}`;

  const { error } = await supabase.storage.from(PERSON_PHOTOS_BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: true, // mesmo path da mesma pessoa = substitui, não duplica
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw error;
  return path;
}

export async function removeAuthorizedPersonPhoto(path) {
  return removeFile(PERSON_PHOTOS_BUCKET, path);
}

export async function getAuthorizedPersonPhotoSignedUrl(path, expiresInSeconds = 3600) {
  return getSignedUrl(PERSON_PHOTOS_BUCKET, path, expiresInSeconds);
}

// Versão em lote — usada onde uma tela lista vários responsáveis de uma vez
// (ex: fetchData do login), pra não gerar 1 signed URL por pessoa em série.
export async function getAuthorizedPersonPhotoSignedUrls(paths, expiresInSeconds = 3600) {
  return getSignedUrls(PERSON_PHOTOS_BUCKET, paths, expiresInSeconds);
}
