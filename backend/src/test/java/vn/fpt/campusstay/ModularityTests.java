package vn.fpt.campusstay;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Fails the build when a module reaches into another module's internals or
 * when modules depend on each other in a cycle (ADR-10). Also writes PlantUML
 * module diagrams to target/spring-modulith-docs (use them in Report 4 §1.2).
 */
class ModularityTests {

    private final ApplicationModules modules = ApplicationModules.of(CampusStayApplication.class);

    @Test
    void moduleBoundariesAreRespected() {
        modules.verify();
    }

    @Test
    void writeModuleDiagrams() {
        new Documenter(modules).writeDocumentation();
    }
}
