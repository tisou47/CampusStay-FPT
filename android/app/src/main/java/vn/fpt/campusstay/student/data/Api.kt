package vn.fpt.campusstay.student.data

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import vn.fpt.campusstay.student.BuildConfig
import vn.fpt.campusstay.student.ui.isVietnamese

/**
 * An error answer of the API (`{ message, code?, details? }`, contract "Errors"): [message] is written for the user
 * and shown as is; [fields] are the messages of `details.fields`.
 */
class ApiException(val status: Int, val code: String?, message: String, val fields: Map<String, String> = emptyMap()) :
    Exception(message)

/**
 * The CampusStay API (`docs/api-contract.md`). Every call sends the bearer token and `Accept-Language` (the API
 * answers messages in Vietnamese or English); a `401` signs the student out.
 */
object Api {

    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()

    /** The signed-in student's token; null when signed out. */
    @Volatile
    var token: String? = null

    /** Called (on the IO thread) when the API answers `401`: the session is over. */
    var onSignedOut: () -> Unit = {}

    suspend fun get(path: String): JSONObject = call(Request.Builder().url(url(path)).get())

    suspend fun post(path: String, body: JSONObject = JSONObject()): JSONObject =
        call(Request.Builder().url(url(path)).post(body.toString().toRequestBody(json)))

    suspend fun put(path: String, body: JSONObject): JSONObject =
        call(Request.Builder().url(url(path)).put(body.toString().toRequestBody(json)))

    /** A `multipart/form-data` POST of text fields (contract "Uploads"). */
    suspend fun multipart(path: String, fields: Map<String, String>): JSONObject {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
        fields.forEach { (name, value) -> body.addFormDataPart(name, value) }
        return call(Request.Builder().url(url(path)).post(body.build()))
    }

    /** The bytes of an image the API links to (the VietQR image of a payment). */
    suspend fun bytes(absoluteUrl: String): ByteArray = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(absoluteUrl).build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            response.body?.bytes() ?: ByteArray(0)
        }
    }

    private fun url(path: String) = BuildConfig.API_BASE_URL.trimEnd('/') + path

    private suspend fun call(builder: Request.Builder): JSONObject = withContext(Dispatchers.IO) {
        builder.header("Accept-Language", if (isVietnamese()) "vi" else "en")
        token?.let { builder.header("Authorization", "Bearer $it") }
        val response = try {
            client.newCall(builder.build()).execute()
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", if (isVietnamese()) "Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại."
            else "Cannot reach the server. Check your connection and try again.")
        }
        response.use {
            val text = it.body?.string().orEmpty()
            val body = if (text.isBlank()) JSONObject() else runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (it.isSuccessful) return@withContext body
            if (it.code == 401 && token != null) {
                token = null
                onSignedOut()
            }
            val fields = mutableMapOf<String, String>()
            body.optJSONObject("details")?.optJSONObject("fields")?.let { f ->
                f.keys().forEach { key -> fields[key] = f.optString(key) }
            }
            throw ApiException(it.code, body.optString("code").ifBlank { null },
                body.optString("message").ifBlank { "HTTP ${it.code}" }, fields)
        }
    }
}
