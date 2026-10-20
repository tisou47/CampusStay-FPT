package vn.fpt.campusstay.inv.internal;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.auth.BlockDirectory;

/** Block code ↔ Building id lookups for AUTH (Block scope) and other modules. */
@Component
class JdbcBlockDirectory implements BlockDirectory {

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
}
