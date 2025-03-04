import { contract } from "@/client/contract";
import { ClientInferResponses } from "@ts-rest/core";

export type Run = ClientInferResponses<
  typeof contract.listRuns,
  200
>["body"][number];

export type RunJob = ClientInferResponses<
  typeof contract.getRunTimeline,
  200
>["body"]["jobs"][number];

export type ClusterDetails = ClientInferResponses<
  typeof contract.getCluster,
  200
>["body"];

export type Cluster = ClientInferResponses<
  typeof contract.listClusters,
  200
>["body"][number];

export type BlobDetails = ClientInferResponses<
  typeof contract.getRunTimeline,
  200
>["body"]["blobs"][number];
