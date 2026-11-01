package com.materialstudio.task;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.materialstudio.material.MaterialStorage;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"app.tasks.worker-enabled=false", "app.tasks.simulation-controls-enabled=true"})
class TaskIntegrationTest extends com.materialstudio.support.MySqlIntegrationSupport {
    static final Path DIRECTORY;
    static { try { DIRECTORY = Files.createTempDirectory("task-test-"); } catch (Exception e) { throw new ExceptionInInitializerError(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) { registry.add("app.material-directory", DIRECTORY::toString); }
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired TaskProcessor processor;
    @Autowired TaskService service;
    @Autowired TaskWorker worker;
    @Autowired TaskFiles files;
    @Autowired MaterialStorage materialFiles;
    final List<String> emails = new ArrayList<>();

    @AfterEach void cleanup() {
        worker.stop();
        for (String email : emails) {
            var ids = jdbc.queryForList("SELECT id FROM task_jobs WHERE account_id IN (SELECT id FROM accounts WHERE email=?)", String.class, email);
            ids.forEach(files::deleteTask);
            jdbc.update("DELETE FROM task_jobs WHERE account_id IN (SELECT id FROM accounts WHERE email=?)", email);
            jdbc.queryForList("SELECT storage_name FROM material_slots WHERE account_id IN (SELECT id FROM accounts WHERE email=?) AND storage_name IS NOT NULL", String.class, email).forEach(materialFiles::deleteQuietly);
            jdbc.update("DELETE FROM material_slots WHERE account_id IN (SELECT id FROM accounts WHERE email=?)", email);
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?", email);
            jdbc.update("DELETE FROM accounts WHERE email=?", email);
        }
    }

    @Test void requiresLoginCsrfAndDoesNotExposeAnotherAccountsTaskOrFiles() throws Exception {
        var owner = new Client(true); var other = new Client(true); var guest = new Client(false);
        owner.upload();
        assertThat(owner.post("/api/tasks", owner.payload(null), false).statusCode()).isEqualTo(403);
        var task = owner.create(null); String id = task.get("id").asText();
        assertThat(guest.get("/api/tasks/" + id).statusCode()).isEqualTo(401);
        assertThat(other.get("/api/tasks/" + id).statusCode()).isEqualTo(404);
        assertThat(other.get("/api/tasks/" + id + "/inputs/1").statusCode()).isEqualTo(404);
        processor.processNext();
        assertThat(other.get("/api/tasks/" + id + "/result").statusCode()).isEqualTo(404);
        assertThat(owner.get("/api/tasks/not-a-task").statusCode()).isEqualTo(404);
    }

    @Test void returnsAcceptedQueuedAndRepeatedQueriesCannotAdvanceIt() throws Exception {
        var owner = new Client(true); owner.upload();
        var response = owner.post("/api/tasks", owner.payload(Map.of("generateDelayMs", 60000)), true);
        assertThat(response.statusCode()).isEqualTo(202);
        var task = body(response); String id = task.get("id").asText();
        assertThat(response.headers().firstValue("location").orElse("")).isEqualTo("/api/tasks/" + id);
        for (int i = 0; i < 4; i++) {
            var read = body(owner.get("/api/tasks/" + id));
            assertThat(read.get("status").asText()).isEqualTo("QUEUED");
            assertThat(read.get("startedAt").isNull()).isTrue();
            assertThat(read.get("stages").get(0).get("status").asText()).isEqualTo("PENDING");
        }
        assertThat(owner.get("/api/tasks/" + id + "/result").statusCode()).isEqualTo(409);
    }

    @Test void succeedsInOrderWithStableTerminalStateAndIndependentInputAndResultFiles() throws Exception {
        var owner = new Client(true); var material = owner.upload();
        String oldUrl = material.get("material").get("contentUrl").asText();
        var task = owner.create(fast(null)); String id = task.get("id").asText();
        owner.deleteDraft(material.get("revision").asLong());
        assertThat(owner.get(oldUrl).statusCode()).isEqualTo(404);
        assertThat(owner.get("/api/tasks/" + id + "/inputs/1").body()).containsExactly(png());
        assertThat(processor.processNext()).isTrue();
        var finished = body(owner.get("/api/tasks/" + id));
        assertThat(finished.get("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(finished.get("resultKind").asText()).isEqualTo("SIMULATED_PRESET");
        String previousEnd = null;
        for (var stage : finished.get("stages")) {
            assertThat(stage.get("status").asText()).isEqualTo("SUCCEEDED");
            assertThat(stage.get("startedAt").isNull()).isFalse();
            assertThat(java.time.Instant.parse(stage.get("finishedAt").asText())).isAfterOrEqualTo(java.time.Instant.parse(stage.get("startedAt").asText()));
            if (previousEnd != null) assertThat(java.time.Instant.parse(stage.get("startedAt").asText())).isAfterOrEqualTo(java.time.Instant.parse(previousEnd));
            previousEnd = stage.get("finishedAt").asText();
        }
        var result = owner.get(finished.get("resultUrl").asText());
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(new String(result.body(), StandardCharsets.UTF_8)).contains("DEMO · SIMULATED RESULT", "未合成上传图片");
        assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store");
        assertThat(Files.exists(DIRECTORY.resolve("tasks").resolve(id).resolve("result.svg"))).isTrue();
        service.fail(id, "LATE_ERROR", "must not replace terminal success");
        assertThat(processor.processNext()).isFalse();
        for (int i=0;i<3;i++) assertThat(body(owner.get("/api/tasks/" + id))).isEqualTo(finished);
    }

    @ParameterizedTest @EnumSource(TaskStage.class)
    void configuredFailureStopsAllLaterStagesAndPersistsTheFailedBoundary(TaskStage failure) throws Exception {
        var owner = new Client(true); owner.upload();
        var task = owner.create(fast(failure)); String id = task.get("id").asText();
        processor.processNext();
        var failed = body(owner.get("/api/tasks/" + id));
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("currentStage").asText()).isEqualTo(failure.name());
        assertThat(failed.get("errorCode").asText()).isEqualTo("SIMULATED_FAILURE");
        assertThat(failed.get("errorMessage").asText()).contains(failure.label());
        assertThat(failed.get("resultUrl").isNull()).isTrue();
        for (int i=0;i<3;i++) {
            var stage = failed.get("stages").get(i);
            assertThat(stage.get("status").asText()).isEqualTo(i < failure.ordinal() ? "SUCCEEDED" : i == failure.ordinal() ? "FAILED" : "SKIPPED");
            if (i > failure.ordinal()) { assertThat(stage.get("startedAt").isNull()).isTrue(); assertThat(stage.get("finishedAt").isNull()).isTrue(); }
            else { assertThat(stage.get("startedAt").isNull()).isFalse(); assertThat(stage.get("finishedAt").isNull()).isFalse(); }
        }
        assertThat(owner.get("/api/tasks/" + id + "/result").statusCode()).isEqualTo(409);
        assertThat(processor.processNext()).isFalse();
        assertThat(body(owner.get("/api/tasks/" + id))).isEqualTo(failed);
    }

    @Test void validatesInputCountSourceRevisionOwnershipAndSimulationBoundsWithoutLeavingPartialTasks() throws Exception {
        var owner = new Client(true); var other = new Client(true); var own = owner.upload(); var foreign = other.upload();
        var input = new HashMap<String,Object>(); input.put("slot", 1); input.put("materialId", foreign.get("material").get("id").asText()); input.put("revision", own.get("revision").asLong());
        assertThat(owner.post("/api/tasks", Map.of("templateId","paper-postcard","inputs",List.of(input)),true).statusCode()).isEqualTo(409);
        input.put("materialId", own.get("material").get("id").asText()); input.put("revision",0);
        assertThat(owner.post("/api/tasks", Map.of("templateId","paper-postcard","inputs",List.of(input)),true).statusCode()).isEqualTo(409);
        assertThat(owner.post("/api/tasks", Map.of("templateId","paper-postcard","inputs",List.of()),true).statusCode()).isEqualTo(400);
        assertThat(owner.post("/api/tasks", Map.of("templateId","travel-duo","inputs",List.of(input)),true).statusCode()).isEqualTo(400);
        input.put("revision", 1);
        assertThat(owner.post("/api/tasks", Map.of("templateId","paper-postcard","inputs",List.of(input,input)),true).statusCode()).isEqualTo(400);
        assertThat(owner.post("/api/tasks", owner.payload(Map.of("checkDelayMs",-1)),true).statusCode()).isEqualTo(400);
        assertThat(owner.post("/api/tasks", owner.payload(Map.of("generateDelayMs",60001)),true).statusCode()).isEqualTo(400);
        assertThat(owner.post("/api/tasks", owner.payload(Map.of("failStage","UNKNOWN")),true).statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM task_jobs",Long.class)).isZero();
        Path tasks = DIRECTORY.resolve("tasks");
        if (Files.exists(tasks)) { try(var list=Files.list(tasks)) { assertThat(list.count()).isZero(); } }
    }

    @Test void workerCompletesWithoutQueriesOrLoggedInBrowserAndSubmissionDoesNotWaitForItsDelays() throws Exception {
        worker.start();
        var owner = new Client(true); owner.upload();
        long start = System.nanoTime();
        var task = owner.create(Map.of("checkDelayMs",1000,"generateDelayMs",1000,"finalizeDelayMs",1000));
        long duration = (System.nanoTime()-start)/1_000_000;
        assertThat(duration).isLessThan(2000);
        String id = task.get("id").asText();
        owner.post("/api/auth/logout",Map.of(),true);
        assertThat(owner.get("/api/tasks/"+id).statusCode()).isEqualTo(401);
        long deadline = System.nanoTime()+10_000_000_000L;
        while (!"SUCCEEDED".equals(jdbc.queryForObject("SELECT status FROM task_jobs WHERE id=?",String.class,id)) && System.nanoTime()<deadline) Thread.sleep(30);
        assertThat(jdbc.queryForObject("SELECT status FROM task_jobs WHERE id=?",String.class,id)).isEqualTo("SUCCEEDED");
        owner.login();
        assertThat(body(owner.get("/api/tasks/"+id)).get("status").asText()).isEqualTo("SUCCEEDED");
    }

    @Test void dualImageTemplateAcceptsExactlyTwoDistinctSlotsAndKeepsTheirSnapshotOrder() throws Exception {
        var owner = new Client(true);
        var first = owner.upload("travel-duo", 1); var second = owner.upload("travel-duo", 2);
        var response = owner.post("/api/tasks", Map.of("templateId", "travel-duo", "simulation", fast(null), "inputs", List.of(
                Map.of("slot", 2, "materialId", second.get("material").get("id").asText(), "revision", 1),
                Map.of("slot", 1, "materialId", first.get("material").get("id").asText(), "revision", 1))), true);
        assertThat(response.statusCode()).isEqualTo(202);
        var task = body(response); String id = task.get("id").asText();
        assertThat(task.get("inputs").size()).isEqualTo(2);
        assertThat(task.get("inputs").get(0).get("slot").asInt()).isEqualTo(1);
        assertThat(task.get("inputs").get(1).get("slot").asInt()).isEqualTo(2);
        processor.processNext();
        assertThat(body(owner.get("/api/tasks/" + id)).get("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(owner.get("/api/tasks/" + id + "/inputs/2").body()).containsExactly(png());
    }

    @Test void queueUsesSubmissionOrderAndDoesNotRerunCompletedJobs() throws Exception {
        var owner = new Client(true); owner.upload();
        String first = owner.create(fast(null)).get("id").asText(); String second = owner.create(fast(null)).get("id").asText();
        assertThat(processor.processNext()).isTrue();
        assertThat(body(owner.get("/api/tasks/"+first)).get("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(body(owner.get("/api/tasks/"+second)).get("status").asText()).isEqualTo("QUEUED");
        assertThat(processor.processNext()).isTrue(); assertThat(processor.processNext()).isFalse();
        var a=body(owner.get("/api/tasks/"+first)); var b=body(owner.get("/api/tasks/"+second));
        assertThat(java.time.Instant.parse(b.get("startedAt").asText())).isAfterOrEqualTo(java.time.Instant.parse(a.get("finishedAt").asText()));
    }

    @Test void startupMarksUnfinishedJobsInterruptedAndLeavesTerminalJobsUntouched() throws Exception {
        var owner = new Client(true); owner.upload();
        String complete = owner.create(fast(null)).get("id").asText(); processor.processNext();
        String running = owner.create(fast(null)).get("id").asText(); service.claim(); service.begin(running,TaskStage.MATERIAL_CHECK);
        String queued = owner.create(fast(null)).get("id").asText();
        worker.start(); worker.stop();
        for (String id : List.of(running,queued)) {
            var interrupted=body(owner.get("/api/tasks/"+id));
            assertThat(interrupted.get("status").asText()).isEqualTo("FAILED");
            assertThat(interrupted.get("errorCode").asText()).isEqualTo("WORKER_INTERRUPTED");
        }
        assertThat(body(owner.get("/api/tasks/"+running)).get("stages").get(0).get("status").asText()).isEqualTo("FAILED");
        assertThat(body(owner.get("/api/tasks/"+queued)).get("stages").get(0).get("status").asText()).isEqualTo("SKIPPED");
        assertThat(body(owner.get("/api/tasks/"+complete)).get("status").asText()).isEqualTo("SUCCEEDED");
    }

    @Test void missingSnapshotFailsMaterialCheckAndSkipsGeneration() throws Exception {
        var owner = new Client(true); owner.upload(); String id=owner.create(fast(null)).get("id").asText();
        Files.delete(DIRECTORY.resolve("tasks").resolve(id).resolve("input-1.png")); processor.processNext();
        var task=body(owner.get("/api/tasks/"+id)); assertThat(task.get("status").asText()).isEqualTo("FAILED");
        assertThat(task.get("stages").get(0).get("status").asText()).isEqualTo("FAILED");
        assertThat(task.get("stages").get(1).get("status").asText()).isEqualTo("SKIPPED");
    }

    @Test void historyIsOwnerScopedNewestFirstAndCanFilterByTemplate() throws Exception {
        var owner = new Client(true); owner.upload();
        String first = owner.create(fast(null)).get("id").asText(); processor.processNext();
        var a = owner.upload("travel-duo", 1); var b = owner.upload("travel-duo", 2);
        var response = owner.post("/api/tasks", Map.of("templateId", "travel-duo", "simulation", fast(TaskStage.SIMULATE_GENERATION), "inputs", List.of(
                Map.of("slot",1,"materialId",a.get("material").get("id").asText(),"revision",1),
                Map.of("slot",2,"materialId",b.get("material").get("id").asText(),"revision",1))), true);
        String second = body(response).get("id").asText(); processor.processNext();
        var other = new Client(true); other.upload(); other.create(fast(null));
        var items = body(owner.get("/api/tasks?owner=999999")).get("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(items.get(0).get("id").asText()).isEqualTo(second);
        assertThat(items.get(0).get("status").asText()).isEqualTo("FAILED");
        assertThat(items.get(0).get("errorMessage").asText()).contains("模拟生成");
        assertThat(items.get(0).get("stages").get(2).get("status").asText()).isEqualTo("SKIPPED");
        assertThat(items.get(1).get("id").asText()).isEqualTo(first);
        assertThat(items.get(1).get("resultUrl").isNull()).isFalse();
        assertThat(body(owner.get("/api/tasks?templateId=paper-postcard")).get("items").size()).isEqualTo(1);
        assertThat(body(owner.get("/api/tasks?templateId=travel-duo")).get("items").get(0).get("id").asText()).isEqualTo(second);
        assertThat(body(other.get("/api/tasks")).get("items").size()).isEqualTo(1);
    }

    @Test void historyDistinguishesEmptyRecordsInvalidFilterMissingTemplateAndUnauthenticatedRequests() throws Exception {
        var guest = new Client(false); assertThat(guest.get("/api/tasks").statusCode()).isEqualTo(401);
        var owner = new Client(true);
        assertThat(body(owner.get("/api/tasks")).get("items").isEmpty()).isTrue();
        assertThat(body(owner.get("/api/tasks?templateId=paper-postcard")).get("items").isEmpty()).isTrue();
        assertThat(owner.get("/api/tasks?templateId=not-present").statusCode()).isEqualTo(404);
        assertThat(owner.get("/api/tasks?templateId=duo%27%20OR%20%271%27%3D%271").statusCode()).isEqualTo(400);
        assertThat(owner.get("/api/tasks?templateId=%20").statusCode()).isEqualTo(200);
    }

    @Test void newSessionRestoresAllUnfinishedRecordsAndHistoryReadsCannotAdvanceThem() throws Exception {
        var owner = new Client(true); owner.upload();
        String running = owner.create(fast(null)).get("id").asText();
        String queued = owner.create(fast(null)).get("id").asText();
        service.claim(); service.begin(running, TaskStage.MATERIAL_CHECK);
        owner.post("/api/auth/logout", Map.of(), true);
        var restored = new Client(false); restored.email = owner.email; restored.login();
        var history = body(restored.get("/api/tasks")); var items = history.get("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(items.get(0).get("id").asText()).isEqualTo(queued);
        assertThat(items.get(0).get("status").asText()).isEqualTo("QUEUED");
        assertThat(items.get(1).get("id").asText()).isEqualTo(running);
        assertThat(items.get(1).get("currentStage").asText()).isEqualTo("MATERIAL_CHECK");
        assertThat(body(restored.get("/api/tasks"))).isEqualTo(history);
    }

    @Test void simultaneousClaimsCannotExecuteOneTaskTwice() throws Exception {
        var owner=new Client(true); owner.upload(); String id=owner.create(Map.of("checkDelayMs",100,"generateDelayMs",100,"finalizeDelayMs",100)).get("id").asText();
        var a=CompletableFuture.supplyAsync(processor::processNext);var b=CompletableFuture.supplyAsync(processor::processNext);
        assertThat(List.of(a.get(),b.get())).containsExactlyInAnyOrder(true,false);
        assertThat(body(owner.get("/api/tasks/"+id)).get("status").asText()).isEqualTo("SUCCEEDED");
    }

    Map<String,Object> fast(TaskStage stage) { var result=new HashMap<String,Object>();result.put("checkDelayMs",0);result.put("generateDelayMs",0);result.put("finalizeDelayMs",0);if(stage!=null)result.put("failStage",stage.name());return result; }
    JsonNode body(HttpResponse<byte[]> response) throws Exception { return json.readTree(response.body()); }
    byte[] png() throws Exception { var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(4,3,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray(); }
    class Client {
        final HttpClient http=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        String email;
        Client(boolean register) throws Exception { if(register) { email="task-"+UUID.randomUUID()+"@example.com";emails.add(email);assertThat(post("/api/auth/register",Map.of("email",email,"password","Module5-test-password"),true).statusCode()).isEqualTo(201); } }
        URI uri(String path) {return URI.create("http://localhost:"+port+path);}
        HttpResponse<byte[]> send(HttpRequest.Builder builder) throws Exception {return http.send(builder.build(),HttpResponse.BodyHandlers.ofByteArray());}
        HttpResponse<byte[]> get(String path) throws Exception {return send(HttpRequest.newBuilder(uri(path)).GET());}
        String csrf() throws Exception {return body(get("/api/auth/csrf")).get("token").asText();}
        HttpResponse<byte[]> post(String path,Object data,boolean csrf) throws Exception {var builder=HttpRequest.newBuilder(uri(path)).header("Content-Type","application/json");if(csrf)builder.header("X-CSRF-TOKEN",csrf());return send(builder.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(data))));}
        void login() throws Exception {assertThat(post("/api/auth/login",Map.of("email",email,"password","Module5-test-password"),true).statusCode()).isEqualTo(200);}
        JsonNode upload() throws Exception { return upload("paper-postcard", 1); }
        JsonNode upload(String template, int slot) throws Exception {
            String boundary="task-boundary-"+UUID.randomUUID();var output=new ByteArrayOutputStream();
            output.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"expectedRevision\"\r\n\r\n0\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            output.write(png());output.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
            var response=send(HttpRequest.newBuilder(uri("/api/templates/" + template + "/materials/" + slot)).header("Content-Type","multipart/form-data; boundary="+boundary).header("X-CSRF-TOKEN",csrf()).PUT(HttpRequest.BodyPublishers.ofByteArray(output.toByteArray())));
            assertThat(response.statusCode()).isEqualTo(200);return body(response);
        }
        void deleteDraft(long revision) throws Exception { assertThat(send(HttpRequest.newBuilder(uri("/api/templates/paper-postcard/materials/1?expectedRevision="+revision)).header("X-CSRF-TOKEN",csrf()).DELETE()).statusCode()).isEqualTo(200); }
        Map<String,Object> payload(Map<String,Object> simulation) throws Exception {
            var slot=body(get("/api/templates/paper-postcard/materials")).get("items").get(0);var result=new HashMap<String,Object>();
            result.put("templateId","paper-postcard");result.put("inputs",List.of(Map.of("slot",1,"materialId",slot.get("material").get("id").asText(),"revision",slot.get("revision").asLong())));if(simulation!=null)result.put("simulation",simulation);return result;
        }
        JsonNode create(Map<String,Object> simulation) throws Exception {var response=post("/api/tasks",payload(simulation),true);assertThat(response.statusCode()).as(new String(response.body(),StandardCharsets.UTF_8)).isEqualTo(202);return body(response);}
    }
}
