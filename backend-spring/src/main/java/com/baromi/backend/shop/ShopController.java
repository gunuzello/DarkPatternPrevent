package com.baromi.backend.shop;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/shops")
public class ShopController {
    private final ShopRepository shops;

    public ShopController(ShopRepository shops) { this.shops = shops; }

    @PostMapping
    public ResponseEntity<?> create(@RequestHeader("X-Baromi-Owner") String owner,
                                    @RequestBody CreateShopRequest request) {
        if (owner.isBlank() || request == null || request.consent() != Boolean.TRUE || !isPublicHttps(request.url())) {
            return ResponseEntity.badRequest().body(Map.of("error", "공개 HTTPS 쇼핑몰 URL과 검사 동의가 필요합니다."));
        }
        var entity = shops.save(new ShopEntity(UUID.randomUUID().toString(), request.url(), ownerHashForApi(owner), Instant.now()));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("shopId", entity.getId(), "url", entity.getUrl()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@RequestHeader("X-Baromi-Owner") String owner, @PathVariable String id) {
        return shops.findByIdAndOwnerHash(id, ownerHashForApi(owner))
            .<ResponseEntity<?>>map(shop -> ResponseEntity.ok(Map.of("shopId", shop.getId(), "url", shop.getUrl())))
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    public record CreateShopRequest(String url, Boolean consent) {}

    static String ownerHashForApi(String owner) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(owner.getBytes(StandardCharsets.UTF_8));
            var hex = new StringBuilder(digest.length * 2);
            for (byte value : digest) hex.append(String.format("%02x", value));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", impossible);
        }
    }

    private static boolean isPublicHttps(String raw) {
        try {
            var uri = URI.create(raw);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getPort() == -1
                && !uri.getHost().equalsIgnoreCase("localhost") && !uri.getHost().startsWith("127.");
        } catch (IllegalArgumentException ignored) { return false; }
    }
}

