package vn.fpt.campusstay.controller.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.auth.StudentContactService;

/** The student's own contact details and emergency contacts on My profile ({@code /students/**} is Student only). */
@RestController
@RequestMapping("/students/me/contacts")
class StudentContactController {

    record ContactRequest(@Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String phone,
            @Size(max = 254, message = "Enter a valid email address.") String personalEmail) {
    }

    record EmergencyRequest(@Size(max = 150, message = "Enter the contact's full name.") String name,
            @Size(max = 50, message = "Choose the relationship from the list.") String relationship,
            @Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String phone) {
    }

    private final StudentContactService contacts;

    StudentContactController(StudentContactService contacts) {
        this.contacts = contacts;
    }

    @GetMapping
    StudentContactService.Contacts mine() {
        return contacts.mine();
    }

    @PutMapping
    StudentContactService.Contacts save(@Valid @RequestBody ContactRequest body) {
        return contacts.saveContact(body.phone(), body.personalEmail());
    }

    @PostMapping("/emergency")
    StudentContactService.Contacts add(@Valid @RequestBody EmergencyRequest body) {
        return contacts.addEmergency(body.name(), body.relationship(), body.phone());
    }

    @PutMapping("/emergency/{id}")
    StudentContactService.Contacts update(@PathVariable long id, @Valid @RequestBody EmergencyRequest body) {
        return contacts.updateEmergency(id, body.name(), body.relationship(), body.phone());
    }

    @PostMapping("/emergency/{id}/primary")
    StudentContactService.Contacts primary(@PathVariable long id) {
        return contacts.makePrimary(id);
    }

    @DeleteMapping("/emergency/{id}")
    StudentContactService.Contacts remove(@PathVariable long id) {
        return contacts.removeEmergency(id);
    }
}
