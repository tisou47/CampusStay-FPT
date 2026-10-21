package vn.fpt.campusstay.req;

import java.time.Instant;

/** A student proposes a Bed swap (NTF: "Swap request" to the invited student). */
public record SwapInvited(long swapId, String code, long inviteeId, String fromName, Instant expiresAt) {
}
