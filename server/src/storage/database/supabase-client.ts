import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import path from 'path';

// 环境变量缓存
let envCache: Record<string, string> | null = null;
let loadPromise: Promise<Record<string, string>> | null = null;

/**
 * 通过 Python Workload Identity 获取项目环境变量
 */
async function loadEnvFromWorkloadIdentity(): Promise<Record<string, string>> {
  if (envCache) return envCache;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    try {
      const scriptPath = path.resolve(__dirname, '_load_env.py');
      const output = execSync(`python3 ${scriptPath}`, {
        encoding: 'utf-8',
        timeout: 15000,
      });
      envCache = JSON.parse(output.trim());

      // 同时设置到 process.env
      if (envCache) {
        for (const [key, value] of Object.entries(envCache)) {
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }

      resolve(envCache || {});
    } catch (error) {
      console.error('Failed to load env from Workload Identity:', error);
      resolve({});
    }
  });

  return loadPromise;
}

async function getSupabaseUrl(): Promise<string> {
  if (process.env.COZE_SUPABASE_URL) return process.env.COZE_SUPABASE_URL;
  const env = await loadEnvFromWorkloadIdentity();
  return env.COZE_SUPABASE_URL || '';
}

async function getServiceRoleKey(): Promise<string> {
  if (process.env.COZE_SUPABASE_SERVICE_ROLE_KEY) return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  const env = await loadEnvFromWorkloadIdentity();
  return env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
}

async function getAnonKey(): Promise<string> {
  if (process.env.COZE_SUPABASE_ANON_KEY) return process.env.COZE_SUPABASE_ANON_KEY;
  const env = await loadEnvFromWorkloadIdentity();
  return env.COZE_SUPABASE_ANON_KEY || '';
}

let supabaseInstance: ReturnType<typeof createClient> | null = null;
let initPromise: Promise<ReturnType<typeof createClient>> | null = null;

/**
 * 获取 Supabase 客户端（服务端，使用 service_role key）
 */
export async function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = await getSupabaseUrl();
    const serviceRoleKey = await getServiceRoleKey();

    if (!url || !serviceRoleKey) {
      throw new Error('Supabase 环境变量未配置。请在项目设置中开通 Supabase 服务。');
    }

    supabaseInstance = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return supabaseInstance;
  })();

  return initPromise;
}

/**
 * 获取 Supabase Anon 客户端
 */
export async function getSupabaseAnonClient() {
  const url = await getSupabaseUrl();
  const anonKey = await getAnonKey();

  if (!url || !anonKey) {
    throw new Error('Supabase 环境变量未配置');
  }

  return createClient(url, anonKey);
}
