package vn.fpt.campusstay.student.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.ApiException

private class Room(val allocation: JSONObject, val doorCode: JSONObject?, val furniture: JSONObject?)

/**
 * My Room (spec §6.8, §6.10, §11.4): the Room and roommates, the check-in pass as a QR code (A-11), the door code
 * behind a "show" button (every view is audited), the furniture, the Stay and the next Term with its requests.
 */
@Composable
fun RoomScreen(modifier: Modifier) {
    val state = load("room") {
        val allocation = Api.get("/students/me/allocation")
        val inRoom = allocation.obj("allocation") != null
        Room(allocation,
            if (inRoom) runCatching { Api.get("/students/me/door-code") }.getOrNull() else null,
            if (inRoom) runCatching { Api.get("/students/me/furniture") }.getOrNull() else null)
    }
    var code by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun act(path: String, body: JSONObject) {
        scope.launch {
            message = try {
                val result = Api.post(path, body)
                state.reload()
                result.str("note") ?: T("Request sent.", "Đã gửi yêu cầu.")
            } catch (e: ApiException) {
                e.message
            }
        }
    }

    Content(state) { d ->
        val a = d.allocation.obj("allocation")
        LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
            if (a == null) {
                item {
                    Section(T("No Room this Term", "Chưa có phòng trong kỳ này")) {
                        Text(T("Apply for a Bed on the web when a registration period is open.",
                            "Hãy đăng ký giường trên bản web khi đợt đăng ký mở."))
                    }
                }
                return@LazyColumn
            }
            item {
                Section(T("Room ", "Phòng ") + a.optString("room") + " · " + T("Bed ", "Giường ") + a.optString("bed")) {
                    StatusChip(a.str("status"))
                    Line(T("Block", "Block"), a.optString("blockLabel").ifBlank { a.optString("block") })
                    Line(T("Room Type", "Loại phòng"), label(a.str("roomTypeName")))
                    Line(T("Room Class", "Hạng phòng"), label(a.str("roomClassName")))
                    a.str("residentSince")?.let { Line(T("Resident since", "Ở từ"), moment(it)) }
                    val roommates = d.allocation.optJSONArray("roommates").objects()
                    if (roommates.isNotEmpty()) {
                        Text(T("Roommates", "Bạn cùng phòng"), fontWeight = FontWeight.Medium)
                        roommates.forEach { Text("• " + it.optString("name") + " · " + T("Bed ", "Giường ") + it.optString("bed")) }
                    }
                }
            }
            d.doorCode?.let { door ->
                item {
                    Section(T("Door code", "Mã cửa")) {
                        StatusChip(door.str("status"))
                        door.str("note")?.let { Text(it) }
                        val shown = code
                        if (shown != null) {
                            Text(shown, fontSize = 40.sp, fontWeight = FontWeight.Bold, letterSpacing = 8.sp)
                            Text(T("Do not share it. Every view is recorded.", "Không chia sẻ mã. Mỗi lần xem đều được ghi lại."),
                                style = MaterialTheme.typography.bodySmall)
                        } else if (door.str("status") == "Ready") {
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        code = Api.post("/students/me/door-code/reveal").optString("code")
                                    } catch (e: ApiException) {
                                        message = e.message
                                    }
                                }
                            }) { Text(T("Show the code", "Hiện mã")) }
                        }
                    }
                }
            }
            a.str("pass")?.takeIf { a.str("status") != "Resident" }?.let { pass ->
                item {
                    Section(T("Check-in pass", "Thẻ nhận phòng")) {
                        Text(T("Show this code at the desk of your Block.", "Đưa mã này tại quầy của Block."))
                        Image(qr(pass), contentDescription = T("Check-in pass", "Thẻ nhận phòng"),
                            modifier = Modifier.size(220.dp))
                    }
                }
            }
            d.furniture?.optJSONArray("items").objects().takeIf { it.isNotEmpty() }?.let { items ->
                item {
                    Section(T("Furniture", "Nội thất")) {
                        items.forEach { f ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text((if (isVietnamese()) f.str("typeVi") else null) ?: f.optString("type"))
                                Text(f.optString("assetCode") + " · " + label(f.str("status")),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            d.allocation.obj("stay")?.let { stay ->
                item {
                    Section(T("My Stay", "Thời gian lưu trú")) {
                        Line(T("Terms committed", "Số kỳ đăng ký"), stay.optInt("committedTerms").toString())
                        Line(T("Terms used", "Số kỳ đã ở"), stay.optInt("termsUsed").toString())
                        Line(T("Terms left", "Số kỳ còn lại"), stay.optInt("termsLeft").toString())
                    }
                }
            }
            d.allocation.obj("nextTerm")?.let { next ->
                item {
                    val window = next.obj("window")
                    Section(T("Next Term", "Kỳ sau") + " · " + next.obj("term")?.optString("name").orEmpty()) {
                        StatusChip(next.str("state"))
                        next.str("room")?.let { Line(T("Room", "Phòng"), it + " · " + T("Bed ", "Giường ") + next.optString("bed")) }
                        if (next.has("termPrice") && !next.isNull("termPrice")) {
                            Line(T("Price", "Giá"), money(next.optLong("termPrice")))
                        }
                        next.obj("fee")?.let { fee ->
                            Line(T("Next-Term fee", "Phí kỳ sau"), money(fee.optLong("amount")) + " · " + label(fee.str("status")))
                        }
                        window?.let { w ->
                            Line(T("Requests until", "Gửi yêu cầu trước"), moment(w.str("closesAt")))
                            Line(T("Check out by", "Trả phòng trước"), day(w.str("checkOutBy")))
                        }
                        if (window?.optBoolean("filing") == true) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { confirm = "extend" }) { Text(T("Extend 1 Term", "Gia hạn 1 kỳ")) }
                                OutlinedButton(onClick = { confirm = "end" }) { Text(T("End my stay", "Kết thúc lưu trú")) }
                            }
                        }
                    }
                }
            }
        }
    }
    confirm?.let { what ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(if (what == "extend") T("Extend your stay?", "Gia hạn lưu trú?") else T("End your stay?", "Kết thúc lưu trú?")) },
            text = {
                Text(if (what == "extend") T("You stay one more Term; its fee is issued with the next-Term fees.",
                    "Bạn ở thêm một kỳ; phí được phát hành cùng phí kỳ sau.")
                else T("Your Bed of the next Term is released; check out at the desk by the check-out date.",
                    "Giường kỳ sau sẽ được trả lại; hãy trả phòng tại quầy trước hạn trả phòng."))
            },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null
                    if (what == "extend") act("/students/me/stay/extension", JSONObject().put("terms", 1))
                    else act("/students/me/stay/end", JSONObject())
                }) { Text(T("Confirm", "Xác nhận")) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text(T("Cancel", "Huỷ")) } },
        )
    }
}
