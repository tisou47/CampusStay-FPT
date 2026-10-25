package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.setting.MatchingCriteria;

@Component
@Transactional(readOnly = true)
class JdbcMatchingCriteria implements MatchingCriteria {

    private static final String COLUMNS = """
            id, label, hard_constraints::text AS hard, criteria_order::text AS criteria, weights::text AS weights, boost
            """;

    private final JdbcClient jdbc;
    private final JsonMapper json;

    JdbcMatchingCriteria(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public Snapshot active() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM cfg_matching_snapshot WHERE active").query(this::map).optional()
                .orElseThrow(() -> new IllegalStateException("No active matching snapshot"));
    }

    @Override
    public Snapshot forTerm(long termId) {
        return jdbc.sql("SELECT matching_snapshot_id FROM cfg_term WHERE id = :id AND matching_snapshot_id IS NOT NULL")
                .param("id", termId).query(Long.class).optional()
                .flatMap(this::byId)
                .orElseGet(this::active);
    }

    @Override
    public Optional<Snapshot> byId(long id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM cfg_matching_snapshot WHERE id = :id").param("id", id)
                .query(this::map).optional();
    }

    private Snapshot map(ResultSet rs, int i) throws SQLException {
        List<String> hard = json.readValue(rs.getString("hard"), new TypeReference<List<String>>() {
        });
        List<Map<String, Object>> order = json.readValue(rs.getString("criteria"),
                new TypeReference<List<Map<String, Object>>>() {
                });
        List<Map<String, Object>> weights = json.readValue(rs.getString("weights"),
                new TypeReference<List<Map<String, Object>>>() {
                });
        return new Snapshot(rs.getLong("id"), rs.getString("label"), hard,
                order.stream().map(o -> new Criterion((String) o.get("key"), (String) o.get("title"))).toList(),
                weights.stream().filter(w -> Boolean.TRUE.equals(w.get("on")))
                        .map(w -> new Weight((String) w.get("key"), (String) w.get("label"),
                                new BigDecimal(String.valueOf(w.get("value")))))
                        .toList(),
                rs.getBigDecimal("boost"));
    }
}
