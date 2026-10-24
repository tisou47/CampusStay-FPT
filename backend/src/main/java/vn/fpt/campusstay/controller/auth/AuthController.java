package vn.fpt.campusstay.controller.auth;

import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.service.auth.AccountService;
import vn.fpt.campusstay.service.auth.PasswordService;
import vn.fpt.campusstay.service.auth.SessionService;
import vn.fpt.campusstay.service.auth.SignInService;
import vn.fpt.campusstay.service.auth.UserView;
import vn.fpt.campusstay.service.auth.UserViewMapper;
import vn.fpt.campusstay.exception.ApiException;

/** Session endpoints of the API contract plus the Google and password additions (see API contract changes). */
@RestController
@RequestMapping("/auth")
class AuthController {

    // "remember" is optional (missing = false). It is a Boolean because Jackson 3 rejects a missing primitive.
    record SignInRequest(
            @NotBlank(message = "Enter your email.") @Email(message = "Enter a valid email.") @Size(max = 254) String email,
            @NotBlank(message = "Enter your password.") @Size(max = 128) String password,
            Boolean remember) {
    }

    /**
     * Exactly one of {@code code} (web) and {@code credential} (Android ID token), ADR-14. {@code redirectUri}: the
     * sign-in page, only when the web used Google's redirect flow because the popup was blocked (A-22).
     */
    record GoogleSignInRequest(@Size(max = 4096) String code, @Size(max = 4096) String credential,
            @Size(max = 500) String redirectUri, Boolean remember) {
    }

    record SignInResponse(String token, UserView user) {
    }

    record ForgotPasswordRequest(@NotBlank(message = "Enter your email.") @Email @Size(max = 254) String email) {
    }

    record ResetPasswordRequest(@NotBlank @Size(max = 100) String token,
            @NotBlank(message = "Enter a new password.") @Size(max = 128) String newPassword) {
    }

    record SetPasswordRequest(@NotBlank(message = "Enter a new password.") @Size(max = 128) String newPassword) {
    }

    record ChangePasswordRequest(@NotBlank(message = "Enter your current password.") @Size(max = 128) String currentPassword,
            @NotBlank(message = "Enter a new password.") @Size(max = 128) String newPassword) {
    }

    /** {@code vi} or {@code en} (ADR-25). */
    record LocaleRequest(@NotBlank(message = "Choose vi or en.") @Size(max = 10) String locale) {
    }

    private final SignInService signIn;
    private final SessionService sessions;
    private final PasswordService passwords;
    private final AccountService accounts;
    private final CurrentUser currentUser;
    private final UserViewMapper views;

    AuthController(SignInService signIn, SessionService sessions, PasswordService passwords, AccountService accounts,
            CurrentUser currentUser, UserViewMapper views) {
        this.signIn = signIn;
        this.sessions = sessions;
        this.passwords = passwords;
        this.accounts = accounts;
        this.currentUser = currentUser;
        this.views = views;
    }

    @PostMapping("/sign-in")
    SignInResponse signIn(@Valid @RequestBody SignInRequest body) {
        var result = signIn.signInWithPassword(body.email(), body.password(), Boolean.TRUE.equals(body.remember()));
        return new SignInResponse(result.token(), views.of(result.user()));
    }

    @PostMapping("/google")
    SignInResponse google(@Valid @RequestBody GoogleSignInRequest body) {
        boolean hasCode = StringUtils.hasText(body.code());
        if (hasCode == StringUtils.hasText(body.credential())) {
            throw ApiException.badRequest("VALIDATION_FAILED", "Google sign-in could not start. Try again.",
                    Map.of("fields", Map.of("code", "Send either the Google authorization code or the ID token.")));
        }
        boolean remember = Boolean.TRUE.equals(body.remember());
        var result = hasCode ? signIn.signInWithGoogleCode(body.code(), body.redirectUri(), remember)
                : signIn.signInWithGoogle(body.credential(), remember);
        return new SignInResponse(result.token(), views.of(result.user()));
    }

    @PostMapping("/sign-out")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void signOut() {
        sessions.revoke(currentUser.get().sessionId());
    }

    @GetMapping("/me")
    UserView me() {
        AuthenticatedUser user = currentUser.get();
        return views.of(user);
    }

    /** The account's language for notifications, push and emails (ADR-25, contract change B-04). */
    @PutMapping("/me/locale")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void locale(@Valid @RequestBody LocaleRequest body) {
        accounts.setLocale(body.locale());
    }

    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void forgot(@Valid @RequestBody ForgotPasswordRequest body) {
        passwords.requestReset(body.email());
    }

    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reset(@Valid @RequestBody ResetPasswordRequest body) {
        passwords.resetWithToken(body.token(), body.newPassword());
    }

    /** The first password of an account created by Google sign-up (ADR-26, contract change A-17). */
    @PostMapping("/password/set")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void setFirst(@Valid @RequestBody SetPasswordRequest body) {
        passwords.setFirst(currentUser.get(), body.newPassword());
    }

    @PostMapping("/password/change")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void change(@Valid @RequestBody ChangePasswordRequest body) {
        passwords.change(currentUser.get(), body.currentPassword(), body.newPassword());
    }
}
