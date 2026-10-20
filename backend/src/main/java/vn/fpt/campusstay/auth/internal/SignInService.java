package vn.fpt.campusstay.auth.internal;

import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.time.TimeConfig;

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
    private final Clock clock;
    /** Hash of a random string; compared against when the email is unknown, to equalise timing. */
    private final String dummyHash;

    public SignInService(AccountStore accounts, SessionService sessions, GoogleIdTokenVerifier google,
            GoogleCodeExchanger googleCodes, PasswordEncoder passwordEncoder, UserRepository users, Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.google = google;
        this.googleCodes = googleCodes;
        this.passwordEncoder = passwordEncoder;
        this.users = users;
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

    /** Web: authorization code from the Google popup, exchanged for an ID token first (ADR-14). */
    public SignInResult signInWithGoogleCode(String code, boolean remember) {
        return signInWithGoogle(googleCodes.exchange(code), remember);
    }

    /** Android (and the web after the code exchange): a Google ID token. */
    public SignInResult signInWithGoogle(String credential, boolean remember) {
        GoogleIdTokenVerifier.GoogleIdentity identity = google.verify(credential);
        UserEntity user = users.findByGoogleSub(identity.subject())
                .or(() -> accounts.findByEmail(identity.email()))
                .orElseThrow(() -> ApiException.forbidden("NO_ACCOUNT",
                        "There is no CampusStay account for this Google account. Contact the dormitory office."));
        if (user.getGoogleSub() != null && !user.getGoogleSub().equals(identity.subject())) {
            throw ApiException.forbidden("GOOGLE_ACCOUNT_MISMATCH",
                    "This account is linked to a different Google account. Contact the dormitory office.");
        }
        checkStatus(user);
        return finish(user.getId(), remember, SessionEntity.Method.GOOGLE,
                user.getGoogleSub() == null ? identity.subject() : null);
    }

    private void checkStatus(UserEntity user) {
        if (user.getStatus() == UserEntity.Status.DISABLED) {
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
