-- Runs of the scheduled jobs (ScheduledJobs, D2): one row per run that got the job's lock. ok is null while it runs.
-- The error holds the exception's class and code only, never a message with personal data. Kept 7 days.
CREATE TABLE sys_job_run (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job         VARCHAR(40)  NOT NULL,
    started_at  TIMESTAMPTZ  NOT NULL,
    finished_at TIMESTAMPTZ,
    ok          BOOLEAN,
    error_class VARCHAR(200),
    error_code  VARCHAR(60)
);
CREATE INDEX ix_sys_job_run ON sys_job_run (job, started_at DESC);
