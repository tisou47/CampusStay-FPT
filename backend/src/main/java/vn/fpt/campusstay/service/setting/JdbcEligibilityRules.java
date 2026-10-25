package vn.fpt.campusstay.service.setting;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Component
@Transactional(readOnly = true)
class JdbcEligibilityRules implements EligibilityRules {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    JdbcEligibilityRules(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<Criterion> enabled() {
        return jdbc.sql("""
                SELECT key, title, note FROM cfg_eligibility_criterion WHERE enabled ORDER BY sort_order, key
                """)
                .query((rs, i) -> new Criterion(rs.getString("key"), rs.getString("title"), rs.getString("note")))
                .list();
    }

    @Override
    public List<Criterion> enabled(long termId) {
        Optional<List<String>> keys = snapshot(termId, "eligibility_keys");
        if (keys.isEmpty()) {
            return enabled();
        }
        return jdbc.sql("""
                SELECT key, title, note FROM cfg_eligibility_criterion WHERE key IN (:keys) ORDER BY sort_order, key
                """)
                .param("keys", keys.get().isEmpty() ? List.of("") : keys.get())
                .query((rs, i) -> new Criterion(rs.getString("key"), rs.getString("title"), rs.getString("note")))
                .list();
    }

    @Override
    public List<String> priorityGroupKeys() {
        return jdbc.sql("SELECT key FROM cfg_priority_group WHERE applied ORDER BY sort_order, id")
                .query(String.class).list();
    }

    @Override
    public List<String> priorityGroupKeys(long termId) {
        return snapshot(termId, "priority_group_keys").orElseGet(this::priorityGroupKeys);
    }

    /** A JSON list the Term was published with; empty for Drafts and Terms published before V42. */
    private Optional<List<String>> snapshot(long termId, String column) {
        return jdbc.sql("SELECT " + column + "::text FROM cfg_term WHERE id = :id AND " + column + " IS NOT NULL")
                .param("id", termId).query(String.class).optional()
                .map(text -> json.readValue(text, new TypeReference<List<String>>() {
                }));
    }
}
