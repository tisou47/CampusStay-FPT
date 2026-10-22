package vn.fpt.campusstay.service.setting;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.Lookups;

@Component
@Transactional(readOnly = true)
class JdbcLookups implements Lookups {

    private final JdbcClient jdbc;

    JdbcLookups(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Lookup> list(String listKey) {
        return jdbc.sql("""
                SELECT code, label FROM cfg_lookup WHERE list_key = :list AND active ORDER BY sort_order, label
                """)
                .param("list", listKey)
                .query((rs, i) -> new Lookup(rs.getString("code"), rs.getString("label")))
                .list();
    }

    @Override
    public Optional<Lookup> find(String listKey, String codeOrLabel) {
        if (codeOrLabel == null || codeOrLabel.isBlank()) {
            return Optional.empty();
        }
        String value = codeOrLabel.trim();
        return list(listKey).stream()
                .filter(l -> l.code().equalsIgnoreCase(value) || l.label().equalsIgnoreCase(value))
                .findFirst();
    }
}
