import { DocPage } from "../_components/doc-page";
import { JsonLd, faqJsonLd } from "../_components/structured-data";
import { content } from "../_content/faq";

export const metadata = { title: content.title, description: content.description };

export default function Page() {
  return (
    <>
      <JsonLd data={faqJsonLd(content)} />
      <DocPage slug="faq" content={content} />
    </>
  );
}
