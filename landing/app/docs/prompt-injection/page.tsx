import { DocPage } from "../_components/doc-page";
import { content } from "../_content/prompt-injection";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="prompt-injection" content={content} />;
}
