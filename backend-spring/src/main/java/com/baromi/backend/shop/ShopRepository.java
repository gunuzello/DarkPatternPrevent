package com.baromi.backend.shop;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopRepository extends JpaRepository<ShopEntity, String> {
    Optional<ShopEntity> findByIdAndOwnerHash(String id, String ownerHash);
}

