package vn.fpt.campusstay.service.billing;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.config.PaymentProperties;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Student › Payments: the student's Invoices, the VietQR payment page and receipts.
 * A student sees only their own Invoices (another student's answers 404); the
 * Admin may open any. Back-office access per Block comes with the Payments screen (S3).
 */
@Service
public class StudentInvoiceService {

    public record InvoiceItem(String id, String type, String typeLabel, String title, String termName, long amount,
            Instant dueAt, String status, Instant paidAt, String paymentMethod, String transferContent) {
    }

    public record Upcoming(String typeLabel, long amount, String note) {
    }

    /**
     * @param awaitingCount Invoices the student said they transferred, waiting for a Manager
     * @param warning       the open Utility debt warning (spec §6.14), null without one
     */
    public record Summary(long outstanding, long dueCount, Instant nextDueAt, long paidTotal, long paidCount,
            Upcoming upcoming, long awaitingCount, UtilityWarning warning) {
    }

    /** @param level {@code Warning} or {@code Final warning}; {@code terminateOn} only for the final one */
    public record UtilityWarning(String level, long debt, int overdue, LocalDate terminateOn, Instant issuedAt) {
    }

    public record InvoicePage(List<InvoiceItem> items, long total, Summary summary) {
    }

    public record Line(String label, long amount) {
    }

    /** {@code room} and {@code breakdown} are filled for Utility Invoices (S6); null otherwise. */
    public record InvoiceDetail(String id, String title, String type, String typeLabel, long amount, String status,
            Instant issuedAt, Instant dueAt, Instant paidAt, String room, long utilityDeposit, List<Line> lines,
            Object breakdown) {
    }

    public record PaymentInvoice(String id, String title, String typeLabel, long amount, String status, Instant dueAt,
            Instant paidAt, String reference) {
    }

    public record Qr(String image, Instant expiresAt) {
    }

    public record Bank(String name, String accountName, String accountNumber) {
    }

    /**
     * @param qr       null when the Invoice is not waiting for a transfer or no bank account is configured
     * @param bank     null when no bank account is configured
     * @param claim    the student's "I have transferred" and its decision, null before any
     * @param canClaim the button "I have transferred" is available
     */
    public record PaymentPage(PaymentInvoice invoice, Qr qr, Bank bank, String transferContent,
            PaymentClaimService.ClaimView claim, boolean canClaim) {
    }

    public record QrRefresh(Qr qr) {
    }

    public record Receipt(String fileName, byte[] pdf) {
    }

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final InvoiceScope scope;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final Parameters parameters;
    private final PaymentProperties payment;
    private final JsonMapper json;
    private final PaymentClaimService claims;
    private final Clock clock;

    public StudentInvoiceService(JdbcClient jdbc, InvoiceStore invoices, InvoiceScope scope, CurrentUser currentUser,
            UserDirectory users, TermCatalog terms, Parameters parameters, PaymentProperties payment, JsonMapper json,
            PaymentClaimService claims, Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.scope = scope;
        this.currentUser = currentUser;
        this.users = users;
        this.terms = terms;
        this.parameters = parameters;
        this.payment = payment;
        this.json = json;
        this.claims = claims;
        this.clock = clock;
    }

    /**
     * @param termId null = every Term; a Term also lists the next-Term fees of the Term whose requests window follows
     *               it, paid while the student still lives in it
     */
    @Transactional(readOnly = true)
    public InvoicePage mine(Long termId, PageQuery page) {
        long student = currentUser.require(Role.STUDENT).userId();
        List<Long> next = termId == null ? List.of() : terms.renewals().stream()
                .filter(r -> r.previousTermId() == termId).map(TermCatalog.Renewal::termId).toList();
        String where = " WHERE student_id = :student" + (termId == null ? "" : next.isEmpty() ? " AND term_id = :term"
                : " AND (term_id = :term OR (type = 'TERM_FEE' AND term_id IN (:next)))");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("student", student);
        if (termId != null) {
            params.put("term", termId);
        }
        if (!next.isEmpty()) {
            params.put("next", next);
        }
        long total = jdbc.sql("SELECT count(*) FROM bil_invoice" + where).params(params).query(Long.class).single();
        List<InvoiceStore.Invoice> rows = jdbc.sql("SELECT " + InvoiceStore.COLUMNS + " FROM bil_invoice" + where
                + " ORDER BY issued_at DESC, id DESC LIMIT :limit OFFSET :offset")
                .params(params).param("limit", page.limit()).param("offset", page.offset())
                .query(InvoiceStore::map).list();
        Map<Long, String> termNames = new LinkedHashMap<>();
        terms.publishedTerms().forEach(t -> termNames.put(t.id(), t.name()));
        List<InvoiceItem> items = rows.stream()
                .map(i -> new InvoiceItem(i.code(), InvoiceLabels.type(i.type()), InvoiceLabels.typeLabel(i.type()),
                        i.title(), termNames.get(i.termId()), i.amount(), i.dueAt(), InvoiceLabels.status(i.status()),
                        i.paidAt(), InvoiceLabels.method(i.paymentMethod()), i.transferContent()))
                .toList();

        List<InvoiceStore.Invoice> all = jdbc.sql("SELECT " + InvoiceStore.COLUMNS + " FROM bil_invoice" + where
                + " ORDER BY due_at, id").params(params).query(InvoiceStore::map).list();
        List<InvoiceStore.Invoice> due = all.stream()
                .filter(i -> i.status().equals("UNPAID") || i.status().equals("OVERDUE")).toList();
        List<InvoiceStore.Invoice> paid = all.stream().filter(i -> i.status().equals("PAID")).toList();
        Upcoming upcoming = all.stream().filter(i -> i.status().equals("UPCOMING")).findFirst()
                .map(i -> new Upcoming(InvoiceLabels.typeLabel(i.type()), i.amount(), "Due " + WHEN.format(i.dueAt())))
                .orElse(null);
        long awaiting = all.stream().filter(i -> i.status().equals("AWAITING_CONFIRMATION")).count();
        Summary summary = new Summary(due.stream().mapToLong(InvoiceStore.Invoice::amount).sum(), due.size(),
                due.isEmpty() ? null : due.getFirst().dueAt(), paid.stream().mapToLong(InvoiceStore.Invoice::amount).sum(),
                paid.size(), upcoming, awaiting, warning(student));
        return new InvoicePage(items, total, summary);
    }

    @Transactional(readOnly = true)
    public InvoiceDetail detail(String idOrCode) {
        InvoiceStore.Invoice i = visible(idOrCode);
        List<Line> lines = i.lines() == null ? null : json.readValue(i.lines(), new TypeReference<List<Line>>() {
        });
        Map<String, Object> breakdown = i.breakdown() == null ? null
                : json.readValue(i.breakdown(), new TypeReference<Map<String, Object>>() {
                });
        return new InvoiceDetail(i.code(), i.title(), InvoiceLabels.type(i.type()), InvoiceLabels.typeLabel(i.type()),
                i.amount(), InvoiceLabels.status(i.status()), i.issuedAt(), i.dueAt(), i.paidAt(),
                breakdown == null ? null : (String) breakdown.get("room"), i.utilityDeposit(), lines, breakdown);
    }

    /** The payment page; the first visit starts the QR validity window. */
    @Transactional
    public PaymentPage payment(String idOrCode) {
        InvoiceStore.Invoice i = visible(idOrCode);
        boolean waiting = i.status().equals("UNPAID") || i.status().equals("OVERDUE");
        Qr qr = null;
        if (waiting && payment.accountConfigured()) {
            Instant expires = i.qrExpiresAt() != null ? i.qrExpiresAt() : startQr(i.id());
            qr = new Qr(qrImage(i), expires);
        }
        boolean canClaim = waiting && currentUser.get().is(Role.STUDENT)
                && (!PaymentClaimService.PLACE_TYPES.contains(i.type()) || Instant.now(clock).isBefore(i.dueAt()));
        return new PaymentPage(new PaymentInvoice(i.code(), i.title(), InvoiceLabels.typeLabel(i.type()), i.amount(),
                InvoiceLabels.status(i.status()), i.dueAt(), i.paidAt(), i.reference()), qr,
                payment.accountConfigured() ? new Bank(payment.bankName(), payment.accountName(), payment.accountNumber())
                        : null,
                i.transferContent(), claims.view(i.id()).orElse(null), canClaim);
    }

    /** A new QR validity window. A transfer after the old one expired is still accepted. */
    @Transactional
    public QrRefresh refresh(String idOrCode) {
        InvoiceStore.Invoice i = visible(idOrCode);
        if (!payment.accountConfigured()) {
            throw ApiException.conflict("NO_BANK_ACCOUNT", "No bank account is configured for transfers yet.");
        }
        if (!i.payable()) {
            throw ApiException.conflict("INVOICE_NOT_PAYABLE", "This Invoice cannot be paid: it is " +
                    InvoiceLabels.status(i.status()).toLowerCase(Locale.ROOT) + ".");
        }
        return new QrRefresh(new Qr(qrImage(i), startQr(i.id())));
    }

    @Transactional(readOnly = true)
    public Receipt receipt(String idOrCode) {
        InvoiceStore.Invoice i = visible(idOrCode);
        if (!i.status().equals("PAID") && !i.status().equals("REFUNDED")) {
            throw ApiException.conflict("NOT_PAID", "A receipt is available once the Invoice is paid.");
        }
        UserDirectory.StudentProfile student = users.studentProfile(i.studentId()).orElse(null);
        String termName = terms.findPublished(i.termId()).map(TermSummary::name).orElse("");
        List<ReceiptPdf.Row> rows = new ArrayList<>();
        rows.add(new ReceiptPdf.Row("Invoice", i.code()));
        rows.add(new ReceiptPdf.Row("For", i.title() + (i.reference() == null ? "" : " (" + i.reference() + ")")));
        rows.add(new ReceiptPdf.Row("Term", termName));
        if (student != null) {
            rows.add(new ReceiptPdf.Row("Student", student.name() + " (" + student.studentCode() + ")"));
        }
        rows.add(new ReceiptPdf.Row("Amount", JdbcBilling.vnd(i.amount())));
        rows.add(new ReceiptPdf.Row("Paid on", WHEN.format(i.paidAt())));
        rows.add(new ReceiptPdf.Row("Method", Objects.requireNonNullElse(InvoiceLabels.method(i.paymentMethod()), "-")));
        rows.add(new ReceiptPdf.Row("Transfer content", i.transferContent()));
        byte[] pdf = ReceiptPdf.render("Payment receipt", rows,
                "Issued by CampusStay FPT on " + WHEN.format(Instant.now(clock)) + ". This receipt confirms the payment above.");
        return new Receipt("receipt-" + i.code() + ".pdf", pdf);
    }

    private UtilityWarning warning(long studentId) {
        return jdbc.sql("""
                SELECT level, debt, overdue_count, terminate_on, issued_at FROM bil_utility_warning
                WHERE student_id = :student AND closed_at IS NULL ORDER BY (level = 'FINAL') DESC, issued_at DESC LIMIT 1
                """).param("student", studentId)
                .query((rs, n) -> new UtilityWarning(rs.getString("level").equals("FINAL") ? "Final warning" : "Warning",
                        rs.getLong("debt"), rs.getInt("overdue_count"), rs.getObject("terminate_on", LocalDate.class),
                        InvoiceStore.instant(rs, "issued_at")))
                .optional().orElse(null);
    }

    private InvoiceStore.Invoice visible(String idOrCode) {
        AuthenticatedUser user = currentUser.get();
        Optional<InvoiceStore.Invoice> invoice = invoices.find(idOrCode);
        if (invoice.isPresent() && (user.is(Role.STUDENT) ? invoice.get().studentId() == user.userId()
                : scope.visible(invoice.get()))) {
            return invoice.get();
        }
        throw ApiException.notFound("This Invoice does not exist.");
    }

    private Instant startQr(long invoiceId) {
        Instant expires = Instant.now(clock).plus(Duration.ofMinutes(parameters.intValue("payment.qr_minutes")));
        jdbc.sql("UPDATE bil_invoice SET qr_expires_at = :at WHERE id = :id")
                .param("at", Timestamp.from(expires)).param("id", invoiceId).update();
        return expires;
    }

    /** VietQR image from SePay's service: account, bank, exact amount and transfer content; it carries no secret. */
    private String qrImage(InvoiceStore.Invoice i) {
        return payment.qrImageUrl() + "?acc=" + encode(payment.accountNumber()) + "&bank=" + encode(payment.bankCode())
                + "&amount=" + i.amount() + "&des=" + encode(i.transferContent()) + "&template=compact";
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
