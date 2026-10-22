package vn.fpt.campusstay.service.auth;

import java.util.ArrayList;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.Role;

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
        return new UserView(String.valueOf(user.userId()), user.name(), user.email(), user.role(), user.studentCode(), user.title(),
                codes);
    }
}
