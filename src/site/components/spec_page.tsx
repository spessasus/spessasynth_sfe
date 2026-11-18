import { raw } from "hono/html";
import type { Assets } from "../assets";
import { SPEC_PDF_NAME } from "../names";
import type { SpecDocument } from "../spec";
import { Layout } from "./layout";

/**
 * The specification page, with its sections in the sidebar.
 */
export function SpecPage(props: { spec: SpecDocument; assets: Assets }) {
    const sidebar = (
        <>
            <h3>Sections</h3>
            <ul class="toc">
                {props.spec.headings
                    .filter((h) => h.depth === 2 || h.depth === 3)
                    .map((h) => (
                        <li class={`depth-${h.depth}`}>
                            <a href={`#${h.id}`}>{raw(h.html)}</a>
                        </li>
                    ))}
            </ul>
        </>
    );
    return (
        <Layout
            title="SFe Format"
            page="spec"
            assets={props.assets}
            sidebar={sidebar}
        >
            <a class="download" href={SPEC_PDF_NAME} download>
                Download the PDF version
            </a>
            <article class="spec">{raw(props.spec.html)}</article>
        </Layout>
    );
}
