import Link from "next/link";

import { listPosts, renderPost } from "@/lib/community/service";
import { PostCard } from "./post-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public community feed. It lists shared posts newest first and renders each one
// live by re running the fixed read only queries from its stored parameters, so the
// numbers are always real and current, never a stored snapshot. It is public and
// works signed out for viewing.

export default async function CommunityPage() {
  const posts = await listPosts();
  const rendered = await Promise.all(
    posts.map((post) => renderPost(post.kind, post.params)),
  );

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <Link href="/ask" style={styles.navLink}>
          Ask
        </Link>
        <Link href="/compare" style={styles.navLink}>
          Compare
        </Link>
        <Link href="/scout" style={styles.navLink}>
          Scout
        </Link>
        <Link href="/replay" style={styles.navLink}>
          Replay
        </Link>
      </nav>

      <h1 style={styles.title}>Community</h1>
      <p style={styles.subtitle}>
        Comparisons, leaderboards, and replays people chose to share. Each post stores
        only its parameters, so the feed re runs the same real queries every time and
        the numbers are always current, never a stored snapshot. Share your own from
        the Compare, Scout, and Replay pages.
      </p>

      {posts.length === 0 ? (
        <p style={styles.empty}>
          No one has shared anything yet. Build a comparison, a leaderboard, or a
          replay, then share it to start the feed.
        </p>
      ) : (
        posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            rendered={rendered[index]}
            linkToDetail
          />
        ))
      )}
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
  title: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#555", marginBottom: "24px", lineHeight: 1.5 },
  empty: { color: "#555", lineHeight: 1.5 },
};
