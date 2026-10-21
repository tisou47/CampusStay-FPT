package vn.fpt.campusstay.inv;

/** INV public API: facts about Blocks that other modules check (APP eligibility). */
public interface Buildings {

    /** @param gender {@code M} or {@code F} */
    boolean anyActiveBlockFor(String gender);
}
