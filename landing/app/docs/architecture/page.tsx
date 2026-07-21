import { DocPage } from "../_components/doc-page";
import { content } from "../_content/architecture";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="architecture" content={content} />;
}
