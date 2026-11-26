-- Failed sign-ins and password requests per client (AuthRateLimiter, D1): kept in the database so a restart or a second
-- server does not reset the limits. Rows older than their bucket's window are deleted as new ones arrive.
CREATE TABLE auth_rate_event (
    bucket VARCHAR(24)  NOT NULL,
    client VARCHAR(100) NOT NULL,
    at     TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_auth_rate_event ON auth_rate_event (bucket, client, at);
CREATE INDEX ix_auth_rate_event_at ON auth_rate_event (bucket, at);
