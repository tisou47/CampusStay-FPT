package vn.fpt.campusstay.student.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.Session

private class Home(val home: JSONObject, val board: JSONObject, val period: JSONObject?)

/**
 * Student Home (spec §11.4): the registration period card and the dormitory board, the Room card, the Invoice due
 * and the open requests (`/students/me/home`, `/students/me/board`, `/registration-periods/current`).
 */
@Composable
fun HomeScreen(session: Session, modifier: Modifier, openPayments: () -> Unit, openRoom: () -> Unit) {
    val state = load("home") {
        Home(Api.get("/students/me/home"), Api.get("/students/me/board"),
            runCatching { Api.get("/registration-periods/current").obj("card") }.getOrNull())
    }
    Content(state) { d ->
        LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text(T("Hello, ", "Xin chào, ") + (d.home.str("firstName") ?: session.name),
                    style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            }
            d.period?.let { card ->
                item {
                    Section(T("Registration period", "Đợt đăng ký") + " · " + card.optString("name")) {
                        StatusChip(card.str("status"))
                        Line(T("Opens", "Mở"), moment(card.str("opensAt")))
                        Line(T("Closes", "Đóng"), moment(card.str("closesAt")))
                        Line(T("Stay", "Thời gian ở"), day(card.str("stayStart")) + " – " + day(card.str("stayEnd")))
                        if (card.has("fromPrice") && !card.isNull("fromPrice")) {
                            Line(T("From", "Giá từ"), money(card.optLong("fromPrice")))
                        }
                    }
                }
            }
            item {
                val allocation = d.home.obj("allocation")
                Section(T("Your Room", "Phòng của bạn")) {
                    if (allocation == null) {
                        Text(T("You have no Room this Term.", "Bạn chưa có phòng trong kỳ này."))
                    } else {
                        Text(T("Room ", "Phòng ") + allocation.optString("room") + " · " + T("Bed ", "Giường ") +
                            allocation.optString("bed"), fontWeight = FontWeight.Medium)
                        Text(label(allocation.optString("block")), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = openRoom) { Text(T("Open My Room", "Mở Phòng của tôi")) }
                    }
                }
            }
            d.home.obj("dueInvoice")?.let { due ->
                item {
                    Section(T("Invoice due", "Hoá đơn cần thanh toán")) {
                        Text(due.optString("title"))
                        Line(T("Amount", "Số tiền"), money(due.optLong("amount")))
                        Line(T("Due", "Hạn"), moment(due.str("dueAt")))
                        TextButton(onClick = openPayments) { Text(T("Pay", "Thanh toán")) }
                    }
                }
            }
            val announcements = d.board.optJSONArray("items").objects()
            if (announcements.isNotEmpty()) {
                item { Text(T("Dormitory board", "Bảng tin KTX"), style = MaterialTheme.typography.titleMedium) }
                items(announcements) { a ->
                    Section((if (a.optBoolean("pinned")) "📌 " else "") + a.optString("title")) {
                        Text(a.optString("body"))
                        Text(moment(a.str("createdAt")), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
