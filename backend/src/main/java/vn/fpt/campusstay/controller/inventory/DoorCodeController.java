package vn.fpt.campusstay.controller.inventory;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.service.inventory.DoorCodeService;

/** Staff and Manager › Door codes (ADR-23, spec §6.8): set, import, confirm and view the code of each Room. */
@RestController
@RequestMapping("/door-codes")
class DoorCodeController {

    /** {@code code}: 6 digits; blank = the server draws a random code. */
    record ProposeRequest(String code) {
    }

    private final DoorCodeService doorCodes;

    DoorCodeController(DoorCodeService doorCodes) {
        this.doorCodes = doorCodes;
    }

    @GetMapping
    DoorCodeService.DoorCodePage list(@RequestParam(required = false) String block,
            @RequestParam(required = false) String status, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return doorCodes.list(block, status, q, PageQuery.of(page, pageSize));
    }

    @PostMapping(path = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    DoorCodeService.Imported importCsv(@RequestPart(name = "file", required = false) MultipartFile file)
            throws IOException {
        if (file == null || file.isEmpty()) {
            throw FieldErrors.single("file", "Choose a CSV file.");
        }
        return doorCodes.importCsv(file.getBytes());
    }

    @PostMapping("/{room}")
    DoorCodeService.Proposed propose(@PathVariable String room, @RequestBody(required = false) ProposeRequest body) {
        return doorCodes.propose(room, body == null ? null : body.code());
    }

    @PostMapping("/{room}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@PathVariable String room) {
        doorCodes.confirm(room);
    }

    @PostMapping("/{room}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String room) {
        doorCodes.cancel(room);
    }

    @PostMapping("/{room}/reveal")
    DoorCodeService.Revealed reveal(@PathVariable String room) {
        return doorCodes.reveal(room);
    }
}
