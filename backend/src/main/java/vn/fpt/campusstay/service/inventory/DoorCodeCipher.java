package vn.fpt.campusstay.service.inventory;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Encrypts door codes for the database (spec §6.8, ADR-23): AES-256-GCM with a random 96-bit nonce per
 * code, stored as {@code base64(nonce ‖ ciphertext ‖ tag)}. The key is {@code DOOR_CODE_KEY} (base64 of 32
 * random bytes, generated on the server and never printed); without it every door code operation answers
 * {@code 503 DOOR_CODES_DISABLED}, so a server that has no key yet still starts.
 */
@Component
class DoorCodeCipher {

    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    DoorCodeCipher(@Value("${campusstay.door-codes.key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            this.key = null;
            return;
        }
        byte[] bytes = Base64.getDecoder().decode(base64Key.trim());
        if (bytes.length != 32) {
            throw new IllegalStateException("DOOR_CODE_KEY must be the base64 of 32 bytes");
        }
        this.key = new SecretKeySpec(bytes, "AES");
    }

    /** A key is set ({@code DOOR_CODE_KEY}). */
    boolean enabled() {
        return key != null;
    }

    void requireEnabled() {
        if (key == null) {
            throw ApiException.unavailable("DOOR_CODES_DISABLED", "Door codes are not set up on this server yet.");
        }
    }

    String encrypt(String code) {
        requireEnabled();
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] sealed = cipher.doFinal(code.getBytes(StandardCharsets.US_ASCII));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + sealed.length)
                    .put(nonce).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Door code encryption failed", e);
        }
    }

    String decrypt(String stored) {
        requireEnabled();
        try {
            byte[] all = Base64.getDecoder().decode(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, NONCE_BYTES));
            return new String(cipher.doFinal(all, NONCE_BYTES, all.length - NONCE_BYTES), StandardCharsets.US_ASCII);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Door code decryption failed (was DOOR_CODE_KEY changed?)", e);
        }
    }

    /** A random 6-digit code. */
    String random() {
        return String.format("%06d", random.nextInt(1_000_000));
    }
}
