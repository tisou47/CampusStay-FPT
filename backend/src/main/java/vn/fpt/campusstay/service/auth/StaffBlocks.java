package vn.fpt.campusstay.service.auth;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;

/** The Blocks a Staff member works in ({@code auth_user_block}) and their staff profile, for Admin › Users and Manager › Staff accounts. */
@Component
class StaffBlocks {

    private final JdbcClient jdbc;
    private final BlockDirectory blocks;
    private final List<StaffWork> works;
    private final AuditLog audit;

    StaffBlocks(JdbcClient jdbc, BlockDirectory blocks, List<StaffWork> works, AuditLog audit) {
        this.jdbc = jdbc;
        this.blocks = blocks;
        this.works = works;
        this.audit = audit;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void replace(long userId, Set<Long> blockIds) {
        jdbc.sql("DELETE FROM auth_user_block WHERE user_id = :id").param("id", userId).update();
        for (Long blockId : blockIds) {
            jdbc.sql("INSERT INTO auth_user_block (user_id, building_id) VALUES (:id, :block)")
                    .param("id", userId).param("block", blockId).update();
        }
        releaseWork(userId, blockIds, "the person no longer works in this Block");
    }

    /**
     * The person's open items outside {@code keepBlocks} go back to their Block's queue, audited one by one, so no
     * work is left with someone who cannot reach it (BE-3RD-01). Disabling passes no Blocks.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    void releaseWork(long userId, Set<Long> keepBlocks, String why) {
        for (StaffWork work : works) {
            for (StaffWork.Item item : work.openItems(userId)) {
                if (keepBlocks.contains(item.buildingId())) {
                    continue;
                }
                work.release(item.type(), Long.parseLong(item.id()), why);
                audit.record("WORK_RELEASED", AuditLog.Tone.WARNING, BlockStaffService.TYPE_LABELS.get(item.type()),
                        item.id(), item.code(), Map.of("from", userId, "note", why));
            }
        }
    }

    /** What the person handles and whether they are on duty: set later by a Manager (Block staff). */
    @Transactional(propagation = Propagation.MANDATORY)
    void ensureProfile(long userId) {
        jdbc.sql("INSERT INTO auth_staff_profile (user_id) VALUES (:id) ON CONFLICT (user_id) DO NOTHING")
                .param("id", userId).update();
    }

    /** Block codes of each user, in Block code order. */
    Map<Long, List<String>> codesByUser(Collection<Long> userIds) {
        Map<Long, List<String>> result = new HashMap<>();
        if (userIds.isEmpty()) {
            return result;
        }
        List<long[]> pairs = jdbc.sql("SELECT user_id, building_id FROM auth_user_block WHERE user_id IN (:ids)")
                .param("ids", List.copyOf(userIds))
                .query((rs, i) -> new long[] { rs.getLong("user_id"), rs.getLong("building_id") })
                .list();
        Map<Long, String> codes = blocks.codesByIds(pairs.stream().map(p -> p[1]).toList());
        // codesByIds is in Block code order, so each user's list comes out sorted.
        for (Map.Entry<Long, String> block : codes.entrySet()) {
            for (long[] p : pairs) {
                if (p[1] == block.getKey()) {
                    result.computeIfAbsent(p[0], k -> new ArrayList<>()).add(block.getValue());
                }
            }
        }
        return result;
    }
}
