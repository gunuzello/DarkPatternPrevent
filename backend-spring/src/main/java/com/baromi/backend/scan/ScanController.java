package com.baromi.backend.scan;
import com.baromi.backend.shop.ShopController;
import com.baromi.backend.shop.ShopRepository;
import java.time.Instant; import java.util.Map; import java.util.UUID;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
@RestController @RequestMapping("/api/v1/scans")
public class ScanController {
 private final ScanRepository scans; private final ShopRepository shops;
 private final String workerToken;
 public ScanController(ScanRepository scans,ShopRepository shops,@Value("${baromi.worker-token:}") String workerToken){this.scans=scans;this.shops=shops;this.workerToken=workerToken;}
 @PostMapping public ResponseEntity<?> create(@RequestHeader("X-Baromi-Owner") String owner,@RequestBody CreateScanRequest request){
  if(owner.isBlank()||request==null||request.shopId()==null||shops.findByIdAndOwnerHash(request.shopId(),ShopController.ownerHashForApi(owner)).isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","상점을 찾을 수 없습니다."));
  var scan=scans.save(new ScanEntity(UUID.randomUUID().toString(),request.shopId(),"queued",Instant.now()));
  return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("scanId",scan.getId(),"status",scan.getStatus()));
 }
 @PatchMapping("/{id}/status") public ResponseEntity<?> updateStatus(@RequestHeader("X-Baromi-Worker") String token,@PathVariable String id,@RequestBody StatusRequest request){
  if(workerToken.isBlank()||!workerToken.equals(token)||request==null||!isAllowed(request.status())) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","워커 인증이 필요합니다."));
  var existing = scans.findById(id);
  if (existing.isPresent()) {
   var scan = existing.get(); scan.setStatus(request.status()); scans.save(scan);
   return ResponseEntity.ok(Map.of("scanId",scan.getId(),"status",scan.getStatus()));
  }
  var imported = scans.save(new ScanEntity(id, null, request.status(), Instant.now()));
  return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("scanId", imported.getId(), "status", imported.getStatus(), "imported", true));
 }
 @GetMapping("/{id}") public ResponseEntity<?> get(@RequestHeader("X-Baromi-Owner") String owner,@PathVariable String id){
  return scans.findById(id).filter(s->shops.findByIdAndOwnerHash(s.getShopId(),ShopController.ownerHashForApi(owner)).isPresent()).<ResponseEntity<?>>map(s->ResponseEntity.ok(Map.of("scanId",s.getId(),"shopId",s.getShopId(),"status",s.getStatus()))).orElseGet(()->ResponseEntity.notFound().build());
 }
 public record CreateScanRequest(String shopId) {}
 public record StatusRequest(String status) {}
 private static boolean isAllowed(String status){return switch(status){case "queued","running","partial","succeeded","failed","cancelled" -> true; default -> false;};}
}
