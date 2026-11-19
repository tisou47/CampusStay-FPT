package vn.fpt.campusstay.controller.auth;

import java.time.LocalDate;
import java.util.List;

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

import vn.fpt.campusstay.service.auth.BlockStaffService;
import vn.fpt.campusstay.service.auth.StaffActivityService;
import vn.fpt.campusstay.service.auth.StaffShifts;
import vn.fpt.campusstay.service.auth.WeekScheduleService;

/** Manager › Staff and workload: handles, duty and work of the Block's staff, and requests for new accounts. */
@RestController
class BlockStaffController {

    /** What the person handles. Duty is not set by hand: it follows sign-in and sign-out. */
    record UpdateRequest(@Size(max = 20) List<@Size(max = 100) String> handles) {
    }

    record ShiftsRequest(@Size(max = 21, message = "Give at most 21 shifts a week.") List<StaffShifts.Shift> shifts) {
    }

    record ShiftsResponse(List<StaffShifts.Shift> shifts) {
    }

    /** Items of the person to move ({ type, id }), the receiver and why. */
    record ReassignRequest(@Size(max = 100) List<BlockStaffService.WorkRef> items, Object toStaffId,
            @Size(max = 300, message = "Keep the note under 300 characters.") String note) {
    }

    /** {@code block} may be left out when the Manager has one Block. */
    record AccountRequest(@Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 254) String email, @Size(max = 20) String role, @Size(max = 20) String block) {
    }

    record SendWeekRequest(@Size(max = 20) String block) {
    }

    private final BlockStaffService staff;
    private final StaffActivityService activity;
    private final WeekScheduleService schedule;

    BlockStaffController(BlockStaffService staff, StaffActivityService activity, WeekScheduleService schedule) {
        this.activity = activity;
        this.schedule = schedule;
        this.staff = staff;
    }

    @GetMapping("/block-staff")
    BlockStaffService.Page list(@RequestParam(required = false) String block) {
        return staff.list(block);
    }

    /** The signed-in person's own duty, request types and workload (A-60). */
    @GetMapping("/block-staff/me")
    BlockStaffService.Me me() {
        return staff.me();
    }

    @PutMapping("/block-staff/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable String id, @Valid @RequestBody UpdateRequest body) {
        staff.update(id, body.handles());
    }

    /** The person's open work, overdue first. */
    @GetMapping("/block-staff/{id}/work")
    BlockStaffService.WorkPage work(@PathVariable String id) {
        return staff.work(id);
    }

    /** Moves some of the person's open work to someone else, all or none. */
    @PostMapping("/block-staff/{id}/work/reassign")
    BlockStaffService.Moved reassign(@PathVariable String id, @Valid @RequestBody ReassignRequest body) {
        return staff.reassign(id, body.items(), body.toStaffId(), body.note());
    }

    /** A Staff member's weekly shifts, all replaced: { shifts: [{ weekday, start, end }] }. */
    @PutMapping("/block-staff/{id}/shifts")
    ShiftsResponse setShifts(@PathVariable String id, @Valid @RequestBody ShiftsRequest body) {
        return new ShiftsResponse(staff.setShifts(id, body.shifts()));
    }

    /** Whether next week's schedule was sent to the Staff of the chosen Blocks. */
    @GetMapping("/week-schedule")
    WeekScheduleService.NextWeek nextWeek(@RequestParam(required = false) String block) {
        return schedule.nextWeek(block);
    }

    /** Sends next week's schedule to every Staff member of the chosen Blocks: { block? }. */
    @PostMapping("/week-schedule/send")
    WeekScheduleService.Sent sendWeek(@RequestBody(required = false) SendWeekRequest body) {
        return schedule.send(body == null ? null : body.block());
    }

    /** What the Staff of the Manager's Blocks changed, newest first; {@code flagged} keeps those outside shift or work. */
    @GetMapping("/staff-activity")
    StaffActivityService.Page activity(@RequestParam(required = false) String block,
            @RequestParam(required = false) String staffId, @RequestParam(required = false) Boolean flagged,
            @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return activity.list(block, staffId, flagged, from, to, page, pageSize);
    }


    @PostMapping("/staff-account-requests")
    BlockStaffService.Created requestAccount(@Valid @RequestBody AccountRequest body) {
        return staff.requestAccount(body.name(), body.email(), body.role(), body.block());
    }
}
