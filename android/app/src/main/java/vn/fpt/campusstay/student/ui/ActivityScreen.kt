package vn.fpt.campusstay.student.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.ApiException

/** Activity: the student's requests (maintenance and next-Term requests) and notifications with announcements. */
@Composable
fun ActivityScreen(modifier: Modifier, newRequest: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(0) }
    Column(modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            listOf(T("Requests", "Yêu cầu"), T("Notifications", "Thông báo")).forEachIndexed { i, name ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(name) })
            }
        }
        Box(Modifier.fillMaxSize()) {
            if (tab == 0) Requests() else Notifications()
            if (tab == 0) {
                ExtendedFloatingActionButton(onClick = newRequest, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
                    Text(T("Report a problem", "Báo hỏng"))
                }
            }
        }
    }
}

@Composable
private fun Requests() {
    val state = load("requests") {
        Pair(Api.get("/students/me/requests?kind=maintenance&pageSize=50"),
            Api.get("/students/me/requests?kind=room-changes&pageSize=50"))
    }
    Content(state) { (maintenance, changes) ->
        val items = maintenance.optJSONArray("items").objects().map { it to true } +
            changes.optJSONArray("items").objects().map { it to false }
        LazyColumn(contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (items.isEmpty()) item { Text(T("No request yet.", "Chưa có yêu cầu nào.")) }
            items(items) { (r, isMaintenance) ->
                Section(if (isMaintenance) r.optString("title") else label(r.str("typeLabel")) + " · " + r.optString("summary")) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(r.optString("id") + " · " + moment(r.str(if (isMaintenance) "reportedAt" else "submittedAt")),
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        StatusChip(r.str("status"))
                    }
                    if (isMaintenance) r.str("visitWindow")?.let { Text(T("Visit: ", "Lịch đến: ") + it) }
                    r.obj("decision")?.str("note")?.let { Text(it) }
                }
            }
        }
    }
}

@Composable
private fun Notifications() {
    val state = load("notifications") { Api.get("/notifications?limit=50") }
    val scope = rememberCoroutineScope()
    Content(state) { d ->
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (d.optInt("unread") > 0) {
                item {
                    TextButton(onClick = { scope.launch { runCatching { Api.post("/notifications/read-all") }; state.reload() } }) {
                        Text(T("Mark all as read", "Đánh dấu đã đọc tất cả"))
                    }
                }
            }
            items(d.optJSONArray("items").objects()) { n ->
                Section((if (n.optBoolean("read")) "" else "● ") + n.optString("title")) {
                    Text(n.optString("body"))
                    Text(moment(n.str("createdAt")), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/**
 * Reporting a problem in the student's Room (`POST /maintenance-requests`, multipart): category, where, urgency,
 * optionally the furniture item (A-49); the API checks that the student lives in the Room.
 */
@Composable
fun NewMaintenanceScreen(modifier: Modifier, onDone: () -> Unit) {
    val options = load("maintenance-options") { Api.get("/maintenance-requests/options?for=student") }
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<String?>(null) }
    var location by remember { mutableStateOf<String?>(null) }
    var urgent by remember { mutableStateOf(false) }
    var furniture by remember { mutableStateOf<JSONObject?>(null) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Content(options) { o ->
        Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(T("Report a problem", "Báo hỏng"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Choice(T("Category", "Loại sự cố"), o.optJSONArray("categories").let { a -> (0 until (a?.length() ?: 0)).map { a!!.getString(it) } },
                category, { category = it }, errors["category"])
            Choice(T("Where in the Room", "Vị trí trong phòng"), o.optJSONArray("locations").let { a -> (0 until (a?.length() ?: 0)).map { a!!.getString(it) } },
                location, { location = it }, errors["location"])
            val items = o.optJSONArray("furniture").objects()
            if (items.isNotEmpty()) {
                Choice(T("Furniture item (optional)", "Đồ nội thất (không bắt buộc)"),
                    items.map { ((if (isVietnamese()) it.str("typeVi") else null) ?: it.optString("type")) + " · " + it.optString("assetCode") },
                    furniture?.let { f -> ((if (isVietnamese()) f.str("typeVi") else null) ?: f.optString("type")) + " · " + f.optString("assetCode") },
                    { picked -> furniture = items.firstOrNull { (((if (isVietnamese()) it.str("typeVi") else null) ?: it.optString("type")) + " · " + it.optString("assetCode")) == picked } },
                    errors["furnitureItemId"])
            }
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(T("Title", "Tiêu đề")) },
                isError = errors.containsKey("title"), supportingText = errors["title"]?.let { { Text(it) } }, singleLine = true)
            OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), minLines = 3,
                label = { Text(T("Description", "Mô tả")) }, isError = errors.containsKey("description"),
                supportingText = errors["description"]?.let { { Text(it) } })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !urgent, onClick = { urgent = false }, label = { Text(label("Normal")) })
                FilterChip(selected = urgent, onClick = { urgent = true }, label = { Text(label("Urgent")) })
            }
            message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            val fields = mutableMapOf("title" to title.trim(), "description" to description.trim(),
                                "category" to (category ?: ""), "location" to (location ?: ""),
                                "urgency" to if (urgent) "Urgent" else "Normal", "staffMayEnter" to "true")
                            furniture?.let { fields["furnitureItemId"] = it.optString("id") }
                            Api.multipart("/maintenance-requests", fields)
                            onDone()
                        } catch (e: ApiException) {
                            errors = e.fields
                            message = e.message
                        }
                        busy = false
                    }
                },
                enabled = !busy, modifier = Modifier.fillMaxWidth(),
            ) { Text(T("Send", "Gửi")) }
        }
    }
}

/** A list to choose one value from. */
@Composable
private fun Choice(name: String, values: List<String>, value: String?, onChange: (String) -> Unit, error: String?) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedTextField(value ?: "", {}, Modifier.fillMaxWidth().clickable { open = true }, label = { Text(name) },
            readOnly = true, enabled = false, isError = error != null, supportingText = error?.let { { Text(it) } })
        Box(Modifier.matchParentSize().clickable { open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            values.forEach { v ->
                DropdownMenuItem(text = { Text(v) }, onClick = {
                    onChange(v)
                    open = false
                })
            }
        }
    }
}
