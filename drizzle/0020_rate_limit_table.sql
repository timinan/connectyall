CREATE TABLE "rate_limit" (
    "key" text NOT NULL,
    "count" integer NOT NULL,
    "last_request" bigint NOT NULL,
    PRIMARY KEY ("key")
);
