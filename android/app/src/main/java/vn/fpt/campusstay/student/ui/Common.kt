package vn.fpt.campusstay.student.ui

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

// ---------------------------------------------------------------- language (spec §11.6)

/** The app follows the phone's language: Vietnamese, else English. */
fun isVietnamese(): Boolean = Locale.getDefault().language == "vi"

/** The text in the phone's language. */
fun T(en: String, vi: String): String = if (isVietnamese()) vi else en

/** Status and type labels of the API (English, contract "Statuses"), in Vietnamese when the phone is. */
fun label(text: String?): String {
    if (text.isNullOrBlank()) return ""
    if (!isVietnamese()) return text
    return LABELS[text] ?: text
}

private val LABELS = mapOf(
    "Unpaid" to "Chưa thanh toán", "Paid" to "Đã thanh toán", "Overdue" to "Quá hạn",
    "Awaiting confirmation" to "Chờ xác nhận", "Refunded" to "Đã hoàn tiền", "Void" to "Đã huỷ", "Upcoming" to "Sắp tới",
    "Assigned – unpaid" to "Đã xếp – chưa thanh toán", "Paid – waiting for the door code" to "Đã thanh toán – chờ mã cửa",
    "Resident" to "Đang ở", "Submitted" to "Đã gửi", "Assigned" to "Đã giao", "In progress" to "Đang xử lý",
    "Resolved" to "Đã xử lý", "Closed" to "Đã đóng", "Pending" to "Đang chờ", "Approved" to "Đã duyệt",
    "Rejected" to "Bị từ chối", "Cancelled" to "Đã huỷ", "Continuing" to "Tiếp tục ở", "Awaiting extension" to "Chờ gia hạn",
    "Not continuing" to "Không tiếp tục", "Awaiting consent" to "Chờ đồng ý", "Waiting for Staff" to "Chờ nhân viên",
    "Ready" to "Sẵn sàng", "Not ready" to "Chưa sẵn sàng", "Not set" to "Chưa đặt", "In use" to "Đang dùng",
    "Broken" to "Hỏng", "In repair" to "Đang sửa", "Normal" to "Bình thường", "Urgent" to "Khẩn cấp",
    "Deposit" to "Tiền cọc", "Balance" to "Tiền phòng", "Utility" to "Điện nước", "Room fee" to "Phí phòng",
    "Damage" to "Bồi thường", "Notice sent" to "Đã gửi thông báo", "Checked out" to "Đã trả phòng",
)

// ---------------------------------------------------------------- formats

/** `1.200.000 ₫` (VI) or `1,200,000 VND` (EN). */
fun money(amount: Long): String = if (isVietnamese()) {
    NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN")).format(amount) + " ₫"
} else {
    NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND"
}

private val zone: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")
private fun dayPattern() = if (isVietnamese()) DateTimeFormatter.ofPattern("dd/MM/yyyy")
else DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)

/** A calendar day `YYYY-MM-DD` as the user reads it. */
fun day(value: String?): String = value?.takeIf { it.isNotBlank() && it != "null" }
    ?.let { runCatching { LocalDate.parse(it.take(10)).format(dayPattern()) }.getOrDefault(it) } ?: "—"

/** An instant (fields ending in `At`) in campus time with the hour. */
fun moment(value: String?): String = value?.takeIf { it.isNotBlank() && it != "null" }?.let {
    runCatching {
        val local = Instant.parse(it).atZone(zone)
        local.format(dayPattern()) + " " + local.format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault(it)
} ?: "—"

fun JSONObject.str(name: String): String? = if (isNull(name)) null else optString(name).ifBlank { null }
fun JSONObject.obj(name: String): JSONObject? = if (isNull(name)) null else optJSONObject(name)
fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).map { getJSONObject(it) }

// ---------------------------------------------------------------- loading

/** Data loaded once per key, with a [reload]. */
class Loaded<T>(val data: T?, val error: Throwable?, val loading: Boolean, val reload: () -> Unit)

@Composable
fun <T> load(vararg keys: Any?, fetch: suspend () -> T): Loaded<T> {
    var version by remember { mutableIntStateOf(0) }
    var data by remember(*keys) { mutableStateOf<T?>(null) }
    var error by remember(*keys) { mutableStateOf<Throwable?>(null) }
    var loading by remember(*keys) { mutableStateOf(true) }
    LaunchedEffect(*keys, version) {
        loading = true
        error = null
        try {
            data = fetch()
        } catch (e: Exception) {
            error = e
        }
        loading = false
    }
    return Loaded(data, error, loading) { version++ }
}

/** Shows the loading state, the error with Retry, or the content. */
@Composable
fun <T> Content(state: Loaded<T>, content: @Composable (T) -> Unit) {
    val data = state.data
    when {
        data != null -> content(data)
        state.error != null -> ErrorBox(state.error.message ?: "Error", state.reload)
        else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    }
}

@Composable
fun ErrorBox(message: String, retry: (() -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, color = MaterialTheme.colorScheme.error)
        if (retry != null) Button(onClick = retry) { Text(T("Retry", "Thử lại")) }
    }
}

// ---------------------------------------------------------------- pieces

@Composable
fun Section(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            content()
        }
    }
}

@Composable
fun Line(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
    }
}

/** A status as a coloured chip: green when done or paid, amber when waiting, red when late or refused. */
@Composable
fun StatusChip(status: String?) {
    if (status.isNullOrBlank()) return
    val color = when (status) {
        "Paid", "Resident", "Resolved", "Closed", "Approved", "Continuing", "Ready", "Checked out" -> Color(0xFF1E8E3E)
        "Overdue", "Rejected", "Void", "Cancelled", "Not continuing", "Notice sent" -> Color(0xFFC5221F)
        else -> Color(0xFFB06000)
    }
    AssistChip(onClick = {}, label = { Text(label(status)) },
        colors = AssistChipDefaults.assistChipColors(labelColor = color))
}

/** A QR code of [text] (the check-in pass), black on white. */
fun qr(text: String, size: Int = 512): ImageBitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) for (y in 0 until size) {
        bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
    }
    return bitmap.asImageBitmap()
}
