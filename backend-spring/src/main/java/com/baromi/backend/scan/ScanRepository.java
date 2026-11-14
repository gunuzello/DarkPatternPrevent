package com.baromi.backend.scan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
public interface ScanRepository extends JpaRepository<ScanEntity,String> {
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 java.util.Optional<ScanEntity> findFirstByStatusOrderByCreatedAtAscIdAsc(String status);
 java.util.List<ScanEntity> findByStatusAndStartedAtBefore(String status, java.time.Instant before);
 java.util.List<ScanEntity> findByShopIdOrderByCreatedAtDesc(String shopId, Pageable pageable);
 @Modifying
 @Transactional
 @Query("update ScanEntity s set s.reportJson = null, s.reportExpiresAt = null, s.updatedAt = CURRENT_TIMESTAMP where s.reportExpiresAt < CURRENT_TIMESTAMP and s.reportJson is not null")
 int clearExpiredReports();
}
