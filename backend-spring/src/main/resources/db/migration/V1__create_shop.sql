CREATE TABLE "Shop" (
    id VARCHAR(255) PRIMARY KEY,
    url VARCHAR(2048) NOT NULL,
    owner_hash VARCHAR(255) NOT NULL,
    consent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verification_hash VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_shop_owner_hash ON "Shop" (owner_hash);
