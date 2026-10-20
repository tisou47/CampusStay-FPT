package vn.fpt.campusstay.auth.internal;

import java.util.ArrayList;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.BlockDirectory;
import vn.fpt.campusstay.auth.Role;

@Component
public class UserViewMapper {

    private final BlockDirectory blocks;

    UserViewMapper(BlockDirectory blocks) {
        this.blocks = blocks;
    }

    public UserView of(AuthenticatedUser user) {
        var codes = user.role() == Role.STAFF || user.role() == Role.MANAGER
                ? new ArrayList<>(blocks.codesByIds(user.blockIds()).values())
                : null;
        return new UserView(user.userId(), user.name(), user.email(), user.role(), user.studentCode(), user.title(),
                codes);
    }
}
