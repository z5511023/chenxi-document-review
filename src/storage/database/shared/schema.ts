// Database schema definitions for reference
// Actual DB operations use Supabase client, not Drizzle ORM

export interface KnowledgeFileRecord {
  id: string;
  title: string;
  dataset: string;
  doc_id: string | null;
  content_preview: string | null;
  source_type: string;
  company_type: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewRecordDB {
  id: string;
  file_name: string;
  review_type: string;
  review_mode: string;
  user_role: string;
  company_type: string;
  status: string;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
