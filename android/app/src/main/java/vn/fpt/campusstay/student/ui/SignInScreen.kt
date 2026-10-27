package vn.fpt.campusstay.student.ui

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import org.json.JSONObject
import vn.fpt.campusstay.student.BuildConfig
import vn.fpt.campusstay.student.data.Api
import vn.fpt.campusstay.student.data.ApiException

/**
 * Sign-in with the CampusStay password (`POST /auth/sign-in`) or with Google (`POST /auth/google` with the ID
 * token, spec §6.1: only `@fpt.edu.vn` accounts; an unknown one signs up as a student). Only students use the app.
 */
@Composable
fun SignInScreen(onSignedIn: (String, JSONObject) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun finish(result: JSONObject) {
        val user = result.getJSONObject("user")
        if (user.optString("role") != "student") {
            error = T("This app is for students. Staff and Managers use the web.",
                "Ứng dụng dành cho sinh viên. Nhân viên và Quản lý dùng bản web.")
        } else {
            onSignedIn(result.getString("token"), user)
        }
    }

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
                        finish(Api.post("/auth/sign-in", JSONObject().put("email", email).put("password", password)
                            .put("remember", true)))
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
        if (BuildConfig.GOOGLE_CLIENT_ID.isNotBlank()) {
            OutlinedButton(
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            val idToken = googleIdToken(context)
                            if (idToken != null) {
                                finish(Api.post("/auth/google", JSONObject().put("credential", idToken).put("remember", true)))
                            }
                        } catch (e: ApiException) {
                            error = e.message
                        } catch (e: GetCredentialException) {
                            error = T("Google sign-in is not available on this phone: ", "Không đăng nhập Google được trên máy này: ") +
                                (e.message ?: e.type)
                        }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(T("Sign in with Google (@fpt.edu.vn)", "Đăng nhập bằng Google (@fpt.edu.vn)")) }
        }
    }
}

/** A Google ID token for the web's OAuth client (the API checks its audience); null when the student cancels. */
private suspend fun googleIdToken(context: Context): String? {
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_CLIENT_ID).setHostedDomainFilter("fpt.edu.vn").build()
    return try {
        val result = CredentialManager.create(context)
            .getCredential(context, GetCredentialRequest.Builder().addCredentialOption(option).build())
        GoogleIdTokenCredential.createFrom(result.credential.data).idToken
    } catch (e: GetCredentialCancellationException) {
        null
    }
}

/**
 * The first password of an account made by Google sign-up (spec §6.1 step 3, `POST /auth/password/set`): until it
 * is set, the API answers every other call with `403 PASSWORD_REQUIRED`. Same rule as the web: 8–64 characters with
 * a letter and a number, not containing the email name.
 */
@Composable
fun SetPasswordScreen(email: String, onDone: () -> Unit, onSignOut: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)) {
        Text(T("Set your CampusStay password", "Đặt mật khẩu CampusStay"), style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold)
        Text(T("You signed up with Google as $email. Choose a password to use CampusStay.",
            "Bạn đã đăng ký bằng Google với $email. Hãy chọn mật khẩu để dùng CampusStay."))
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text(T("New password", "Mật khẩu mới")) },
            singleLine = true, visualTransformation = PasswordVisualTransformation())
        OutlinedTextField(again, { again = it }, Modifier.fillMaxWidth(), label = { Text(T("Repeat the password", "Nhập lại mật khẩu")) },
            singleLine = true, visualTransformation = PasswordVisualTransformation())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                if (password != again) {
                    error = T("The two passwords differ.", "Hai mật khẩu không khớp.")
                    return@Button
                }
                busy = true
                error = null
                scope.launch {
                    try {
                        Api.post("/auth/password/set", JSONObject().put("newPassword", password))
                        onDone()
                    } catch (e: ApiException) {
                        if (e.code == "PASSWORD_ALREADY_SET") onDone() else error = e.fields["newPassword"] ?: e.message
                    }
                    busy = false
                }
            },
            enabled = !busy && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(T("Save the password", "Lưu mật khẩu")) }
        OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text(T("Sign out", "Đăng xuất")) }
    }
}
