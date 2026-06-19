import "server-only";

export const QUERY_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const QUERY_EMBEDDING_DIMENSION = 384;

export interface QueryEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

type FeatureExtractionPipeline = (
  texts: string | string[],
  options: {
    pooling: "mean";
    normalize: boolean;
  },
) => Promise<{
  data: Float32Array | number[];
  dims: number[];
}>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;

export class LocalTransformersQueryEmbedder implements QueryEmbedder {
  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await getFeatureExtractionPipeline();
    const output = await extractor(texts, {
      pooling: "mean",
      normalize: true,
    });

    const rowCount = texts.length;
    const dimension = output.dims.at(-1);

    if (dimension !== QUERY_EMBEDDING_DIMENSION) {
      throw new Error(
        "Query embedding dimension mismatch. The glossary must be re-embedded when the model changes.",
      );
    }

    return splitEmbeddingRows(Array.from(output.data), rowCount, dimension);
  }
}

export function getDefaultQueryEmbedder(): QueryEmbedder {
  return new LocalTransformersQueryEmbedder();
}

async function getFeatureExtractionPipeline(): Promise<FeatureExtractionPipeline> {
  pipelinePromise ??= import("@xenova/transformers").then(
    async ({ env, pipeline }) => {
      env.allowLocalModels = false;

      return (await pipeline(
        "feature-extraction",
        QUERY_EMBEDDING_MODEL,
      )) as FeatureExtractionPipeline;
    },
  );

  return pipelinePromise;
}

function splitEmbeddingRows(
  values: number[],
  rowCount: number,
  dimension: number,
): number[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    values.slice(rowIndex * dimension, (rowIndex + 1) * dimension),
  );
}
