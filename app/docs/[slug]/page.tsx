import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { DOCS_SLUGS, getDocsSection } from "@/lib/docsContent";

export function generateStaticParams() {
  return DOCS_SLUGS.map((slug) => ({ slug }));
}

export default async function DocsSection({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = getDocsSection(slug);
  if (!section) notFound();

  return <DocsLayout section={section} />;
}
