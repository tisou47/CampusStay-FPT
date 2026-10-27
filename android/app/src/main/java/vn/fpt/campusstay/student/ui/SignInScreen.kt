package vn.fpt.campusstay.student.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.ApiException

/**
 * `POST /auth/sign-in` with the CampusStay account. Only students use the app; back-office accounts are sent to
 * the web. Errors are the API's own messages (contract "Sign-in errors").
 */
@Composable
fun SignInScreen(onSignedIn: (String, JSONObject) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text("CampusStay FPT", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary)
        Text(T("Dormitory of FPT University, Tân Uyên Campus", "Ký túc xá Đại học FPT, cơ sở Tân Uyên"),
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(email, { email = it.trim() }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text(T("Password", "Mật khẩu")) },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        val body = JSONObject().put("email", email).put("password", password).put("remember", true)
                        val result = Api.post("/auth/sign-in", body)
                        val user = result.getJSONObject("user")
                        if (user.optString("role") != "student") {
                            error = T("This app is for students. Staff and Managers use the web.",
                                "Ứng dụng dành cho sinh viên. Nhân viên và Quản lý dùng bản web.")
                        } else {
                            onSignedIn(result.getString("token"), user)
                        }
                    } catch (e: ApiException) {
                        error = e.message
                    }
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) CircularProgressIndicator(Modifier.padding(2.dp)) else Text(T("Sign in", "Đăng nhập"))
        }
        Text(T("Signed up with Google? Set your password on the web first (CampusStay › Sign in with Google).",
            "Đăng ký bằng Google? Hãy đặt mật khẩu trên bản web trước (CampusStay › Đăng nhập bằng Google)."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
