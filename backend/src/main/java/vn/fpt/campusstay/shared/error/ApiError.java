package vn.fpt.campusstay.shared.error;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Error body of every non-2xx response (API contract: {@code { message, code?, details? }}). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String message, String code, Map<String, Object> details) {

    public static ApiError of(String code, String message) {
        return new ApiError(message, code, null);
    }
}
