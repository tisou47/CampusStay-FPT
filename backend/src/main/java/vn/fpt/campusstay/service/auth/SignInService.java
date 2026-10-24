package vn.fpt.campusstay.service.auth;

import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.entity.SessionEntity;
import vn.fpt.campusstay.entity.UserEntity;
import vn.fpt.campusstay.repository.UserRepository;
import vn.fpt.campusstay.repository.auth.AccountStore;

/**
 * Sign-in by email/password or Google. Not transactional itself: failure
 * bookkeeping must commit even when the request fails (see {@link AccountStore}).
 * <p>Anti-enumeration: an unknown email and a wrong password give the same
 * answer and take about the same time.
 */
@Service
public class SignInService {

    public record SignInResult(String token, AuthenticatedUser user) {
    }

    static final String INVALID = "Email or password is incorrect.";
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm").withZone(TimeConfig.CAMPUS_ZONE);

    private final AccountStore accounts;
    private final SessionService sessions;
    private final GoogleIdTokenVerifier google;
    private final GoogleCodeExchanger googleCodes;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository users;
    private final StudentSignUp signUp;
    private final AuthProperties props;
    private final Clock clock;
    /** Hash of a random string; compared against when the email is unknown, to equalise timing. */
    private final String dummyHash;

    public SignInService(AccountStore accounts, SessionService sessions, GoogleIdTokenVerifier google,
            GoogleCodeExchanger googleCodes, PasswordEncoder passwordEncoder, UserRepository users, StudentSignUp signUp,
            AuthProperties props, Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.google = google;
        this.googleCodes = googleCodes;
        this.passwordEncoder = passwordEncoder;
        this.users = users;
        this.signUp = signUp;
        this.props = props;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode("dummy-" + System.nanoTime());
    }

    public SignInResult signInWithPassword(String email, String password, boolean remember) {
        Optional<UserEntity> found = accounts.findByEmail(email);
        if (found.isEmpty()) {
            passwordEncoder.matches(password, dummyHash);
            throw ApiException.unauthorized("INVALID_CREDENTIALS", INVALID);
        }
        UserEntity user = found.get();
        Instant now = Instant.now(clock);
        if (user.isLockedAt(now)) {
            throw ApiException.unauthorized("ACCOUNT_LOCKED",
                    "Too many failed attempts. Try again after " + HH_MM.format(user.getLockedUntil()) + ".");
        }
        String hash = user.getPasswordHash();
        boolean ok = passwordEncoder.matches(password, hash == null ? dummyHash : hash) && hash != null;
        if (!ok) {
            accounts.recordFailure(user, "PASSWORD");
            throw ApiException.unauthorized("INVALID_CREDENTIALS", INVALID);
        }
        checkStatus(user);
        return finish(user.getId(), remember, SessionEntity.Method.PASSWORD, null);
    }

    /**
     * Web: authorization code from the Google popup, exchanged for an ID token first (ADR-14). When the browser
     * blocked the popup the web used the redirect flow: {@code redirectUri} is then the sign-in page it returned to,
     * and only the web app's own sign-in page is accepted (contract change A-22).
     */
    public SignInResult signInWithGoogleCode(String code, String redirectUri, boolean remember) {
        String page = null;
        if (redirectUri != null && !redirectUri.isBlank()) {
            page = redirectUri.strip();
            if (!page.equals(signInPage())) {
                throw FieldErrors.single("redirectUri", "Google sign-in could not start. Try again.");
            }
        }
        return signInWithGoogle(googleCodes.exchange(code, page), remember);
    }

    /** The web app's sign-in page, where Google's redirect flow returns. */
    private String signInPage() {
        String base = props.webBaseUrl() == null ? "" : props.webBaseUrl().strip();
        return base.replaceAll("/+$", "") + "/signin";
    }

    /**
     * Android (and the web after the code exchange): a Google ID token. An {@code @fpt.edu.vn} account CampusStay
     * does not know yet signs up as a student (ADR-26, {@link StudentSignUp}).
     */
    public SignInResult signInWithGoogle(String credential, boolean remember) {
        GoogleIdTokenVerifier.GoogleIdentity identity = google.verify(credential);
        Optional<UserEntity> found = users.findByGoogleSub(identity.subject())
                .or(() -> accounts.findByEmail(identity.email()));
        if (found.isEmpty()) {
            long id = signUp.signUp(identity);
            UserEntity user = users.findById(id).orElseThrow();
            checkStatus(user);
            return finish(id, remember, SessionEntity.Method.GOOGLE, null);
        }
        UserEntity user = found.get();
        if (user.getGoogleSub() != null && !user.getGoogleSub().equals(identity.subject())) {
            throw ApiException.forbidden("GOOGLE_ACCOUNT_MISMATCH",
                    "This account is linked to a different Google account. Contact the dormitory office.");
        }
        checkStatus(user);
        return finish(user.getId(), remember, SessionEntity.Method.GOOGLE,
                user.getGoogleSub() == null ? identity.subject() : null);
    }

    /** A disabled account cannot sign in; a student account a Manager rejected says why (spec §6.1). */
    private void checkStatus(UserEntity user) {
        if (user.getStatus() == UserEntity.Status.DISABLED) {
            Optional<String> reason = accounts.rejectionReason(user.getId());
            if (reason.isPresent()) {
                throw ApiException.forbidden("ACCOUNT_REJECTED", "Your student account was not verified: "
                        + reason.get().replaceAll("[.\\s]+$", "") + ". Contact the dormitory office.");
            }
            throw ApiException.forbidden("ACCOUNT_DISABLED", "This account is disabled. Contact the dormitory office.");
        }
    }

    private SignInResult finish(long userId, boolean remember, SessionEntity.Method method, String googleSub) {
        accounts.recordSuccess(userId, method.name(), googleSub);
        SessionService.NewSession session = sessions.create(userId, remember, method);
        AuthenticatedUser user = sessions.authenticate(session.token())
                .orElseThrow(() -> new IllegalStateException("New session could not be resolved"));
        return new SignInResult(session.token(), user);
    }
}
