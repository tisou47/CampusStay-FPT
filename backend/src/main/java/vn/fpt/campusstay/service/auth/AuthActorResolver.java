package vn.fpt.campusstay.service.auth;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.ActorResolver;

/** Implements the shared kernel's {@link ActorResolver} port. */
@Component
class AuthActorResolver implements ActorResolver {

    private final CurrentUser currentUser;

    AuthActorResolver(CurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    @Override
    public Actor currentActor() {
        return currentUser.find().map(u -> new Actor(u.userId(), u.name())).orElse(Actor.SYSTEM);
    }
}
