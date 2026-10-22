package vn.fpt.campusstay.service.setting;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.EligibilityRules;

@Component
@Transactional(readOnly = true)
class JdbcEligibilityRules implements EligibilityRules {

    private final JdbcClient jdbc;

    JdbcEligibilityRules(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
    public List<String> priorityGroupKeys() {
        return jdbc.sql("SELECT key FROM cfg_priority_group WHERE applied ORDER BY sort_order, id")
                .query(String.class).list();
    }
}
