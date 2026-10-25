package vn.fpt.campusstay.controller.setting;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.setting.TermRequestService;

/**
 * {@code /term-requests} — registration-period requests (A-28, spec §6.3): Managers send and change their requests;
 * Managers and the Admin read them and comment; the Admin answers ({@code /decision}) and builds the Term from one
 * in the wizard.
 */
@RestController
@RequestMapping("/term-requests")
class TermRequestController {

    record Saved(String id) {
    }

    record Comment(String text) {
    }

    private final TermRequestService requests;

    TermRequestController(TermRequestService requests) {
        this.requests = requests;
    }

    @GetMapping
    TermRequestService.RequestList list(@RequestParam(required = false) String status,
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return requests.list(status, q, PageQuery.of(page, pageSize));
    }

    @GetMapping("/{id}")
    TermRequestService.Detail get(@PathVariable long id) {
        return requests.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Saved create(@RequestBody TermRequestService.Body body) {
        return new Saved(String.valueOf(requests.create(body)));
    }

    @PutMapping("/{id}")
    Saved update(@PathVariable long id, @RequestBody TermRequestService.Body body) {
        return new Saved(String.valueOf(requests.update(id, body)));
    }

    @PostMapping("/{id}/comments")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void comment(@PathVariable long id, @RequestBody Comment body) {
        requests.comment(id, body == null ? null : body.text());
    }

    @PostMapping("/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decide(@PathVariable long id, @RequestBody TermRequestService.Decision body) {
        requests.decide(id, body);
    }
}
