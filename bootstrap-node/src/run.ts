import { Inferable } from "inferable";
import { z } from "zod";
import { exec } from "child_process";

const client = new Inferable({
  apiSecret: process.env.INFERABLE_API_SECRET,
});

const postsSchema = z.object({
  id: z.string().describe("The id of the post"),
  title: z.string().describe("The title of the post"),
  points: z.string().describe("The key points from the comments"),
  commentsUrl: z
    .string()
    .describe(
      "The URL of the comments. This is typically https://news.ycombinator.com/item?id=<post-id>",
    ),
});

// Trigger a Run programmatically
// https://docs.inferable.ai/pages/runs

const extract = async () =>
  client
    .run({
      initialPrompt: `
  Hacker News has a homepage at https://news.ycombinator.com/
  Each post has a id, title, a link, and a score, and is voted on by users.
  Score the top 10 posts and pick the top 3 according to the internal scoring function.
  `,
      resultSchema: z.object({
        posts: postsSchema.array(),
      }),
      callSummarization: false,
    })
    .then(
      (r) =>
        r.poll() as Promise<{
          result: {
            posts?: z.infer<typeof postsSchema>[];
          };
        }>,
    );

const summarizePost = async ({ data }: { data: object }) =>
  client
    .run({
      initialPrompt: `
      <data>
        ${JSON.stringify(data).substring(0, 20_000)}
      </data>

      You are given a post from Hacker News, and a url for the post's comments.
      Summarize the comments. You should visit the comments URL to get the comments.
      Produce a list of the key points from the comments.
      `,
      resultSchema: z.object({
        id: z.string().describe("The id of the post"),
        title: z.string().describe("The title of the post"),
        keyPoints: z
          .array(z.string())
          .describe("The key points from the comments"),
      }),
    })
    .then((r) => r.poll());

const generatePage = async ({ data }: { data: object }) =>
  client
    .run({
      initialPrompt: `
      <data>
        ${JSON.stringify(data)}
      </data>

      You are given a list of posts from Hacker News, and a summary of the comments for each post.

      Generate a web page with the following structure:
      - A header with the title of the page
      - A list of posts, with the title, a link to the post, and the key points from the comments in a ul
      - A footer with a link to the original Hacker News page
  `,
      resultSchema: z.object({
        pagePath: z.string().describe("The path of the generated web page"),
      }),
    })
    .then((r) => r.poll());

const url = process.env.INFERABLE_CLUSTER_ID
  ? `https://app.inferable.ai/clusters/${process.env.INFERABLE_CLUSTER_ID}/runs`
  : "https://app.inferable.ai/clusters";

// open the page in the browser
exec(`open ${url}`, (error) => {
  if (error) {
    console.error("Failed to open browser:", error);
  }
});

extract()
  .then(({ result }) => {
    if (!result.posts) {
      throw new Error("No posts found");
    }

    return Promise.all(
      result.posts.map((post) => summarizePost({ data: post })),
    );
  })
  .then((result) => {
    return generatePage({ data: result });
  })
  .then((result) => {
    console.log("Generated page", result);
  });
