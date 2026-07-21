import { DocPage } from "../_components/doc-page";
import { content } from "../_content/workflow";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="workflow" content={content} />;
}
