package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.inventory.Buildings;

/** Block code ↔ Building id lookups for Auth (Block scope), and Block facts for other modules. */
@Component
class JdbcBlockDirectory implements BlockDirectory, Buildings {

    private final JdbcClient jdbc;

    JdbcBlockDirectory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Long> findIdByCode(String code) {
        return jdbc.sql("SELECT id FROM inv_building WHERE upper(code) = upper(:code)")
                .param("code", code).query(Long.class).optional();
    }

    @Override
    public Map<Long, String> codesByIds(Collection<Long> ids) {
        Map<Long, String> result = new LinkedHashMap<>();
        if (ids == null || ids.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT id, code FROM inv_building WHERE id IN (:ids) ORDER BY code")
                .param("ids", java.util.List.copyOf(ids))
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getString("code")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Set<Long> allActiveIds() {
        return new LinkedHashSet<>(jdbc.sql("SELECT id FROM inv_building WHERE status = 'ACTIVE' ORDER BY code")
                .query(Long.class).list());
    }

    @Override
    public boolean anyActiveBlockFor(String gender) {
        return jdbc.sql("SELECT count(*) FROM inv_building WHERE status = 'ACTIVE' AND gender = :gender")
                .param("gender", gender).query(Long.class).single() > 0;
    }

    @Override
    public Map<Long, String> activeBlocksFor(String gender) {
        Map<Long, String> result = new LinkedHashMap<>();
        jdbc.sql("SELECT id, code FROM inv_building WHERE status = 'ACTIVE' AND gender = :gender ORDER BY code")
                .param("gender", gender)
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getString("code"))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Set<String> gendersOf(Collection<Long> buildingIds) {
        if (buildingIds == null || buildingIds.isEmpty()) {
            return Set.of();
        }
        return new LinkedHashSet<>(jdbc.sql("SELECT DISTINCT trim(gender) FROM inv_building WHERE id IN (:ids)")
                .param("ids", List.copyOf(buildingIds)).query(String.class).list());
    }
}
