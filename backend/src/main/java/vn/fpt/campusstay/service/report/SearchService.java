package vn.fpt.campusstay.service.report;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/**
 * The back-office search in the top bar (spec §11.3): student code or name, Room, Invoice, Application and request
 * codes. Each feature searches its own records ({@link SearchSource}) inside the user's Blocks; the query itself
 * is never logged (it may hold a student code).
 */
@Service
public class SearchService {

    /** The hits, in the sources' {@code @Order}: students, Rooms, Invoices, Applications, then requests. */
    public record Results(String q, List<SearchSource.Hit> items) {
    }

    static final int MIN_LENGTH = 2;
    static final int MAX_LENGTH = 60;
    private static final int PER_SOURCE = 5;

    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final List<SearchSource> sources;

    public SearchService(CurrentUser currentUser, BlockScope blockScope, List<SearchSource> sources) {
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.sources = sources;
    }

    @Transactional(readOnly = true)
    public Results search(String q) {
        AuthenticatedUser user = currentUser.get();
        SearchSource.Scope scope = new SearchSource.Scope(blockScope.resolve(null).ids(),
                user.is(Role.MANAGER) || user.is(Role.ADMIN));
        String query = q == null ? "" : q.trim();
        if (query.length() < MIN_LENGTH) {
            return new Results(query, List.of());
        }
        if (query.length() > MAX_LENGTH) {
            query = query.substring(0, MAX_LENGTH);
        }
        List<SearchSource.Hit> hits = new ArrayList<>();
        for (SearchSource source : sources) {
            hits.addAll(source.search(query, scope, PER_SOURCE));
        }
        return new Results(query, hits);
    }
}
