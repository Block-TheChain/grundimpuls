export async function onRequestGet() {
  const feedUrl = "https://grundimpuls.substack.com/feed";

  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch Substack feed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const xml = await response.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3);

  const posts = items.map((match) => {
    const item = match[1];

    const getTag = (tag) => {
      const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };

    const decode = (str) =>
      str
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');

    return {
      title: decode(getTag("title")),
      link: decode(getTag("link")),
      pubDate: decode(getTag("pubDate")),
      description: decode(getTag("description")).replace(/<[^>]+>/g, "").trim()
    };
  });

  return new Response(JSON.stringify({ posts }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
