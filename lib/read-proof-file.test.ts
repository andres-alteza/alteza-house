import assert from "node:assert/strict"
import { test } from "node:test"
import { getTranslations } from "./i18n.ts"
import {
  UNREADABLE_FILE_CODE,
  i18nKeyForProofClientError,
  readProofFileForUpload,
} from "./read-proof-file.ts"

function jpegBytes() {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer
}

test("readProofFileForUpload throws unreadable_file when arrayBuffer fails", async () => {
  await assert.rejects(
    () =>
      readProofFileForUpload({
        name: "IMG-20260318-WA0004.jpg",
        type: "image/jpeg",
        arrayBuffer: async () => {
          throw new Error("Failed to read blob")
        },
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, UNREADABLE_FILE_CODE)
      return true
    }
  )
})

test("readProofFileForUpload throws unreadable_file when the file is 0 bytes", async () => {
  await assert.rejects(
    () =>
      readProofFileForUpload({
        name: "IMG-20260318-WA0004.jpg",
        type: "image/jpeg",
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, UNREADABLE_FILE_CODE)
      return true
    }
  )
})

test("UI maps unreadable_file from the error code, not the message text", () => {
  assert.equal(
    i18nKeyForProofClientError({
      code: UNREADABLE_FILE_CODE,
      message: "some other failure text",
    }),
    "payments.unreadableFileError"
  )
  assert.equal(i18nKeyForProofClientError({ message: "unreadable-file" }), null)
  assert.equal(
    i18nKeyForProofClientError({ code: "invalid_proof_key", message: "ignored" }),
    "payments.invalidProofKeyError"
  )

  const es = getTranslations("es")("payments.unreadableFileError")
  const en = getTranslations("en")("payments.unreadableFileError")
  assert.equal(
    es,
    "No pudimos leer esta imagen. Guárdala en tu galería o tómale captura de pantalla y súbela de nuevo."
  )
  assert.equal(
    en,
    "We couldn't read this image. Save it to your gallery or take a screenshot and upload it again."
  )
})

test("readProofFileForUpload returns bytes when the file is readable", async () => {
  const prepared = await readProofFileForUpload({
    name: "proof.jpg",
    type: "image/jpeg",
    arrayBuffer: async () => jpegBytes(),
  })
  assert.equal(prepared.contentType, "image/jpeg")
  assert.equal(prepared.size, 6)
  assert.equal(prepared.filename, "proof.jpg")
})
