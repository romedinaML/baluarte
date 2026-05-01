import { applyLatestReply } from "../utils/applyLatestReply.js";
import { bucketComments } from "../utils/bucketComments.js";
import { buildResponse } from "../utils/buildResponse.js";
import { fetchComments } from "../utils/fetchComments.js";
import { fetchNodes } from "../utils/fetchNodes.js";
import { filterComments } from "../utils/filterComments.js";
import { groupVariants } from "../utils/groupVariants.js";
import type { Buckets } from "../utils/types.js";

export async function getEntitiesFromFigma(fileId: string): Promise<Buckets> {
  const all = await fetchComments(fileId);
  const tagged = filterComments(all);
  const withLatest = applyLatestReply(tagged, all);
  const buckets = bucketComments(withLatest);
  const allIds = [
    ...buckets.layouts,
    ...buckets.molecules,
    ...buckets.atoms,
  ].map((e) => e.node_id);
  const nodesResp = await fetchNodes(fileId, allIds, { depth: 1 });
  return groupVariants(buildResponse(buckets, nodesResp));
}
