package vn.fpt.campusstay.student.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.ApiException

/** Payments: what is outstanding and every Invoice (`GET /students/me/invoices`, A-39). */
@Composable
fun PaymentsScreen(modifier: Modifier, open: (String) -> Unit) {
    val state = load("invoices") { Api.get("/students/me/invoices?pageSize=100") }
    Content(state) { d ->
        val summary = d.obj("summary")
        LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            summary?.let { s ->
                item {
                    Section(T("To pay", "Cần thanh toán")) {
                        Text(money(s.optLong("outstanding")), style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.SemiBold)
                        s.str("nextDueAt")?.let { Line(T("Next deadline", "Hạn gần nhất"), moment(it)) }
                        s.obj("warning")?.let { w ->
                            Text(T("Utility warning: ", "Cảnh báo điện nước: ") + money(w.optLong("debt")) +
                                (w.str("terminateOn")?.let { T(" · terminated on ", " · chấm dứt ngày ") + day(it) } ?: ""),
                                color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            items(d.optJSONArray("items").objects()) { invoice ->
                Card(Modifier.fillMaxWidth().clickable { open(invoice.optString("id")) }) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(invoice.optString("title"), fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Text(money(invoice.optLong("amount")), fontWeight = FontWeight.SemiBold)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(T("Due ", "Hạn ") + moment(invoice.str("dueAt")), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            StatusChip(invoice.str("status"))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Paying an Invoice (spec §6.7): the VietQR image when the account is configured, the transfer content, and
 * "I have transferred" (`POST /invoices/{id}/claim`); while the claim waits, the page asks again every 15 seconds.
 */
@Composable
fun InvoiceScreen(id: String, modifier: Modifier) {
    val state = load("payment", id) { Api.get("/invoices/$id/payment") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var message by remember { mutableStateOf<String?>(null) }
    var image by remember { mutableStateOf<ImageBitmap?>(null) }
    val waiting = state.data?.obj("claim")?.str("status") == "Claimed" ||
        state.data?.obj("invoice")?.str("status") == "Awaiting confirmation"
    LaunchedEffect(waiting) {
        while (waiting) {
            delay(15_000)
            state.reload()
        }
    }
    LaunchedEffect(state.data?.obj("qr")?.str("image")) {
        val url = state.data?.obj("qr")?.str("image") ?: return@LaunchedEffect
        image = runCatching { Api.bytes(url).let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() } }.getOrNull()
    }
    Content(state) { d ->
        val invoice = d.getJSONObject("invoice")
        LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Section(invoice.optString("title")) {
                    Text(money(invoice.optLong("amount")), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    StatusChip(invoice.str("status"))
                    Line(T("Due", "Hạn"), moment(invoice.str("dueAt")))
                    invoice.str("paidAt")?.let { Line(T("Paid", "Đã trả"), moment(it)) }
                }
            }
            if (invoice.str("status") != "Paid") {
                item {
                    Section(T("Bank transfer", "Chuyển khoản")) {
                        image?.let { Image(it, contentDescription = "VietQR", modifier = Modifier.size(240.dp)) }
                        d.obj("bank")?.let { bank ->
                            Line(T("Bank", "Ngân hàng"), bank.optString("name"))
                            Line(T("Account", "Số tài khoản"), bank.optString("accountNumber"))
                            Line(T("Account name", "Chủ tài khoản"), bank.optString("accountName"))
                        }
                        val content = d.optString("transferContent")
                        Line(T("Transfer content", "Nội dung chuyển khoản"), content)
                        TextButton(onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("CampusStay", content))
                            message = T("Transfer content copied.", "Đã sao chép nội dung chuyển khoản.")
                        }) { Text(T("Copy the content", "Sao chép nội dung")) }
                        d.obj("claim")?.obj("lastRejection")?.let { r ->
                            Text(T("Last claim rejected: ", "Lần báo trước bị từ chối: ") + r.optString("reason"),
                                color = MaterialTheme.colorScheme.error)
                        }
                        if (d.optBoolean("canClaim")) {
                            Button(onClick = {
                                scope.launch {
                                    message = try {
                                        Api.post("/invoices/$id/claim")
                                        state.reload()
                                        T("Thanks! A Manager confirms your transfer; the deadline stops meanwhile.",
                                            "Cảm ơn bạn! Quản lý sẽ xác nhận khoản chuyển; hạn thanh toán tạm dừng trong lúc chờ.")
                                    } catch (e: ApiException) {
                                        e.message
                                    }
                                }
                            }, modifier = Modifier.fillMaxWidth()) { Text(T("I have transferred", "Tôi đã chuyển khoản")) }
                        } else if (waiting) {
                            Text(T("Waiting for a Manager to confirm your transfer.", "Đang chờ Quản lý xác nhận khoản chuyển."))
                        }
                    }
                }
            }
            message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        }
    }
}
