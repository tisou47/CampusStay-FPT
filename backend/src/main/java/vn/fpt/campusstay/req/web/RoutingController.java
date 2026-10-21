package vn.fpt.campusstay.req.web;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.req.internal.RoutingService;

/**
 * Block Manager › Routing rules and escalation timers. Rule bodies are maps so that a
 * {@code PUT} changes only the fields it sends ({@code "fallbackId": null} removes the fallback).
 */
@RestController
class RoutingController {

    record TimersRequest(String block, Object urgent, Object normal, Object roomChange) {
    }

    private final RoutingService routing;

    RoutingController(RoutingService routing) {
        this.routing = routing;
    }

    @GetMapping("/routing-rules")
    RoutingService.Page page(@RequestParam(required = false) String block) {
        return routing.page(block);
    }

    @PostMapping("/routing-rules")
    RoutingService.Created create(@RequestBody Map<String, Object> body) {
        return routing.create(body);
    }

    @PutMapping("/routing-rules/timers")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void timers(@RequestBody TimersRequest body) {
        routing.saveTimers(body.block(), body.urgent(), body.normal(), body.roomChange());
    }

    @PutMapping("/routing-rules/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        routing.update(id, body);
    }
}
