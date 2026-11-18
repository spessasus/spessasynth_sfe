import { raw } from "hono/html";

export function escapeHtml(text: string) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/**
 * The little Markdown the test texts use: code, bold, italics and links. Code spans are left as they are, and an
 * asterisk next to a space is arithmetic, not italics. Bold or italics can't hold a code span. The text is escaped
 * first, so the result is safe to put into a page as it is.
 */
export function inline(markdown: string) {
    return raw(
        markdown
            .split(/(`[^`]+`)/)
            .map((part) =>
                part.startsWith("`") && part.endsWith("`") && part.length > 1
                    ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
                    : escapeHtml(part)
                          .replaceAll(
                              /\*\*(\S[^*]*?\S|\S)\*\*/g,
                              "<strong>$1</strong>"
                          )
                          .replaceAll(
                              /(^|[^*\w])\*(\S[^*]*?\S|\S)\*(?!\w)/g,
                              "$1<em>$2</em>"
                          )
                          .replaceAll(
                              /\[([^\]]+)\]\(([^)]+)\)/g,
                              '<a href="$2">$1</a>'
                          )
            )
            .join("")
    );
}
