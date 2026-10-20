package vn.fpt.campusstay.shared.audit;

/**
 * Port implemented by AUTH: returns the signed-in user, or {@link Actor#SYSTEM}
 * outside a request (scheduled jobs). Keeps the shared kernel independent of AUTH.
 */
public interface ActorResolver {

    Actor currentActor();
}
