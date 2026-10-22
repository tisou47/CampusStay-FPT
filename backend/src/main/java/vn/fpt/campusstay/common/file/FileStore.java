package vn.fpt.campusstay.common.file;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.Tokens;

/**
 * Uploaded files (receipts, photos): stored under random keys in a directory
 * outside the web root ({@code campusstay.files.dir}) and served only through
 * endpoints that check access (architecture §8.3). The type comes from the
 * file's first bytes, never from its name.
 */
@Service
public class FileStore {

    public static final Set<String> IMAGES_AND_PDF = Set.of("image/jpeg", "image/png", "application/pdf");
    public static final Set<String> IMAGES = Set.of("image/jpeg", "image/png");

    public record StoredFile(long id, String name, String contentType, long size) {
    }

    public record FileContent(StoredFile file, byte[] bytes) {
    }

    private final JdbcClient jdbc;
    private final Path root;

    public FileStore(JdbcClient jdbc, @Value("${campusstay.files.dir:data/files}") String dir) {
        this.jdbc = jdbc;
        this.root = Path.of(dir).toAbsolutePath();
    }

    /** Stores the bytes in the caller's transaction; the file stays on disk if it rolls back (harmless orphan). */
    @Transactional(propagation = Propagation.MANDATORY)
    public StoredFile store(String ownerModule, String originalName, byte[] bytes, Set<String> allowed, Long createdBy) {
        String type = sniff(bytes);
        if (type == null || !allowed.contains(type)) {
            throw ApiException.badRequest("FILE_TYPE_NOT_ALLOWED", allowed.contains("application/pdf")
                    ? "Attach a JPEG, PNG or PDF file." : "Attach JPEG or PNG photos.");
        }
        String key = Tokens.newToken();
        try {
            Files.createDirectories(root);
            Files.write(root.resolve(key), bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store an uploaded file", e);
        }
        String name = cleanName(originalName, type);
        long id = jdbc.sql("""
                INSERT INTO shared_file (storage_key, original_name, content_type, size_bytes, sha256, owner_module, created_by)
                VALUES (:key, :name, :type, :size, :sha, :owner, :by) RETURNING id
                """)
                .param("key", key).param("name", name).param("type", type).param("size", bytes.length)
                .param("sha", sha256(bytes))
                .param("owner", ownerModule).param("by", createdBy)
                .query(Long.class).single();
        return new StoredFile(id, name, type, bytes.length);
    }

    @Transactional(readOnly = true)
    public Optional<StoredFile> info(long id) {
        return jdbc.sql("SELECT id, original_name, content_type, size_bytes FROM shared_file WHERE id = :id")
                .param("id", id)
                .query((rs, i) -> new StoredFile(rs.getLong("id"), rs.getString("original_name"),
                        rs.getString("content_type"), rs.getLong("size_bytes")))
                .optional();
    }

    @Transactional(readOnly = true)
    public Optional<FileContent> read(long id) {
        return jdbc.sql("SELECT storage_key FROM shared_file WHERE id = :id").param("id", id).query(String.class)
                .optional()
                .flatMap(key -> info(id).map(file -> {
                    try {
                        return new FileContent(file, Files.readAllBytes(root.resolve(key)));
                    } catch (IOException e) {
                        throw new UncheckedIOException("Stored file " + id + " is missing", e);
                    }
                }));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    static String sniff(byte[] b) {
        if (b == null || b.length < 4) {
            return null;
        }
        if ((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if ((b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F') {
            return "application/pdf";
        }
        return null;
    }

    /** Keeps a readable name without path parts or control characters. */
    private static String cleanName(String name, String type) {
        String base = name == null ? "" : name.replaceAll(".*[/\\\\]", "").replaceAll("[\\p{Cntrl}\"]", "").trim();
        if (base.isEmpty()) {
            base = "file" + switch (type) {
                case "image/jpeg" -> ".jpg";
                case "image/png" -> ".png";
                default -> ".pdf";
            };
        }
        return base.length() <= 200 ? base : base.substring(base.length() - 200);
    }
}
