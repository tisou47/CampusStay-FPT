package vn.fpt.campusstay.ntf.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.ntf.internal.DeviceService;

/** Android registers its FCM token after sign-in and on refresh, and removes it before sign-out. */
@RestController
class DeviceController {

    record RegisterRequest(@Size(max = 4096, message = "The device token is too long.") String token,
            @Size(max = 10) String platform) {
    }

    record UnregisterRequest(@Size(max = 4096, message = "The device token is too long.") String token) {
    }

    private final DeviceService devices;

    DeviceController(DeviceService devices) {
        this.devices = devices;
    }

    @PostMapping("/devices")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void register(@Valid @RequestBody RegisterRequest body) {
        devices.register(body.token(), body.platform());
    }

    @PostMapping("/devices/unregister")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unregister(@Valid @RequestBody UnregisterRequest body) {
        devices.unregister(body.token());
    }
}
