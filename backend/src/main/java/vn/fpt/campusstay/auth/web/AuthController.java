package vn.fpt.campusstay.auth.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.internal.PasswordService;
import vn.fpt.campusstay.auth.internal.SessionService;
import vn.fpt.campusstay.auth.internal.SignInService;
import vn.fpt.campusstay.auth.internal.UserView;
import vn.fpt.campusstay.auth.internal.UserViewMapper;

/** Session endpoints of the API contract plus the Google and password additions (see API contract changes). */
@RestController
@RequestMapping("/auth")
class AuthController {

    record SignInRequest(
            @NotBlank(message = "Enter your email.") @Email(message = "Enter a valid email.") @Size(max = 254) String email,
            @NotBlank(message = "Enter your password.") @Size(max = 128) String password,
            boolean remember) {
    }

    record GoogleSignInRequest(@NotBlank @Size(max = 4096) String credential, boolean remember) {
    }

    record SignInResponse(String token, UserView user) {
    }

    record ForgotPasswordRequest(@NotBlank(message = "Enter your email.") @Email @Size(max = 254) String email) {
    }

    record ResetPasswordRequest(@NotBlank @Size(max = 100) String token,
            @NotBlank(message = "Enter a new password.") @Size(max = 128) String newPassword) {
    }

    record ChangePasswordRequest(@NotBlank(message = "Enter your current password.") @Size(max = 128) String currentPassword,
            @NotBlank(message = "Enter a new password.") @Size(max = 128) String newPassword) {
    }

    private final SignInService signIn;
    private final SessionService sessions;
    private final PasswordService passwords;
    private final CurrentUser currentUser;
    private final UserViewMapper views;

    AuthController(SignInService signIn, SessionService sessions, PasswordService passwords, CurrentUser currentUser,
            UserViewMapper views) {
        this.signIn = signIn;
        this.sessions = sessions;
        this.passwords = passwords;
        this.currentUser = currentUser;
        this.views = views;
    }

    @PostMapping("/sign-in")
    SignInResponse signIn(@Valid @RequestBody SignInRequest body) {
        var result = signIn.signInWithPassword(body.email(), body.password(), body.remember());
        return new SignInResponse(result.token(), views.of(result.user()));
    }

    @PostMapping("/google")
    SignInResponse google(@Valid @RequestBody GoogleSignInRequest body) {
        var result = signIn.signInWithGoogle(body.credential(), body.remember());
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

    @PostMapping("/password/change")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void change(@Valid @RequestBody ChangePasswordRequest body) {
        passwords.change(currentUser.get(), body.currentPassword(), body.newPassword());
    }
}
