package vn.fpt.campusstay.security;

import java.util.Set;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.auth.BlockDirectory;

/**
 * Enforces Block scope (contract: "the server enforces the user's scope"). Staff see their own Blocks;
 * Managers (ADR-19) and the Admin see every active Block: a Manager's session carries all of them.
 * Every Staff/Manager endpoint that takes {@code block} must call {@link #resolve}.
 */
@Component
public class BlockScope {

    private final CurrentUser currentUser;
    private final BlockDirectory blocks;

    public BlockScope(CurrentUser currentUser, BlockDirectory blocks) {
        this.currentUser = currentUser;
        this.blocks = blocks;
    }

    /**
     * @param blockCode the {@code block} parameter; blank = every Block the user may see
     */
    public BlockSelection resolve(String blockCode) {
        AuthenticatedUser user = currentUser.get();
        if (!user.role().isBackOffice()) {
            throw ApiException.forbidden("FORBIDDEN", "You do not have permission to do this.");
        }
        boolean admin = user.is(Role.ADMIN);
        if (blockCode != null && !blockCode.isBlank()) {
            long id = blocks.findIdByCode(blockCode.trim())
                    .orElseThrow(() -> ApiException.notFound("Block " + blockCode.trim() + " does not exist."));
            if (!admin && !user.blockIds().contains(id)) {
                throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to Block " + blockCode.trim() + ".");
            }
            return new BlockSelection(Set.of(id), true);
        }
        Set<Long> ids = admin ? blocks.allActiveIds() : user.blockIds();
        if (ids.isEmpty()) {
            throw ApiException.forbidden("NO_BLOCK", "No Block is assigned to your account. Contact the administrator.");
        }
        return new BlockSelection(Set.copyOf(ids), ids.size() == 1);
    }

    /** Fails unless the user may act on the given Building. */
    public void check(long buildingId) {
        AuthenticatedUser user = currentUser.get();
        if (user.is(Role.ADMIN)) {
            return;
        }
        if (!user.role().isBackOffice() || !user.blockIds().contains(buildingId)) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
    }
}
