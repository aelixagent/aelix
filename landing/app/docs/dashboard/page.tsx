import { DocPage } from "../_components/doc-page";
import { content } from "../_content/dashboard";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return <DocPage slug="dashboard" content={content} />;
}
