// Runs only in the headless page that is printed to the PDF, never on the site

declare const Paged: {
    Handler: new (...args: unknown[]) => object;
    registerHandlers: (...handlers: unknown[]) => void;
};

/**
 * Keeps the header row of a table with its rows. Paged.js continues a long table on the next page without its
 * header, and it may end a page with a header and no rows below it.
 */
class TableHeaders extends Paged.Handler {
    /**
     * Puts the header back on a page that continues a table, while the page is still being filled, so the header
     * counts toward the height of the page.
     */
    public renderNode(clone: Node, node: Node) {
        if (
            !(clone instanceof HTMLTableRowElement) ||
            !(node instanceof HTMLTableRowElement)
        )
            return;
        const table = clone.closest("table");
        const head = node.closest("table")?.tHead;
        if (!table || !head || table.tHead || node.parentElement === head)
            return;
        table.prepend(head.cloneNode(true));
    }

    /**
     * When the page would break before the first body row of a table, it breaks before the table instead, and
     * before the headings right above it. A table at the top of the page is left alone, as moving it would not help.
     */
    public onOverflow(overflow: Range | undefined, rendered: HTMLElement) {
        if (!overflow) return;
        const container = overflow.startContainer;
        const start =
            container.nodeType === Node.ELEMENT_NODE
                ? (container.childNodes[overflow.startOffset] ?? container)
                : container.parentNode;
        const table =
            start instanceof Element ? start.closest("table") : undefined;
        if (!table?.tHead) return;
        // A body row that ends before the break means the header is not alone
        for (const body of table.tBodies)
            for (const row of body.rows) {
                const after =
                    Array.prototype.indexOf.call(body.childNodes, row) + 1;
                if (
                    overflow.comparePoint(body, after) < 0 ||
                    (overflow.startContainer === body &&
                        overflow.startOffset === after)
                )
                    return;
            }
        let block: Element = table.closest(".table") ?? table;
        while (block.previousElementSibling?.matches("h1, h2, h3, h4, h5, h6"))
            block = block.previousElementSibling;
        const before = document.createRange();
        before.setStart(rendered, 0);
        before.setEndBefore(block);
        if (before.toString().trim() === "") return;
        const moved = document.createRange();
        moved.setStartBefore(block);
        moved.setEnd(overflow.endContainer, overflow.endOffset);
        return moved;
    }
}

Paged.registerHandlers(TableHeaders);
