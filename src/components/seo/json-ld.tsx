/**
 * Renders schema.org structured data. `<` is escaped so content can never close the
 * script tag (the data is static, but this keeps the component safe by construction).
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
