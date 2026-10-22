package vn.fpt.campusstay.controller.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.request.RoomChangeService;
import vn.fpt.campusstay.dto.PageQuery;

/** Room-Change Requests: the student asks, Staff of the Block decide. Requests are addressed by code (RC-…). */
@RestController
class RoomChangeController {

    record CreateRequest(Long termId, @Size(max = 10) String kind, Long roomTypeId, Long roomClassId,
            @Size(max = 100) String reason,
            @Size(max = 1000, message = "Keep the details under 1,000 characters.") String details) {
    }

    record DecisionRequest(@Size(max = 20) String decision, @Size(max = 40) String bedId, @Size(max = 100) String reason,
            @Size(max = 1000, message = "Keep the message under 1,000 characters.") String message) {
    }

    private final RoomChangeService roomChanges;

    RoomChangeController(RoomChangeService roomChanges) {
        this.roomChanges = roomChanges;
    }

    @GetMapping("/room-changes/options")
    RoomChangeService.Options options(@RequestParam(required = false) Long termId) {
        return roomChanges.options(termId);
    }

    @PostMapping("/room-changes")
    RoomChangeService.Created create(@Valid @RequestBody CreateRequest body) {
        return roomChanges.create(new RoomChangeService.CreateCommand(body.termId(), body.kind(), body.roomTypeId(),
                body.roomClassId(), body.reason(), body.details()));
    }

    @GetMapping("/room-changes")
    RoomChangeService.QueuePage queue(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String status,
            @RequestParam(required = false) String kind, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return roomChanges.queue(termId, block, status, kind, PageQuery.of(page, pageSize));
    }

    @GetMapping("/room-changes/{id}/matching-beds")
    RoomChangeService.MatchingBeds matchingBeds(@PathVariable String id) {
        return roomChanges.matchingBeds(id);
    }

    @PostMapping("/room-changes/{id}/decision")
    RoomChangeService.Decided decide(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        return roomChanges.decide(id, body.decision(), body.bedId(), body.reason(), body.message());
    }
}
