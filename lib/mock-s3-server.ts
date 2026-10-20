import http from "node:http"

export type StoredS3Object = { body: Buffer; contentType: string }

export function startMockS3() {
  const objects = new Map<string, StoredS3Object>()

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(chunk as Buffer))
    req.on("end", () => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`)
      const parts = url.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent)
      const bucket = parts[0] || ""
      const key = parts.slice(1).join("/")
      const id = `${bucket}/${key}`
      const body = Buffer.concat(chunks)

      if (req.method === "PUT") {
        objects.set(id, {
          body,
          contentType: String(req.headers["content-type"] || "application/octet-stream"),
        })
        res.writeHead(200)
        res.end()
        return
      }

      const stored = objects.get(id)
      if (!stored) {
        res.writeHead(404, { "content-type": "application/xml" })
        res.end("<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>")
        return
      }

      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type": stored.contentType,
          "content-length": String(stored.body.length),
        })
        res.end()
        return
      }

      if (req.method === "GET") {
        const range = req.headers.range
        let slice = stored.body
        let status = 200
        const headers: Record<string, string> = { "content-type": stored.contentType }
        if (typeof range === "string" && range.startsWith("bytes=")) {
          const [startRaw, endRaw] = range.slice(6).split("-")
          const start = Number(startRaw)
          const end = endRaw ? Number(endRaw) : stored.body.length - 1
          slice = stored.body.subarray(start, end + 1)
          status = 206
          headers["content-range"] = `bytes ${start}-${start + slice.length - 1}/${stored.body.length}`
        }
        headers["content-length"] = String(slice.length)
        res.writeHead(status, headers)
        res.end(slice)
        return
      }

      res.writeHead(405)
      res.end()
    })
  })

  return new Promise<{
    endpoint: string
    close: () => Promise<void>
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("mock S3 did not bind a port")
      resolve({
        endpoint: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          }),
      })
    })
  })
}

export function pdfBytes() {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
}

export function jpegBytes() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
}
