package com.baromi.backend.scan;
import com.baromi.backend.shop.ShopController;
import com.baromi.backend.shop.ShopRepository;
import java.time.Instant; import java.util.LinkedHashMap; import java.util.Map; import java.util.UUID;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
@RestController @RequestMapping("/api/v1/scans")
public class ScanController {
 private final ScanRepository scans; private final ShopRepository shops;
 private final String workerToken;
 public ScanController(ScanRepository scans,ShopRepository shops,@Value("${baromi.worker-token:}") String workerToken){this.scans=scans;this.shops=shops;this.workerToken=workerToken;}
 @PostMapping public ResponseEntity<?> create(@RequestHeader("X-Baromi-Owner") String owner,@RequestBody CreateScanRequest request){
  if(owner.isBlank()||request==null||request.shopId()==null||shops.findByIdAndOwnerHash(request.shopId(),ShopController.ownerHashForApi(owner)).isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","상점을 찾을 수 없습니다."));
  if (request.id() != null && scans.findById(request.id()).isPresent()) return ResponseEntity.ok(Map.of("scanId", request.id(), "status", "queued", "mirrored", true));
  var scan=scans.save(new ScanEntity(request.id() == null ? UUID.randomUUID().toString() : request.id(),request.shopId(),"queued",Instant.now(),request.targetUrl(),request.executionMode(),request.viewport(),request.purchasePath()));
  return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("scanId",scan.getId(),"status",scan.getStatus()));
 }
 @PatchMapping("/{id}/status") public ResponseEntity<?> updateStatus(@RequestHeader("X-Baromi-Worker") String token,@PathVariable String id,@RequestBody StatusRequest request){
  if(workerToken.isBlank()||!workerToken.equals(token)||request==null||!isAllowed(request.status())) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","워커 인증이 필요합니다."));
  var existing = scans.findById(id);
  if (existing.isPresent()) {
   var scan = existing.get(); scan.setStatus(request.status()); scan.setCurrentStage(request.stage()); scans.save(scan);
   return ResponseEntity.ok(statusBody(scan));
  }
  var imported = scans.save(new ScanEntity(id, null, request.status(), Instant.now())); imported.setCurrentStage(request.stage()); imported = scans.save(imported);
  var body = statusBody(imported); body.put("imported", true);
  return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
 }
 @Transactional @PostMapping("/claim") public ResponseEntity<?> claim(@RequestHeader("X-Baromi-Worker") String token){
  if(workerToken.isBlank()||!workerToken.equals(token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","워커 인증이 필요합니다."));
  var queued = scans.findFirstByStatusOrderByCreatedAtAscIdAsc("queued");
  if(queued.isEmpty()) return ResponseEntity.noContent().build();
  var scan = queued.get(); scan.setStatus("running"); scan.markStarted(); scans.save(scan);
  var body = statusBody(scan); body.put("shopId",scan.getShopId()); body.put("targetUrl",scan.getTargetUrl()); body.put("executionMode",scan.getExecutionMode()); body.put("viewport",scan.getViewport()); body.put("purchasePath",scan.getPurchasePath()); body.put("startedAt",scan.getStartedAt());
  return ResponseEntity.ok(body);
 }
 @Transactional @PostMapping("/recover") public ResponseEntity<?> recover(@RequestHeader("X-Baromi-Worker") String token,@RequestBody RecoverRequest request){
  if(workerToken.isBlank()||!workerToken.equals(token)||request==null||request.staleBefore()==null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","워커 인증과 staleBefore가 필요합니다."));
  var stale = scans.findByStatusAndStartedAtBefore("running", request.staleBefore());
  stale.forEach(scan -> { scan.setStatus("failed"); scans.save(scan); });
  return ResponseEntity.ok(Map.of("recovered", stale.size(), "staleBefore", request.staleBefore()));
 }
 @GetMapping("/{id}") public ResponseEntity<?> get(@RequestHeader("X-Baromi-Owner") String owner,@PathVariable String id){
  return scans.findById(id).filter(s->s.getShopId()!=null && shops.findByIdAndOwnerHash(s.getShopId(),ShopController.ownerHashForApi(owner)).isPresent()).<ResponseEntity<?>>map(s->{ var body=statusBody(s); body.put("shopId",s.getShopId()); return ResponseEntity.ok(body); }).orElseGet(()->ResponseEntity.notFound().build());
 }
 @GetMapping("/shop/{shopId}") public ResponseEntity<?> listForShop(@RequestHeader("X-Baromi-Owner") String owner,@PathVariable String shopId){
  if(owner.isBlank() || shops.findByIdAndOwnerHash(shopId,ShopController.ownerHashForApi(owner)).isEmpty()) return ResponseEntity.notFound().build();
  var items = scans.findByShopIdOrderByCreatedAtDesc(shopId).stream().map(ScanController::statusBody).toList();
  return ResponseEntity.ok(Map.of("shopId", shopId, "scans", items));
 }
 public record CreateScanRequest(String id, String shopId, String targetUrl, String executionMode, String viewport, String purchasePath) {}
  public record StatusRequest(String status, String stage) {}
 public record RecoverRequest(Instant staleBefore) {}
 private static LinkedHashMap<String,Object> statusBody(ScanEntity scan){ var body=new LinkedHashMap<String,Object>(); body.put("scanId",scan.getId()); body.put("status",scan.getStatus()); body.put("currentStage",scan.getCurrentStage()); return body; }
 private static boolean isAllowed(String status){return switch(status){case "queued","running","partial","succeeded","failed","cancelled" -> true; default -> false;};}
}
