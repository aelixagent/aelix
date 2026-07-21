import { DocPage } from "../_components/doc-page";
import { content } from "../_content/guardrails";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="guardrails" content={content} />;
}
