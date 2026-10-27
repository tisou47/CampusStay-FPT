package vn.fpt.campusstay.controller.setting;

import java.nio.charset.StandardCharsets;

import jakarta.validation.constraints.Size;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.DemoResetService;

/** Admin › System › Reset demo data (demo servers only, {@code DEMO_TOOLS=true}). */
@RestController
class DemoController {

    record ResetRequest(@Size(max = 5) String stage, @Size(max = 20) String confirm) {
    }

    private final DemoResetService demo;

    DemoController(DemoResetService demo) {
        this.demo = demo;
    }

    @GetMapping("/admin/demo")
    DemoResetService.Status status() {
        return demo.status();
    }

    /** A sample file to upload during the demo, made from the stage loaded now. */
    @GetMapping("/admin/demo/files/{kind}")
    ResponseEntity<byte[]> file(@PathVariable String kind) {
        DemoResetService.DemoFile file = demo.file(kind);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.name()).build().toString())
                .body(file.bytes());
    }

    @PostMapping("/admin/demo/reset")
    DemoResetService.Result reset(@RequestBody ResetRequest body) {
        return demo.reset(body.stage(), body.confirm());
    }
}
