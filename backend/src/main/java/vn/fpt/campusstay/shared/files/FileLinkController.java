package vn.fpt.campusstay.shared.files;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.shared.error.ApiException;

/**
 * {@code GET /files/{id}?exp&sig}: a stored file through a link from
 * {@link FileLinks}. No bearer token: the signature is the permission. See
 * {@link FileLinkSecurity}.
 */
@RestController
class FileLinkController {

    private final FileStore files;
    private final FileLinks links;

    FileLinkController(FileStore files, FileLinks links) {
        this.files = files;
        this.links = links;
    }

    @GetMapping("/files/{id}")
    ResponseEntity<byte[]> file(@PathVariable long id, @RequestParam(required = false) Long exp,
            @RequestParam(required = false) String sig) {
        if (exp == null || sig == null || !links.valid(id, exp, sig)) {
            throw ApiException.notFound("This link has expired. Reload the page to get a new one.");
        }
        FileStore.FileContent file = files.read(id)
                .orElseThrow(() -> ApiException.notFound("This file does not exist."));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.file().contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(file.file().name()).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(file.bytes());
    }
}
