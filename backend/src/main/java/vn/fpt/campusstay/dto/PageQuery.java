package vn.fpt.campusstay.dto;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Paging parameters of the contract: {@code page} is 1-based, {@code pageSize}
 * defaults to 20 and is capped at 100. Bind with {@code PageQuery.of(page, pageSize)}
 * from optional {@code @RequestParam Integer} values.
 */
public record PageQuery(int page, int pageSize) {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    public static PageQuery of(Integer page, Integer pageSize) {
        int p = page == null ? 1 : page;
        int s = pageSize == null ? DEFAULT_SIZE : pageSize;
        if (p < 1 || s < 1 || s > MAX_SIZE) {
            throw ApiException.badRequest("BAD_PAGE", "Page must be 1 or more and page size between 1 and " + MAX_SIZE + ".");
        }
        return new PageQuery(p, s);
    }

    public int offset() {
        return (page - 1) * pageSize;
    }

    public int limit() {
        return pageSize;
    }
}
