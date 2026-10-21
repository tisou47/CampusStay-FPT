package vn.fpt.campusstay.req.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.req.internal.SwapService;
import vn.fpt.campusstay.shared.web.PageQuery;

/** Bed swaps: direct invitations, the swap board, the invited student's answer and the Staff/Manager decision. */
@RestController
class SwapController {

    record DirectRequest(@Size(max = 20) String studentCode,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record PostRequest(Long termId, @Size(max = 10) String block, Long roomTypeId, Long roomClassId) {
    }

    record RespondRequest(Boolean accept) {
    }

    record DecisionRequest(@Size(max = 20) String decision,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    private final SwapService swaps;

    SwapController(SwapService swaps) {
        this.swaps = swaps;
    }

    @PostMapping("/swaps")
    SwapService.Created direct(@Valid @RequestBody DirectRequest body) {
        return swaps.direct(body.studentCode(), body.reason());
    }

    @GetMapping("/swap-board")
    SwapService.Board board(@RequestParam(required = false) Long termId) {
        return swaps.board(termId);
    }

    /** Without {@code roomTypeId} the student's post is taken down. */
    @PutMapping("/swap-board/my-post")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void myPost(@Valid @RequestBody PostRequest body) {
        swaps.putMyPost(body.termId(), body.block(), body.roomTypeId(), body.roomClassId());
    }

    @PostMapping("/swap-board/posts/{id}/request")
    SwapService.Created request(@PathVariable String id) {
        return swaps.requestPost(id);
    }

    @GetMapping("/swap-invitations/{id}")
    SwapService.Invitation invitation(@PathVariable String id) {
        return swaps.invitation(id);
    }

    @PostMapping("/swap-invitations/{id}/respond")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void respond(@PathVariable String id, @RequestBody RespondRequest body) {
        swaps.respond(id, body.accept());
    }

    @GetMapping("/swaps")
    SwapService.SwapPage queue(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String kind,
            @RequestParam(required = false) String status, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return swaps.queue(termId, block, kind, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/swaps/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decide(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        swaps.decide(id, body.decision(), body.reason());
    }
}
