import { listPosts, renderPost } from "@/lib/community/service";
import { PostCard } from "./post-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public community feed, restyled onto MATCHDAY. It still lists shared posts
// newest first and renders each one live by re running the fixed read only queries
// from its stored parameters, so the numbers are always real and current. Public and
// works signed out for viewing.

export default async function CommunityPage() {
  const posts = await listPosts();
  const rendered = await Promise.all(
    posts.map((post) => renderPost(post.kind, post.params)),
  );

  return (
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "760px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          The feed
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
          Community
        </h1>
        <p
          className="md-body"
          style={{ color: "var(--md-text-mid)", marginBottom: "var(--space-6)" }}
        >
          Comparisons, leaderboards, and replays people chose to share. Each post
          stores only its parameters, so the feed re runs the same real queries every
          time and the numbers are always current, never a stored snapshot. Share
          your own from the Compare, Scout, and Replay pages.
        </p>

        {posts.length === 0 ? (
          <p className="md-body" style={{ color: "var(--md-text-mid)" }}>
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
      </div>
    </main>
  );
}
