import httpx


async def read_website(url: str, client: httpx.AsyncClient, api_key: str | None = None) -> str:
    headers = {"Accept": "text/markdown"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    response = await client.get(f"https://r.jina.ai/{url}", headers=headers, timeout=15.0)
    response.raise_for_status()
    return response.text[:12000]
