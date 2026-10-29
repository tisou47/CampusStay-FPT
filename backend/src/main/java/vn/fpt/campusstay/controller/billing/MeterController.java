package vn.fpt.campusstay.controller.billing;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.service.billing.MeterService;
import vn.fpt.campusstay.dto.PageQuery;

/** Meter readings per Block and month; closing a period issues the Utility Invoices. Rooms are addressed by code. */
@RestController
class MeterController {

    record ReadingRequest(@DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal electricity,
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal water) {
    }

    private final MeterService meters;

    MeterController(MeterService meters) {
        this.meters = meters;
    }

    @GetMapping("/meter-periods")
    MeterService.Periods periods(@RequestParam(required = false) String block) {
        return meters.periods(block);
    }

    @GetMapping("/meter-periods/{id}/readings")
    MeterService.ReadingsPage readings(@PathVariable String id, @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return meters.readings(id, status, PageQuery.of(page, pageSize));
    }

    @GetMapping("/meter-periods/{id}/readings/{room}")
    MeterService.RoomReading room(@PathVariable String id, @PathVariable String room) {
        return meters.room(id, room);
    }

    @PutMapping("/meter-periods/{id}/readings/{room}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void save(@PathVariable String id, @PathVariable String room, @Valid @RequestBody ReadingRequest body) {
        meters.save(id, room, body.electricity(), body.water());
    }

    @PostMapping("/meter-periods/{id}/readings/{room}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@PathVariable String id, @PathVariable String room) {
        meters.confirm(id, room);
    }

    /** The readings file to fill in: the period's Rooms with their previous values (A-59). */
    @GetMapping("/meter-periods/{id}/template")
    ResponseEntity<byte[]> template(@PathVariable String id) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("meter-readings.xlsx").build().toString())
                .body(meters.template(id));
    }

    /** The template filled in, XLSX or CSV; blank lines are Rooms read later. */
    @PostMapping(path = "/meter-periods/{id}/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    MeterService.Imported importCsv(@PathVariable String id, @RequestPart(name = "file", required = false) MultipartFile file) {
        try {
            return meters.importCsv(id, file == null ? null : file.getOriginalFilename(),
                    file == null ? null : file.getBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @PostMapping("/meter-periods/{id}/close")
    MeterService.Closed close(@PathVariable String id) {
        return meters.close(id);
    }
}
