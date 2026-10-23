package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

/**
 * Calls go one way, controller → service → repository / entity (ADR-17, architecture §5): controllers never reach the
 * database themselves, and nothing below the controllers depends on them.
 */
class LayeringTest {

    private static final Path SOURCES = Path.of("src/main/java/vn/fpt/campusstay");

    private static List<String> offenders(String layer, String... forbidden) throws IOException {
        try (Stream<Path> files = Files.walk(SOURCES.resolve(layer))) {
            return files.filter(f -> f.toString().endsWith(".java")).filter(f -> {
                try {
                    String text = Files.readString(f, StandardCharsets.UTF_8);
                    return Stream.of(forbidden).anyMatch(text::contains);
                } catch (IOException e) {
                    throw new IllegalStateException(e);
                }
            }).map(f -> SOURCES.relativize(f).toString()).toList();
        }
    }

    /** Controllers never import repositories, entities or Spring JDBC: they call services only. */
    @Test
    void controllersGoThroughServices() throws IOException {
        assertThat(offenders("controller", "import vn.fpt.campusstay.repository", "import vn.fpt.campusstay.entity",
                "import org.springframework.jdbc.")).isEmpty();
    }

    /** Nothing below the controllers (services, repositories, entities, DTOs, events, common) imports a controller. */
    @Test
    void lowerLayersDoNotDependOnControllers() throws IOException {
        for (String layer : List.of("service", "repository", "entity", "dto", "event", "common")) {
            assertThat(offenders(layer, "import vn.fpt.campusstay.controller")).as(layer).isEmpty();
        }
    }
}
