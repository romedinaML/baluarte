import { applyLatestReply } from "../utils/applyLatestReply.js";
import { bucketAnnotations } from "../utils/bucketAnnotations.js";
import { bucketComments } from "../utils/bucketComments.js";
import { buildResponse } from "../utils/buildResponse.js";
import { fetchAnnotations } from "../utils/fetchAnnotations.js";
import { fetchComments } from "../utils/fetchComments.js";
import { fetchNodes } from "../utils/fetchNodes.js";
import { filterAnnotations } from "../utils/filterAnnotations.js";
import { filterComments } from "../utils/filterComments.js";
import { groupVariants } from "../utils/groupVariants.js";
import type { Buckets, Entry } from "../utils/types.js";

/**
 * Annotation-wins merge. Across all kinds, any node_id that appears in the
 * annotation buckets fully replaces its comment-derived twin (including when
 * the comment classified the same node under a different kind). Comment
 * entries on nodes with no annotation pass through untouched.
 */
function mergeAnnotationWins(
  comments: Buckets,
  annotations: Buckets,
): Buckets {
  const annotated = new Set<string>();
  for (const e of annotations.layouts) annotated.add(e.node_id);
  for (const e of annotations.molecules) annotated.add(e.node_id);
  for (const e of annotations.atoms) annotated.add(e.node_id);
  const drop = (entries: Entry[]) =>
    entries.filter((e) => !annotated.has(e.node_id));
  return {
    layouts: [...drop(comments.layouts), ...annotations.layouts],
    molecules: [...drop(comments.molecules), ...annotations.molecules],
    atoms: [...drop(comments.atoms), ...annotations.atoms],
  };
}

export async function getEntitiesFromFigma(fileId: string): Promise<Buckets> {
  const [allComments, allAnnotations] = await Promise.all([
    fetchComments(fileId),
    fetchAnnotations(fileId),
  ]);

  const taggedComments = filterComments(allComments);
  const withLatest = applyLatestReply(taggedComments, allComments);
  const commentBuckets = bucketComments(withLatest);

  const taggedAnnotations = filterAnnotations(allAnnotations);
  const annotationBuckets = bucketAnnotations(taggedAnnotations);

  const buckets = mergeAnnotationWins(commentBuckets, annotationBuckets);

  const allIds = [
    ...buckets.layouts,
    ...buckets.molecules,
    ...buckets.atoms,
  ].map((e) => e.node_id);
  const nodesResp = await fetchNodes(fileId, allIds, { depth: 1 });
  return groupVariants(buildResponse(buckets, nodesResp));
}
