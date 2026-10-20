/**
 * AUTH — sign-in (email/password, Google @fpt.edu.vn), opaque sessions, users,
 * roles, Block scope, student directory, password reset and invitations.
 * <p>Public API (this package): {@link vn.fpt.campusstay.auth.CurrentUser},
 * {@link vn.fpt.campusstay.auth.AuthenticatedUser}, {@link vn.fpt.campusstay.auth.Role},
 * {@link vn.fpt.campusstay.auth.BlockScope}, {@link vn.fpt.campusstay.auth.BlockDirectory}
 * and the published events. Everything in sub-packages is internal.
 */
@ApplicationModule(displayName = "AUTH")
package vn.fpt.campusstay.auth;

import org.springframework.modulith.ApplicationModule;
