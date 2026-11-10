package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Lookups;

/**
 * {@code GET /catalog}: what the Application wizard offers. Only active Room
 * Types and Room Classes; every combination has a Term price. Prices, the Deposit rate and the Utility Deposit
 * are those of the Term asked for (else the Term open for registration, else the current Term, else the
 * defaults); an Application keeps the price it was submitted with.
 */
@Service
public class StudentCatalogService {

    public record RoomType(String id, String name, int beds, String description) {
    }

    /** {@code furniture}: what every Room of the class has (review R-05). */
    public record RoomClass(String id, String name, BigDecimal surchargeRate, List<RoomClassFurniture.Line> furniture) {
    }

    public record Price(String roomTypeId, String roomClassId, long termPrice) {
    }

    /** Option labels; the wizard sends one of them back. */
    public record PreferenceOptions(List<String> region, List<String> semester, List<String> major) {
    }

    public record StudentCatalog(List<RoomType> roomTypes, List<RoomClass> roomClasses, List<Price> prices,
            BigDecimal depositRate, long utilityDeposit, PreferenceOptions preferenceOptions,
            List<String> relationships) {
    }

    private final Catalog catalog;
    private final FeePolicy fees;
    private final Lookups lookups;
    private final TermCatalog terms;
    private final RoomClassFurniture furniture;

    public StudentCatalogService(Catalog catalog, FeePolicy fees, Lookups lookups, TermCatalog terms,
            RoomClassFurniture furniture) {
        this.furniture = furniture;
        this.catalog = catalog;
        this.fees = fees;
        this.lookups = lookups;
        this.terms = terms;
    }

    @Transactional(readOnly = true)
    public StudentCatalog catalog(Long termId) {
        Long term = (termId == null ? Optional.<TermSummary>empty() : terms.findPublished(termId))
                .or(terms::openForRegistration)
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .map(TermSummary::id).orElse(null);
        TermCatalog.TermRooms offer = term == null ? null : terms.rooms(term);
        List<Catalog.RoomTypeInfo> types = catalog.roomTypes().stream().filter(Catalog.RoomTypeInfo::active)
                .filter(t -> offer == null || offer.roomTypeIds().isEmpty() || offer.roomTypeIds().contains(t.id()))
                .toList();
        List<Catalog.RoomClassInfo> classes = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .filter(c -> offer == null || offer.roomClassIds().isEmpty() || offer.roomClassIds().contains(c.id()))
                .toList();
        List<Price> prices = new ArrayList<>();
        for (Catalog.RoomTypeInfo t : types) {
            for (Catalog.RoomClassInfo c : classes) {
                OptionalLong price = term == null ? fees.defaultTermPrice(t.id(), c.id())
                        : fees.termPrice(term, t.id(), c.id());
                price.ifPresent(p -> prices.add(new Price(String.valueOf(t.id()), String.valueOf(c.id()), p)));
            }
        }
        Map<Long, List<RoomClassFurniture.Line>> required = furniture.required();
        return new StudentCatalog(
                types.stream().map(t -> new RoomType(String.valueOf(t.id()), t.name(), t.beds(), t.description()))
                        .toList(),
                classes.stream().map(c -> new RoomClass(String.valueOf(c.id()), c.name(),
                        Decimals.plain(c.surchargeRate()), required.getOrDefault(c.id(), List.of()))).toList(),
                prices, term == null ? fees.depositRate() : fees.depositRate(term),
                term == null ? fees.utilityDeposit() : fees.utilityDeposit(term),
                new PreferenceOptions(labels("REGION"), labels("SEMESTER"), labels("MAJOR")), labels("RELATIONSHIP"));
    }

    private List<String> labels(String list) {
        return lookups.list(list).stream().map(Lookups.Lookup::label).toList();
    }
}
