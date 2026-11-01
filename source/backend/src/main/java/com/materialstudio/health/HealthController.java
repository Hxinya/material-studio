package com.materialstudio.health;

import java.time.Instant;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final ApplicationMetadataMapper metadataMapper;

    public HealthController(ApplicationMetadataMapper metadataMapper) {
        this.metadataMapper = metadataMapper;
    }

    @GetMapping("/api/health")
    public ResponseEntity<HealthResponse> health() {
        try {
            String version = metadataMapper.findSchemaVersion();
            if (version == null) {
                return unavailable();
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .body(new HealthResponse("UP", "material-studio-backend", "UP", version, Instant.now()));
        } catch (DataAccessException exception) {
            return unavailable();
        }
    }

    private ResponseEntity<HealthResponse> unavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .body(new HealthResponse("DOWN", "material-studio-backend", "DOWN", null, Instant.now()));
    }

    public record HealthResponse(String status, String application, String database,
                                 String schemaVersion, Instant timestamp) {}
}
