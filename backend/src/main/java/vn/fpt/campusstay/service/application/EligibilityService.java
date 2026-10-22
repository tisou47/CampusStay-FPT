package vn.fpt.campusstay.service.application;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.EligibilityRules;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Buildings;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.repository.application.ApplicationStore;

/**
 * Who may apply (Admin › Eligibility Rules) for the Term open for registration.
 * Every switched-on criterion must pass, except "contact details complete": the
 * student fills those in on the wizard's Personal info step and the Application
 * itself requires them.
 */
@Service
public class EligibilityService {

    public record Check(String title, String detail, boolean passed) {
    }

    public record Eligibility(TermView term, boolean eligible, List<Check> checks) {
    }

    /** Result of the checks for one student and Term. */
    record Result(TermSummary term, boolean eligible, List<Check> checks) {

        String reasons() {
            return String.join(" ", checks.stream().filter(c -> !c.passed()).map(Check::detail).toList());
        }
    }

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final String CONTACT_COMPLETE = "CONTACT_COMPLETE";

    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final EligibilityRules rules;
    private final ApplicationStore applications;
    private final Billing billing;
    private final Buildings buildings;

    public EligibilityService(CurrentUser currentUser, UserDirectory users, TermCatalog terms, EligibilityRules rules,
            ApplicationStore applications, Billing billing, Buildings buildings) {
        this.currentUser = currentUser;
        this.users = users;
        this.terms = terms;
        this.rules = rules;
        this.applications = applications;
        this.billing = billing;
        this.buildings = buildings;
    }

    /** @param termId the Term the app shows; null = the Term open for registration */
    @Transactional(readOnly = true)
    public Eligibility forCurrentStudent(Long termId) {
        long student = currentUser.require(Role.STUDENT).userId();
        Result r = check(student, registrationTerm(termId).orElse(null));
        return new Eligibility(TermView.of(r.term()), r.eligible(), r.checks());
    }

    /** The Term asked for (must be published), or else the one open for registration. */
    Optional<TermSummary> registrationTerm(Long termId) {
        if (termId != null) {
            return Optional.of(terms.findPublished(termId)
                    .orElseThrow(() -> ApiException.notFound("This Term does not exist.")));
        }
        return terms.openForRegistration();
    }

    Result check(long studentId, TermSummary term) {
        return check(studentId, term, null);
    }

    /**
     * The checks again at Staff review: the registration window no longer matters and the Application
     * under review does not count as "another live Application".
     */
    List<Check> reviewChecks(long studentId, TermSummary term, long applicationId) {
        return check(studentId, term, applicationId).checks();
    }

    private Result check(long studentId, TermSummary term, Long reviewedApplicationId) {
        List<Check> checks = new ArrayList<>();
        boolean eligible = true;
        boolean applying = reviewedApplicationId == null; // at review time registration may have closed
        if (applying && (term == null || !term.registrationOpen())) {
            checks.add(new Check("Registration is open", term == null ? "No Term is open for registration now."
                    : "Registration for " + term.name() + " is not open.", false));
            eligible = false;
        } else if (applying) {
            checks.add(new Check("Registration is open",
                    term.name() + " registration closes on " + WHEN.format(term.registrationClosesAt()) + ".", true));
        }
        UserDirectory.StudentProfile profile = users.studentProfile(studentId)
                .orElseThrow(() -> ApiException.forbidden("NO_STUDENT_RECORD",
                        "Your student record was not found. Contact the dormitory office."));
        for (EligibilityRules.Criterion c : rules.enabled()) {
            Check check = switch (c.key()) {
                case "ENROLLED" -> new Check(c.title(), profile.enrollmentStatus().equals("ENROLLED") ? c.note()
                        : "Your enrollment status is " + profile.enrollmentStatus().toLowerCase(Locale.ROOT) + ".",
                        profile.enrollmentStatus().equals("ENROLLED"));
                case "ONE_APPLICATION" -> {
                    var live = term == null ? Optional.<ApplicationStore.Application>empty()
                            : applications.live(studentId, term.id())
                                    .filter(a -> !Long.valueOf(a.id()).equals(reviewedApplicationId));
                    yield new Check(c.title(), live.map(a -> "You already have Application " + a.code()
                            + " for this Term.").orElse(c.note()), live.isEmpty());
                }
                case "NO_OVERDUE_INVOICE" -> {
                    boolean overdue = billing.hasOverdueInvoice(studentId);
                    yield new Check(c.title(), overdue ? "Pay your overdue Invoice first." : c.note(), !overdue);
                }
                case "GENDER_CAPACITY" -> {
                    boolean any = buildings.anyActiveBlockFor(profile.gender());
                    yield new Check(c.title(), any ? c.note() : "No Block is open for your gender this Term.", any);
                }
                case CONTACT_COMPLETE -> {
                    boolean complete = hasText(profile.phone()) && hasText(profile.emergencyName())
                            && hasText(profile.emergencyPhone());
                    yield new Check(c.title(), complete ? c.note()
                            : "Add your phone and emergency contact on the Personal info step.", complete);
                }
                default -> null;
            };
            if (check == null) {
                continue;
            }
            checks.add(check);
            if (!check.passed() && !c.key().equals(CONTACT_COMPLETE)) {
                eligible = false;
            }
        }
        return new Result(term, eligible, checks);
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
