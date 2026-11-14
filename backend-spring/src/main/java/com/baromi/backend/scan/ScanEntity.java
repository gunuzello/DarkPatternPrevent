package com.baromi.backend.scan;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="scan")
public class ScanEntity {
 @Id private String id;
 @Column(name="shop_id") private String shopId;
 @Column(nullable=false) private String status;
 @Column(name="current_stage") private String currentStage;
 @Column(name="target_url") private String targetUrl;
 @Column(name="execution_mode") private String executionMode;
 @Column(name="viewport") private String viewport;
 @Column(name="purchase_path") private String purchasePath;
 @Column(name="created_at", nullable=false) private Instant createdAt;
 @Column(name="updated_at", nullable=false) private Instant updatedAt;
 @Column(name="started_at") private Instant startedAt;
 @Column(name="report_json", columnDefinition="TEXT") private String reportJson;
 @Column(name="report_expires_at") private Instant reportExpiresAt;
 protected ScanEntity() {}
 public ScanEntity(String id,String shopId,String status,Instant now){this.id=id;this.shopId=shopId;this.status=status;this.createdAt=now;this.updatedAt=now;}
 public ScanEntity(String id,String shopId,String status,Instant now,String targetUrl,String executionMode,String viewport,String purchasePath){this(id,shopId,status,now);this.targetUrl=targetUrl;this.executionMode=executionMode;this.viewport=viewport;this.purchasePath=purchasePath;}
 public String getId(){return id;} public String getShopId(){return shopId;} public String getStatus(){return status;}
 public String getCurrentStage(){return currentStage;} public void setCurrentStage(String stage){this.currentStage=stage;}
 public String getTargetUrl(){return targetUrl;} public String getExecutionMode(){return executionMode;} public String getViewport(){return viewport;} public String getPurchasePath(){return purchasePath;}
 public Instant getCreatedAt(){return createdAt;} public Instant getUpdatedAt(){return updatedAt;} public Instant getStartedAt(){return startedAt;} public void markStarted(){this.startedAt=Instant.now(); this.updatedAt=this.startedAt;}
 public String getReportJson(){return reportJson;} public Instant getReportExpiresAt(){return reportExpiresAt;}
 public void setReportJson(String reportJson, Instant expiresAt){this.reportJson=reportJson; this.reportExpiresAt=expiresAt; this.updatedAt=Instant.now();}
 public void setStatus(String status){this.status=status; this.updatedAt=Instant.now();}
}
