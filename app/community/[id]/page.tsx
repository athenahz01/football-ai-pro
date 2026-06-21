import { notFound } from "next/navigation";

import { openPost, renderPost } from "@/lib/community/service";
import { PostCard } from "../post-card";
import { DeletePostButton } from "../delete-post-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single shared post, restyled onto MATCHDAY. Opening it increments the view count
// through the trusted write path, then the post is rendered live from its stored
// parameters by re running the fixed read only queries. The delete control only
// appears when the server decided the session user is the author, and the delete
// endpoint re checks ownership from the session.

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
    <main className="md-screen">
      <div className="md-container" style={{ maxWidth: "640px" }}>
        <span className="md-overline" style={{ color: "var(--md-text-lo)" }}>
          The feed
        </span>
        <h1 className="md-display-3" style={{ margin: "var(--space-2) 0 var(--space-5)" }}>
          Shared post
        </h1>

        <PostCard post={opened.post} rendered={rendered} linkToDetail={false} />

        {opened.isOwner ? (
          <div style={{ marginTop: "var(--space-3)" }}>
            <DeletePostButton id={opened.post.id} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
