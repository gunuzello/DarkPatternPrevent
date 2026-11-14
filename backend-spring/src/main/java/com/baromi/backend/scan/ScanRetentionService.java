package com.baromi.backend.scan;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ScanRetentionService {
    private final ScanRepository scans;
    public ScanRetentionService(ScanRepository scans) { this.scans = scans; }

    /** Clears report payloads after their retention time while keeping scan metadata for audit history. */
    @Scheduled(fixedDelayString = "${baromi.retention.cleanup-ms:3600000}")
    public void clearExpiredReports() { scans.clearExpiredReports(); }
}
