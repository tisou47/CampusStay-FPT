package vn.fpt.campusstay.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.common.i18n.Messages;

/**
 * Writes every error body in the request's language (ADR-25): the message and each field message of
 * {@code details.fields}. The code stays the same, so clients keep reacting to it; requests without
 * {@code Accept-Language: vi} get the English texts as before.
 */
@RestControllerAdvice
class LocalizedErrors implements ResponseBodyAdvice<Object> {

    private final Messages messages;

    LocalizedErrors(Messages messages) {
        this.messages = messages;
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
            Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request, ServerHttpResponse response) {
        if (!(body instanceof ApiError error)) {
            return body;
        }
        String locale = Locales.ofRequest();
        if (!Locales.VI.equals(locale)) {
            return body;
        }
        return new ApiError(messages.translate(error.message(), locale), error.code(), details(error.details(), locale));
    }

    private Map<String, Object> details(Map<String, Object> details, String locale) {
        if (details == null || !(details.get("fields") instanceof Map<?, ?> fields)) {
            return details;
        }
        Map<String, Object> translated = new LinkedHashMap<>();
        fields.forEach((field, text) -> translated.put(String.valueOf(field),
                text instanceof String s ? messages.translate(s, locale) : text));
        Map<String, Object> out = new LinkedHashMap<>(details);
        out.put("fields", translated);
        return out;
    }
}
