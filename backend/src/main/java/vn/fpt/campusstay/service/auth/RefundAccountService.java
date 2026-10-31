package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/**
 * The bank account a student's refunds are paid to (A-62): entered by the student when they withdraw from the
 * waitlist or decline a Round-2 offer, or any time on Payments. Refunds the system starts (an expired offer, the end
 * of the waitlist) use the same account.
 */
@Service
public class RefundAccountService implements RefundAccounts {

    /**
     * {@code holder}, {@code number} and {@code bank} are null until the student enters them. {@code bankCode} is the
     * bank's BIN ({@link Banks}), null for a bank typed before the list (R-22) until the student chooses it again;
     * {@code acceptedAt} is when they committed that a wrong account is their responsibility.
     */
    public record Mine(String holder, String number, String bank, String bankCode, Instant acceptedAt,
            Instant updatedAt) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Clock clock;

    public RefundAccountService(JdbcClient jdbc, CurrentUser currentUser, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Mine mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        return jdbc.sql("""
                SELECT refund_account_holder, refund_account_number, refund_bank, refund_bank_bin,
                       refund_account_accepted_at, refund_account_at
                FROM auth_student WHERE user_id = :me
                """).param("me", me)
                .query((rs, i) -> new Mine(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getTimestamp(5) == null ? null : rs.getTimestamp(5).toInstant(),
                        rs.getTimestamp(6) == null ? null : rs.getTimestamp(6).toInstant()))
                .optional().orElse(new Mine(null, null, null, null, null, null));
    }

    /**
     * The account number keeps its digits only; the holder is kept as written (banks match it without accents). The
     * bank is chosen from {@link Banks} by its BIN, and the student accepts that a wrong account is their
     * responsibility (R-22).
     */
    @Transactional
    public Mine save(String holder, String number, String bankCode, Boolean accepted) {
        long me = currentUser.require(Role.STUDENT).userId();
        String name = holder == null ? "" : holder.trim().replaceAll("\\s+", " ");
        String digits = number == null ? "" : number.replaceAll("[\\s.-]", "");
        Banks.Bank bank = Banks.byBin(bankCode).orElse(null);
        FieldErrors errors = new FieldErrors();
        errors.check(name.length() >= 2 && name.length() <= 100, "holder", "Enter the account holder's name.");
        errors.check(digits.matches("\\d{6,20}"), "number", "Enter the account number: 6 to 20 digits.");
        errors.check(bank != null, "bankCode", "Choose the bank from the list.");
        errors.check(Boolean.TRUE.equals(accepted), "accepted",
                "Confirm that you checked the account: a refund sent to a wrong account is your responsibility.");
        errors.throwIfAny();
        Timestamp now = Timestamp.from(Instant.now(clock));
        int updated = jdbc.sql("""
                UPDATE auth_student SET refund_account_holder = :holder, refund_account_number = :number,
                       refund_bank = :bank, refund_bank_bin = :bin, refund_account_accepted_at = :now,
                       refund_account_at = :now
                WHERE user_id = :me
                """).param("holder", name).param("number", digits).param("bank", bank.shortName())
                .param("bin", bank.bin()).param("now", now).param("me", me).update();
        if (updated == 0) {
            throw FieldErrors.single("holder", "Send the sign-up form first.");
        }
        return mine();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Account> of(Collection<Long> studentIds) {
        if (studentIds.isEmpty()) {
            return Map.of();
        }
        record Row(long id, Account account) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT user_id, refund_account_holder, refund_account_number, refund_bank FROM auth_student
                WHERE user_id IN (:ids) AND refund_account_number IS NOT NULL
                """).param("ids", Set.copyOf(studentIds))
                .query((rs, i) -> new Row(rs.getLong(1), new Account(rs.getString(2), rs.getString(3), rs.getString(4))))
                .list();
        return rows.stream().collect(Collectors.toMap(Row::id, Row::account));
    }
}
