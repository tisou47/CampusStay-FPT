/**
 * NTF — in-app notifications, FCM push, templates, email outbox and campaigns.
 * <p>Other modules publish domain events; NTF listens and turns them into
 * notifications and emails. Email always goes through the outbox table so it is
 * committed together with the business change and retried on failure.
 */
@ApplicationModule(displayName = "NTF")
package vn.fpt.campusstay.ntf;

import org.springframework.modulith.ApplicationModule;
