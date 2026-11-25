package vn.fpt.campusstay.regression;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.util.UriComponentsBuilder;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;

/** Review finding BE-PLT-12: the signed file link is a security boundary without a bearer token. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class FileLinksRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    FileStore files;

    @Autowired
    FileLinks links;

    @Autowired
    TransactionTemplate tx;

    private long store() {
        return tx.execute(s -> files.store("mnt", "photo.png", RegressionSupport.PNG, FileStore.IMAGES_AND_PDF, null).id());
    }

    private String path(long id) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        try {
            URI uri = URI.create(links.link(id));
            return uri.getRawPath().replaceFirst("^/api", "") + "?" + uri.getRawQuery();
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** TC-MNT-015: a signed link opens the file with nosniff; a changed sig, another id or a past exp is 404. */
    @Test
    void signedLinksAreCheckedStrictly() throws Exception {
        long id = store();
        long other = store();
        String good = path(id);
        mvc.perform(get(good)).andExpect(status().isOk()).andExpect(header().string("X-Content-Type-Options", "nosniff"));

        var q = UriComponentsBuilder.fromUriString(good).build().getQueryParams();
        String sig = q.getFirst("sig");
        String exp = q.getFirst("exp");
        String tampered = sig.charAt(0) == 'A' ? "B" + sig.substring(1) : "A" + sig.substring(1);
        mvc.perform(get("/files/" + id).param("exp", exp).param("sig", tampered)).andExpect(status().isNotFound());
        mvc.perform(get("/files/" + other).param("exp", exp).param("sig", sig)).andExpect(status().isNotFound());
        String past = String.valueOf(Instant.now().minusSeconds(60).getEpochSecond());
        mvc.perform(get("/files/" + id).param("exp", past).param("sig", sig)).andExpect(status().isNotFound());
        mvc.perform(get("/files/" + id)).andExpect(status().isNotFound());
    }

    /** TC-MNT-301: BE-PLT-16: an inline file is sandboxed, so nothing in it runs on the API origin. */
    @Test
    void inlineFilesAreSandboxed() throws Exception {
        mvc.perform(get(path(store()))).andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", "sandbox; default-src 'none'"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }
}
