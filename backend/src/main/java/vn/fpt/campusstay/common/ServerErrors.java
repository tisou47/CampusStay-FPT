package vn.fpt.campusstay.common;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedDeque;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Counts the 5xx answers of this server over the last hour for Admin › System health (D2). Only the time is kept: no
 * path, user or body. shortcut: per server and in memory; a second server reports its own count.
 */
@Component
public class ServerErrors extends OncePerRequestFilter {

    private static final Duration WINDOW = Duration.ofHours(1);

    private final ConcurrentLinkedDeque<Instant> times = new ConcurrentLinkedDeque<>();
    private final Clock clock;

    public ServerErrors(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } finally {
            if (response.getStatus() >= 500) {
                times.addLast(Instant.now(clock));
                prune();
            }
        }
    }

    public int lastHour() {
        prune();
        return times.size();
    }

    private void prune() {
        Instant from = Instant.now(clock).minus(WINDOW);
        while (!times.isEmpty() && !times.peekFirst().isAfter(from)) {
            times.pollFirst();
        }
    }
}
