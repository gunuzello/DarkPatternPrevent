package com.baromi.backend.scan;
import com.baromi.backend.shop.ShopController;
import com.baromi.backend.shop.ShopRepository;
import java.time.Instant; import java.util.Map; import java.util.UUID;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/scans")
public class ScanController {
 private final ScanRepository scans; private final ShopRepository shops;
 public ScanController(ScanRepository scans,ShopRepository shops){this.scans=scans;this.shops=shops;}
 @PostMapping public ResponseEntity<?> create(@RequestHeader("X-Baromi-Owner") String owner,@RequestBody CreateScanRequest request){
  if(owner.isBlank()||request==null||request.shopId()==null||shops.findByIdAndOwnerHash(request.shopId(),ShopController.ownerHashForApi(owner)).isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","상점을 찾을 수 없습니다."));
  var scan=scans.save(new ScanEntity(UUID.randomUUID().toString(),request.shopId(),"queued",Instant.now()));
  return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("scanId",scan.getId(),"status",scan.getStatus()));
 }
 @GetMapping("/{id}") public ResponseEntity<?> get(@RequestHeader("X-Baromi-Owner") String owner,@PathVariable String id){
  return scans.findById(id).filter(s->shops.findByIdAndOwnerHash(s.getShopId(),ShopController.ownerHashForApi(owner)).isPresent()).<ResponseEntity<?>>map(s->ResponseEntity.ok(Map.of("scanId",s.getId(),"shopId",s.getShopId(),"status",s.getStatus()))).orElseGet(()->ResponseEntity.notFound().build());
 }
 public record CreateScanRequest(String shopId) {}
}
