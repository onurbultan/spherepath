import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Read every page without silently dropping tenants with larger inventories. */
export async function readQueryPages(query: Query): Promise<QueryDocumentSnapshot[]> {
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const ordered = query.orderBy(FieldPath.documentId());
    const page = await (cursor ? ordered.startAfter(cursor) : ordered).limit(500).get();
    documents.push(...page.docs);
    if (page.size < 500) return documents;
    cursor = page.docs.at(-1);
  }
}
