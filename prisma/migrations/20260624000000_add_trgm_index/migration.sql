CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "idx_job_title_trgm" ON "Job" USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_job_company_trgm" ON "Job" USING gin (company gin_trgm_ops);
