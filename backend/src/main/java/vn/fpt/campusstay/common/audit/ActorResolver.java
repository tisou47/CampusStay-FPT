package vn.fpt.campusstay.common.audit;

/**
 * Port implemented by Auth: returns the signed-in user, or {@link Actor#SYSTEM}
 * outside a request (scheduled jobs). Keeps the shared kernel independent of Auth.
 */
public interface ActorResolver {

    Actor currentActor();
}
