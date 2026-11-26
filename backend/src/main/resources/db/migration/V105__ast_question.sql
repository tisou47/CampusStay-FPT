-- Questions to the students' assistant within the hourly limit (AssistantService, D1): counted in the database so a
-- restart or a second server does not reset them. Only the time is kept, never the question.
CREATE TABLE ast_question (
    user_id  BIGINT      NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    asked_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_ast_question ON ast_question (user_id, asked_at);
CREATE INDEX ix_ast_question_at ON ast_question (asked_at);
