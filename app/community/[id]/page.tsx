import Link from "next/link";
import { notFound } from "next/navigation";

import { openPost, renderPost } from "@/lib/community/service";
import { PostCard } from "../post-card";
import { DeletePostButton } from "../delete-post-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single shared post. Opening it increments the view count through the trusted
// write path, then the post is rendered live from its stored parameters by re
// running the fixed read only queries. The delete control only appears when the
// server decided the session user is the author, and the delete endpoint re checks
// ownership from the session.

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opened = await openPost(id);

  if (opened === null) {
    notFound();
  }

  const rendered = await renderPost(opened.post.kind, opened.post.params);

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <Link href="/community" style={styles.navLink}>
          Community
        </Link>
        <Link href="/ask" style={styles.navLink}>
          Ask
        </Link>
      </nav>

      <h1 style={styles.title}>Shared post</h1>

      <PostCard post={opened.post} rendered={rendered} linkToDetail={false} />

      {opened.isOwner ? (
        <div style={styles.ownerRow}>
          <DeletePostButton id={opened.post.id} />
        </div>
      ) : null}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "32px 24px 48px",
    fontFamily: "system-ui, sans-serif",
    color: "#111",
  },
  nav: { display: "flex", gap: "16px", marginBottom: "16px", fontSize: "14px" },
  navLink: { color: "#333" },
  title: { fontSize: "24px", fontWeight: 700, marginBottom: "16px" },
  ownerRow: { marginTop: "8px" },
};
