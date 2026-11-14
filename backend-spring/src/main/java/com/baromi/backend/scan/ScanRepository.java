package com.baromi.backend.scan;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ScanRepository extends JpaRepository<ScanEntity,String> {
 java.util.Optional<ScanEntity> findFirstByStatusOrderByCreatedAtAscIdAsc(String status);
}
