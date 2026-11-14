package com.baromi.backend.scan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
public interface ScanRepository extends JpaRepository<ScanEntity,String> {
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 java.util.Optional<ScanEntity> findFirstByStatusOrderByCreatedAtAscIdAsc(String status);
 java.util.List<ScanEntity> findByStatusAndStartedAtBefore(String status, java.time.Instant before);
 java.util.List<ScanEntity> findByShopIdOrderByCreatedAtDesc(String shopId);
}
