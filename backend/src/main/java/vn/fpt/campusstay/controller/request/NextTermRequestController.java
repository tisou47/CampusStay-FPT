package vn.fpt.campusstay.controller.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.request.NextTermRequestsService;
import vn.fpt.campusstay.service.request.RoomClassChangeService;
import vn.fpt.campusstay.service.request.StayRequestService;

/**
 * Next-Term requests besides room changes and swaps (spec §6.10, §6.11): Room Class changes of a Room with the
 * consents of its continuing residents, extensions and the end of the stay; and every open request of a requests
 * window in one list, decided in bulk. Addressed by code (CC-…, ST-…).
 */
@RestController
class NextTermRequestController {

    record ClassChangeRequest(Long termId, @Size(max = 20) String room, Long roomClassId,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record ConsentRequest(Boolean agree) {
    }

    record DecisionRequest(@Size(max = 20) String decision,
            @Size(max = 1000, message = "Keep the note under 1,000 characters.") String note) {
    }

    record SetBackRequest(@Size(max = 1000, message = "Keep the note under 1,000 characters.") String note) {
    }

    record ExtensionRequest(Integer terms,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record EndRequest(@Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record BulkRequest(@Size(max = 200, message = "Decide at most 200 requests at once.")
            List<NextTermRequestsService.Target> items, @Size(max = 20) String decision,
            @Size(max = 1000, message = "Keep the reason under 1,000 characters.") String reason) {
    }

    private final RoomClassChangeService classChanges;
    private final StayRequestService stayRequests;
    private final NextTermRequestsService requests;

    NextTermRequestController(RoomClassChangeService classChanges, StayRequestService stayRequests,
            NextTermRequestsService requests) {
        this.classChanges = classChanges;
        this.stayRequests = stayRequests;
        this.requests = requests;
    }

    // ---------------------------------------------------------------- Room Class changes

    @GetMapping("/room-class-changes/options")
    RoomClassChangeService.Options classOptions() {
        return classChanges.options();
    }

    /** A student asks for their next-Term Room; a Manager names the Term and the Room. */
    @PostMapping("/room-class-changes")
    RoomClassChangeService.Created createClassChange(@Valid @RequestBody ClassChangeRequest body) {
        if (body.room() != null && !body.room().isBlank()) {
            return classChanges.createForRoom(body.termId(), body.room(), body.roomClassId(), body.reason());
        }
        return classChanges.create(body.roomClassId(), body.reason());
    }

    @PostMapping("/room-class-changes/{id}/consent")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void consent(@PathVariable String id, @RequestBody ConsentRequest body) {
        classChanges.answer(id, body.agree());
    }

    @GetMapping("/room-class-changes")
    RoomClassChangeService.ItemPage classChanges(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return classChanges.list(termId, block, status, PageQuery.of(page, pageSize));
    }

    @GetMapping("/room-class-changes/{id}")
    RoomClassChangeService.Detail classChange(@PathVariable String id) {
        return classChanges.detail(id);
    }

    @PostMapping("/room-class-changes/{id}/decision")
    RoomClassChangeService.Detail decideClassChange(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        return classChanges.decide(id, body.decision(), body.note());
    }

    @PostMapping("/room-class-changes/{id}/set-back")
    RoomClassChangeService.Detail setBack(@PathVariable String id, @Valid @RequestBody SetBackRequest body) {
        return classChanges.setBack(id, body.note());
    }

    // ---------------------------------------------------------------- extension and end of stay

    @PostMapping("/students/me/stay/extension")
    StayRequestService.Created extend(@Valid @RequestBody ExtensionRequest body) {
        return stayRequests.extend(body.terms(), body.reason());
    }

    @PostMapping("/students/me/stay/end")
    StayRequestService.Created end(@Valid @RequestBody EndRequest body) {
        return stayRequests.endOfStay(body.reason());
    }

    @GetMapping("/stay-requests")
    StayRequestService.ItemPage stayRequests(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String kind,
            @RequestParam(required = false) String status, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return stayRequests.list(termId, block, kind, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/stay-requests/{id}/decision")
    StayRequestService.Item decideStayRequest(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        return stayRequests.decide(id, body.decision(), body.note());
    }

    // ---------------------------------------------------------------- the window, in bulk

    @GetMapping("/next-term-requests")
    NextTermRequestsService.OpenPage open(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String kind) {
        return requests.open(termId, block, kind);
    }

    @PostMapping("/next-term-requests/decision")
    NextTermRequestsService.BulkResult decide(@Valid @RequestBody BulkRequest body) {
        return requests.decide(body.items(), body.decision(), body.reason());
    }
}
