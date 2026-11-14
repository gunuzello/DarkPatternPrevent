package com.baromi.backend.scan;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="Scan")
public class ScanEntity {
 @Id private String id;
 @Column(name="shop_id", nullable=false) private String shopId;
 @Column(nullable=false) private String status;
 @Column(name="created_at", nullable=false) private Instant createdAt;
 @Column(name="updated_at", nullable=false) private Instant updatedAt;
 protected ScanEntity() {}
 public ScanEntity(String id,String shopId,String status,Instant now){this.id=id;this.shopId=shopId;this.status=status;this.createdAt=now;this.updatedAt=now;}
 public String getId(){return id;} public String getShopId(){return shopId;} public String getStatus(){return status;}
}
