import { DocPage } from "../_components/doc-page";
import { content } from "../_content/strategies";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="strategies" content={content} />;
}
