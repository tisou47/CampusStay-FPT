package vn.fpt.campusstay.service.auth;

import java.util.List;
import java.util.Optional;

/**
 * Vietnamese banks a refund can be transferred to (R-22), identified by their NAPAS / VietQR BIN, the code that stays
 * when a bank is renamed. Reference data of the banking system, not a business value: a bank that opens or merges is
 * added here.
 */
public final class Banks {

    /** @param shortName the name students and Managers know; {@code name} the full legal name */
    public record Bank(String bin, String shortName, String name) {
    }

    public static final List<Bank> ALL = List.of(
            new Bank("970436", "Vietcombank", "Ngân hàng TMCP Ngoại thương Việt Nam"),
            new Bank("970415", "VietinBank", "Ngân hàng TMCP Công thương Việt Nam"),
            new Bank("970418", "BIDV", "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam"),
            new Bank("970405", "Agribank", "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam"),
            new Bank("970422", "MB Bank", "Ngân hàng TMCP Quân đội"),
            new Bank("970407", "Techcombank", "Ngân hàng TMCP Kỹ thương Việt Nam"),
            new Bank("970416", "ACB", "Ngân hàng TMCP Á Châu"),
            new Bank("970432", "VPBank", "Ngân hàng TMCP Việt Nam Thịnh Vượng"),
            new Bank("970423", "TPBank", "Ngân hàng TMCP Tiên Phong"),
            new Bank("970403", "Sacombank", "Ngân hàng TMCP Sài Gòn Thương Tín"),
            new Bank("970437", "HDBank", "Ngân hàng TMCP Phát triển TP. Hồ Chí Minh"),
            new Bank("970441", "VIB", "Ngân hàng TMCP Quốc tế Việt Nam"),
            new Bank("970443", "SHB", "Ngân hàng TMCP Sài Gòn - Hà Nội"),
            new Bank("970431", "Eximbank", "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam"),
            new Bank("970426", "MSB", "Ngân hàng TMCP Hàng Hải Việt Nam"),
            new Bank("970448", "OCB", "Ngân hàng TMCP Phương Đông"),
            new Bank("970440", "SeABank", "Ngân hàng TMCP Đông Nam Á"),
            new Bank("970449", "LPBank", "Ngân hàng TMCP Lộc Phát Việt Nam"),
            new Bank("970412", "PVcomBank", "Ngân hàng TMCP Đại Chúng Việt Nam"),
            new Bank("970428", "Nam A Bank", "Ngân hàng TMCP Nam Á"),
            new Bank("970409", "Bac A Bank", "Ngân hàng TMCP Bắc Á"),
            new Bank("970454", "Viet Capital Bank", "Ngân hàng TMCP Bản Việt"),
            new Bank("970429", "SCB", "Ngân hàng TMCP Sài Gòn"),
            new Bank("970425", "ABBANK", "Ngân hàng TMCP An Bình"),
            new Bank("970427", "VietABank", "Ngân hàng TMCP Việt Á"),
            new Bank("970419", "NCB", "Ngân hàng TMCP Quốc Dân"),
            new Bank("970430", "PGBank", "Ngân hàng TMCP Thịnh vượng và Phát triển"),
            new Bank("970400", "Saigonbank", "Ngân hàng TMCP Sài Gòn Công Thương"),
            new Bank("970452", "KienlongBank", "Ngân hàng TMCP Kiên Long"),
            new Bank("970433", "VietBank", "Ngân hàng TMCP Việt Nam Thương Tín"),
            new Bank("970438", "BaoViet Bank", "Ngân hàng TMCP Bảo Việt"),
            new Bank("970406", "DongA Bank", "Ngân hàng TMCP Đông Á"),
            new Bank("970424", "Shinhan Bank", "Ngân hàng TNHH MTV Shinhan Việt Nam"),
            new Bank("970457", "Woori Bank", "Ngân hàng TNHH MTV Woori Việt Nam"),
            new Bank("970410", "Standard Chartered", "Ngân hàng TNHH MTV Standard Chartered Việt Nam"),
            new Bank("970458", "UOB", "Ngân hàng TNHH MTV United Overseas Bank Việt Nam"),
            new Bank("458761", "HSBC", "Ngân hàng TNHH MTV HSBC Việt Nam"));

    private Banks() {
    }

    public static Optional<Bank> byBin(String bin) {
        return bin == null ? Optional.empty() : ALL.stream().filter(b -> b.bin().equals(bin.trim())).findFirst();
    }
}
