package vn.fpt.campusstay.cfg;

import java.util.List;
import java.util.Optional;

/** CFG public API for Terms. */
public interface TermCatalog {

    /** Published Terms, newest stay first. */
    List<TermSummary> publishedTerms();

    Optional<TermSummary> findPublished(long termId);

    /** The published Term whose registration window is open now, if any (one at a time by design). */
    Optional<TermSummary> openForRegistration();
}
