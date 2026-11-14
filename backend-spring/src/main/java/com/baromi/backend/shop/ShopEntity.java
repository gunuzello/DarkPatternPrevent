package com.baromi.backend.shop;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "shop")
public class ShopEntity {
    @Id
    private String id;
    @Column(nullable = false) private String url;
    @Column(nullable = false) private String ownerHash;
    @Column(nullable = false) private Instant consentAt;
    private String verificationHash;
    private Instant verifiedAt;

    protected ShopEntity() {}

    public ShopEntity(String id, String url, String ownerHash, Instant consentAt) {
        this.id = id; this.url = url; this.ownerHash = ownerHash; this.consentAt = consentAt;
    }

    public String getId() { return id; }
    public String getUrl() { return url; }
    public String getOwnerHash() { return ownerHash; }
    public Instant getConsentAt() { return consentAt; }
    public String getVerificationHash() { return verificationHash; }
    public Instant getVerifiedAt() { return verifiedAt; }
}

