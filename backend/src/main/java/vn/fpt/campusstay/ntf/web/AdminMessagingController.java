package vn.fpt.campusstay.ntf.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.ntf.internal.EmailCampaignService;
import vn.fpt.campusstay.ntf.internal.NotificationTemplateService;

/** Admin › Notification templates and Send email. */
@RestController
@RequestMapping("/admin")
class AdminMessagingController {

    private final NotificationTemplateService templates;
    private final EmailCampaignService emails;

    AdminMessagingController(NotificationTemplateService templates, EmailCampaignService emails) {
        this.templates = templates;
        this.emails = emails;
    }

    @GetMapping("/notification-templates")
    NotificationTemplateService.Page templates() {
        return templates.list();
    }

    @PutMapping("/notification-templates/{key}")
    NotificationTemplateService.Template saveTemplate(@PathVariable String key,
            @RequestBody NotificationTemplateService.Change body) {
        return templates.save(key, body);
    }

    /** Sends the text in the body (saved or not) to the signed-in Admin. */
    @PostMapping("/notification-templates/{key}/test")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void testTemplate(@PathVariable String key, @RequestBody(required = false) NotificationTemplateService.Change body) {
        templates.test(key, body);
    }

    @GetMapping("/emails/options")
    EmailCampaignService.Options emailOptions() {
        return emails.options();
    }

    @PostMapping("/emails/preview")
    EmailCampaignService.PreviewResult preview(@RequestBody EmailCampaignService.Request body) {
        return emails.preview(body);
    }

    @PostMapping("/emails")
    EmailCampaignService.Queued send(@RequestBody EmailCampaignService.Request body) {
        return emails.send(body);
    }
}
