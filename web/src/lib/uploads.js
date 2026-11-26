/**
 * Photos the API takes (WEB-STU-20): JPEG or PNG (checked by their bytes on the server) up to the multipart limit
 * of 5 MB (backend application.yml spring.servlet.multipart.max-file-size). Checking first saves a student from
 * filling in a whole form and then getting a server error.
 */
export const PHOTO_MAX_MB = 5
export const PHOTO_TYPES = ['image/jpeg', 'image/png']
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',')

/** Why `file` cannot be uploaded: 'type', 'size', or null when it can. */
export function photoProblem(file) {
  if (!file || !PHOTO_TYPES.includes(file.type)) return 'type'
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return 'size'
  return null
}
