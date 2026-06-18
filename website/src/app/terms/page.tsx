import type { Metadata } from "next";

import { LegalPageLayout } from "@/components/LegalPageLayout";
import { HOSTED_LEGAL_DOCS } from "@/content/legal";

const doc = HOSTED_LEGAL_DOCS.terms;

export const metadata: Metadata = {
  title: `${doc.title} — Leap`,
  description: doc.description,
};

export default function TermsPage() {
  return (
    <LegalPageLayout title={doc.title}>
      <article className="legal-prose">{doc.body}</article>
    </LegalPageLayout>
  );
}
