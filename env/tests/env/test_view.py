import asyncio


def get(app, path, query=b""):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(
        app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": query,
                "headers": [],
                "server": ("127.0.0.1", 8000),
                "client": ("127.0.0.1", 1234),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    return (
        messages[0]["status"],
        dict(messages[0]["headers"]),
        b"".join(m.get("body", b"") for m in messages[1:]),
    )
